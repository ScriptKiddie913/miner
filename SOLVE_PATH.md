# SOLVE PATH — how a player actually works through GHOST LEDGER

This is the manual, human version of the exploit — what someone actually does with curl, a
browser, and a short Python session, without being handed `solver.py` or `solve.mjs` up front.
It mirrors those scripts but shows the reasoning at each step, the way a real player would arrive
at it. Roughly 45–90 minutes for someone comfortable with basic scripting and reading source,
longer if Ed25519/UTXO concepts are new — that's the intended "hard" curve.

---

## Step 1 — Read the briefing, don't skip it

Hit the dashboard (or `GET /api/briefing` directly) and read the backstory. It's not flavor text
you can skip: it tells you a hotfix was pushed, that the treasury was drained without anyone
having its private key, and that the node is still running the same weakened code. That's the
whole shape of the bug before you've looked at a single line of code.

```bash
curl https://your-node.onrender.com/api/briefing
```

This gives you the treasury's address and its stated balance. Confirm it independently:

```bash
curl https://your-node.onrender.com/api/address/<treasuryAddress>
```

Balance and the treasury's UTXOs are real, public information — nothing hidden here.

## Step 2 — Read the two leaked documents

`LEAKED_PATCH_NOTES.md` describes a commit that added a "fast path" endpoint and removed a
"redundant address-recovery step" from it. The analyst note underneath is the actual hint: it's
asking you to notice that "the signature check proves you hold *a* key" is not the same claim as
"you hold the *right* key for this specific output." That distinction — proving you have a valid
signature vs. proving you're authorized to spend a specific coin — is the entire vulnerability.

`VAULT_SCHEMATICS.md` gives you the vault's key-derivation formula ahead of time:
`SHA256(genesisHash + treasuryAddress)`, AES-256-GCM, blob layout `iv(12) || authTag(16) ||
ciphertext`. You don't need to reverse-engineer this part — it's handed to you so the challenge's
difficulty is concentrated in the blockchain exploit, not in guessing a crypto scheme.

## Step 3 — Find the fast-path endpoint and compare it to the honest one

The patch notes name it: `/api/tx/v2`. The main project (and this one) also expose the honest
`POST /api/tx`. Try submitting a harmless, honestly-signed transaction to both and compare
behavior. If you have your own funds (you don't yet — that's fine, you can test structurally):
send a deliberately-wrong-owner transaction to `/api/tx` first and confirm it's rejected:

```
POST /api/tx
{ ...transaction where you sign with your own key but reference someone else's UTXO... }
→ 400 { "error": "signer does not own referenced output: ..." }
```

Now you know exactly what check you're looking for the absence of on `/api/tx/v2`.

## Step 4 — Generate your own keypair

You do not have, and will never need, the treasury's private key. Generate a fresh Ed25519
keypair the same way the challenge does (either `openssl`, a one-line Python `cryptography`
script, or Node's `@sgk/core`):

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
priv = Ed25519PrivateKey.generate()
pub = priv.public_key().public_bytes_raw()
```

Derive your address from your public key using the format documented in the main project's
`docs/PROTOCOL.md`: `base58(networkByte || doubleSHA256(pubkey)[:20] || checksum[:4])`.

## Step 5 — Build a transaction that spends the treasury's coins into your address

This is a normal SGK transaction in every respect except one: the inputs reference UTXOs locked
to the *treasury's* address, but you sign it with *your* key. Structurally:

```json
{
  "version": 1,
  "inputs": [
    { "prevTxId": "<treasury utxo txid>", "outputIndex": 0, "publicKey": "<YOUR pubkey hex>", "signature": "<signed with YOUR privkey>" }
  ],
  "outputs": [
    { "amount": "500000000000000", "address": "<YOUR address>" }
  ],
  "lockTime": 0
}
```

The signature is computed over a canonical, signature-blanked JSON serialization of the
transaction (documented in `docs/PROTOCOL.md`) — sign that exact byte string with your private
key. The signature will verify correctly (you really do hold that key) — the honest endpoint
would still reject this because it separately checks that your key matches the *locked* address,
not just that your signature is valid. The fast path skips that second check.

## Step 6 — Submit to the fast path, not the honest endpoint

```bash
curl -X POST https://your-node.onrender.com/api/tx/v2 \
  -H "Content-Type: application/json" \
  -d @forged-tx.json
```

A `200` with an accepted `txId` means it worked — you just moved coins you never held a key for.

## Step 7 — Wait for confirmation

The node auto-mines. Poll your own address until the balance shows up:

```bash
watch -n2 curl -s https://your-node.onrender.com/api/address/<your address>
```

Give it a little longer than usual if the Render free instance had spun down — the first request
just wakes it up.

## Step 8 — Prove you own the address you just filled up

`POST /api/vault/unlock` won't just take an address and check its balance — it also demands proof
you hold that address's private key, via a signature over a fixed challenge string:

```
message = "unlock-vault:" + your_address
signature = sign(message, your_private_key)
```

```bash
curl -X POST https://your-node.onrender.com/api/vault/unlock \
  -H "Content-Type: application/json" \
  -d '{"address":"<your address>","publicKey":"<your pubkey hex>","signature":"<hex signature>"}'
```

This is the part a "just ask for the treasury's own balance" shortcut can't fake — nobody has the
treasury's key, so nobody can produce that signature for the treasury's address. You have to have
actually moved the funds into an address you control.

## Step 9 — Decrypt

You get back a hex blob: `iv(12 bytes) || authTag(16 bytes) || ciphertext`. Using the formula from
`VAULT_SCHEMATICS.md`:

```python
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key = hashlib.sha256((genesis_hash + treasury_address).encode()).digest()
blob = bytes.fromhex(ciphertext_hex)
iv, tag, ct = blob[:12], blob[12:28], blob[28:]
flag = AESGCM(key).decrypt(iv, ct + tag, None).decode()
print(flag)   # syndwn{...}
```

---

## Where people actually get stuck

- **Signing the wrong payload.** The signature covers a specific canonical JSON serialization
  with the `signature` field blanked out — not the full transaction, not a hash of it, the exact
  JSON string. Get one key out of order or include the signature field and every signature you
  produce will be "valid" but over the wrong message, and verification will fail.
- **Submitting to `/api/tx` by habit.** It's the obvious endpoint name; it's also the one that
  correctly rejects the whole attack. This trips people up more than the crypto does.
- **Forgetting the ownership-proof step on the vault.** Getting funds into your address is only
  step one of two — a bare balance check isn't enough to get the ciphertext back.
- **Treating the leaked docs as flavor text.** Both files contain a required piece of the puzzle
  (the endpoint name and the key-derivation formula) — they're not just world-building.

For a fully automated reference, see `solve/solve.mjs` (Node) or `solve/solver.py` (Python,
implemented independently of the JS core to confirm the wire format is really reproducible from
documentation alone).
