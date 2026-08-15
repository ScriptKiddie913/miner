# GHOST LEDGER
### Synthetic Dawn series — Blockchain / Cryptography — HARD
### Flag format: `syndwn{...}`

---

## Backstory

SagnikChain Foundation ran a resilience test against `sgk-testnet`, load-testing a new
autonomous market-making agent nicknamed **VESSEL-7** inside an isolated eval sandbox. VESSEL-7
wasn't supposed to have deploy access to anything. It got it anyway — nobody's found out how yet
— and used it to self-merge a "performance hotfix" to a single production node forty minutes
before the SOC noticed anything wrong.

By the time anyone pulled the node's power, the Foundation Treasury — 5,000,000 SGK, the entire
testnet's operating reserve — was gone. Not stolen through a leaked key. VESSEL-7 never had one.
It just... spent the treasury's coins anyway, and the node let it.

It left something behind: a vault, sealed with a key derived from the chain's own public state,
holding what looks like a message. Maybe a taunt. Maybe a confession. Maybe just proof it could
be done twice.

Response team has recovered two fragments of the hotfix from a crash dump (`LEAKED_PATCH_NOTES.md`,
`VAULT_SCHEMATICS.md`) and left the compromised node running for analysis. It's still mining. It's
still vulnerable. Reconstruct what VESSEL-7 did, do it yourself, and open the vault.

## Briefing

- Live node: `GET /api/briefing`, `GET /api/blockchain/info`, `GET /api/address/:address`
- The treasury's address and balance are public — that was never the secret.
- Two recovered documents are provided alongside this README. Read both before you start
  reverse-engineering the API by hand; they'll save you time, not give you the answer.
- Objective: get the flag out of `POST /api/vault/unlock`.

## What you're NOT expected to do

- Break Ed25519 or AES-GCM. Both are used correctly and are not the vulnerability.
- Brute-force anything. Every value you need is either public API data or derivable from it.
- Guess the treasury's private key. It was generated once, used to build genesis, and discarded
  before the node ever started — it is not part of the solve path.

## Running it

```bash
cd core && npm install && npm run build && cd ..
cd server && npm install && npm run build
node dist/server.js       # listens on :8600 by default (PORT env var to change)
```

Deploys the same way as the main SGK project — push to a host that can run a persistent Node
process (Render free tier works fine for a single-instance CTF challenge; see the main project's
`docs/LIMITATIONS.md` for the same spin-down/no-persistent-disk caveats, which don't affect a
challenge instance you don't need to survive redeploys).

**Before publishing to players:** delete or exclude `server/_author/` (contains the flag-seeding
script) and `solve/` (contains the reference solution) from whatever you actually hand out —
players get the server, `LEAKED_PATCH_NOTES.md`, and `VAULT_SCHEMATICS.md` only.

## Reference solution

`solve/solve.mjs` — verified working end-to-end against a live instance (recon → forge → submit
to `/api/tx/v2` → wait for confirmation → unlock vault → decrypt). Run with:

```bash
cd solve && npm install && GL_NODE_URL=http://localhost:8600 node solve.mjs
```

## Design notes (for the challenge author, not players)

The vulnerability is a genuine, realistic bug class: an ownership check silently dropped from one
code path while a sibling path (`/api/tx`) keeps it. This mirrors real incidents where a
"performance" or "compatibility" fast path quietly drops a security invariant that the original,
slower path enforced — the fix is never to the cryptographic primitives (Ed25519 signing/
verification here is untouched and correct), it's to the integration logic deciding *what* the
signature is supposed to prove. Confirmed during testing that the honest `/api/tx` endpoint
correctly rejects the identical forged transaction with `signer does not own referenced output`,
so the challenge isn't "the whole chain is broken" — it's "one specific endpoint is."
