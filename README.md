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

## What's in this challenge

- `core/` — the SGK protocol library (crypto, addresses, UTXO transactions, blocks), untouched
- `server/` — the compromised node (ships to players)
- `web/` — a read-only SOC monitoring dashboard for the node (deploy to Vercel; optional —
  the challenge is fully solvable via API/scripts alone, this is just a nicer way to watch the
  chain state and check balances/vault status without curl)
- `solve/solve.mjs` — reference exploit (Node.js)
- `solve/solver.py` — independent Python reference exploit — reimplements the address/signing
  wire format from scratch (does not import `core/`), included specifically to prove the format
  is genuinely documented and reproducible rather than something only the JS client gets right
- `VULNERABILITY.patch` — a real, `git apply`-able unified diff of the actual vulnerable code
  change (`git format-patch` output, not a narrative reconstruction)
- `LEAKED_PATCH_NOTES.md` / `VAULT_SCHEMATICS.md` — the in-fiction discovery hints given to players
- `render.yaml` — Render blueprint for the node

## Deploying

**Node (Render, required):**
```
Build Command: npm install --prefix core && npm run build --prefix core && npm install --prefix server && npm run build --prefix server
Start Command: node server/dist/server.js
```
Matches `render.yaml` if deploying via Blueprint.

**Dashboard (Vercel, optional):**
- Root Directory: `web`
- Env var: `NEXT_PUBLIC_GL_NODE_URL` = your Render node's URL
- `web/vercel.json` handles building `core/` before Next.js automatically — no build command
  overrides needed.


## Vault unlock, and closing a bypass I found during testing

`POST /api/vault/unlock` now requires a signature proving ownership of the balance-holding
address (`sign("unlock-vault:" + address)`), not just a balance check. Without this, the treasury
address itself — which starts at exactly the threshold amount by construction — could be handed
straight to the unlock endpoint with zero exploitation. `GET /api/vault/status` is the safe,
proof-free variant the dashboard uses to show sealed/unsealed state without leaking the ciphertext.

Relatedly: mining rewards are paid to a separate `MINING_REWARD_ADDRESS`, never to the treasury.
If they went to the treasury, its balance would climb past the threshold on its own from block
rewards alone, defeating the challenge without anyone touching `/api/tx/v2`. Both of these were
real bugs caught by actually running the exploit end-to-end during development, not just reasoned
about — worth verifying again if you change the reward schedule or threshold amount.

## Design notes (for the challenge author, not players)

The vulnerability is a genuine, realistic bug class: an ownership check silently dropped from one
code path while a sibling path (`/api/tx`) keeps it. This mirrors real incidents where a
"performance" or "compatibility" fast path quietly drops a security invariant that the original,
slower path enforced — the fix is never to the cryptographic primitives (Ed25519 signing/
verification here is untouched and correct), it's to the integration logic deciding *what* the
signature is supposed to prove. Confirmed during testing that the honest `/api/tx` endpoint
correctly rejects the identical forged transaction with `signer does not own referenced output`,
so the challenge isn't "the whole chain is broken" — it's "one specific endpoint is."
