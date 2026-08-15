# Limitations — read this before deploying

This project prioritizes **real, verifiable primitives over feature-complete deception**. Some
things from the original 40-section spec are genuinely built and tested; others are explicitly
out of scope for a $0 Render+Vercel deployment and are labeled `NOT IMPLEMENTED` rather than
faked. This doc says exactly what's real, what's missing, and why.

## What's real and tested

- Ed25519 keypairs, signing, verification (audited `@noble/ed25519`, not hand-rolled)
- SGK address format: network byte + pubkey hash + double-SHA256 checksum, Base58Check-style
- UTXO transaction model: real signing, real verification, real double-spend rejection
  (both intra-block and via mempool conflict), real overspend rejection, `bigint` amounts with
  an enforced max-supply ceiling (no float precision or overflow path to inflate supply)
- Genesis block generation, deterministic from config (no `Date.now()` in consensus-relevant code)
- Block structure, merkle trees, real proof-of-work (nonce search + difficulty verification)
- Reward schedule with halving, verified never to exceed `MAX_SUPPLY`
- Full block validation pipeline (`validateBlock`): previous-hash linkage, timestamp bounds,
  difficulty, PoW, merkle root, per-transaction UTXO validation, coinbase-amount ceiling
- Mempool that independently re-validates every transaction, never trusting prior acceptance
- REST API, WebSocket events, rate limiting on mutating endpoints
- CLI wallet and browser wallet, both signing client-side — private keys never transmitted
- Testnet/devnet faucet with per-address cooldown, structurally disabled on mainnet

## What's NOT implemented

**Peer-to-peer networking.** There is no `VERSION`/`VERACK`/`GETHEADERS`/etc. message protocol,
no peer discovery, no inbound P2P listener. This is a **single authoritative node**, not a
decentralized network. Real P2P needs a process that can hold open TCP/QUIC sockets and accept
inbound connections indefinitely — genuinely possible on a paid VM or an always-on free-tier
compute option (e.g. an Oracle Cloud Always Free instance), but not something that fits inside
"Vercel-hosted, zero maintenance" the way this deployment is scoped. Building it is mechanical
extension of this codebase (the message types and validation hooks it would need are anticipated
in `packages/core`'s clean separation of validation from application), just genuinely out of
scope for this delivery.

**Multi-node sync, fork resolution, chain reorg.** Follows directly from the above — with one
node there's only one chain, so there's nothing to reconcile. Not faked with placeholder logic;
just absent.

**RocksDB/SQLite-grade storage.** State persists to plain JSON files (`server/src/storage.ts`).
This is genuinely durable while the process is warm, and correctly round-trips `bigint` amounts,
but it's not crash-safe under concurrent writes the way a real embedded database's WAL would be,
and it doesn't scale past a modest UTXO set size. Swapping it for SQLite (or Postgres) is a
contained change — the `ChainStore` interface is deliberately narrow for exactly this reason.

## Render free tier, specifically

- **Spins down after ~15 minutes with no inbound HTTP traffic.** The auto-miner (and anyone
  waiting on a transaction) pauses while asleep and resumes once a request wakes the instance
  (~30-60s cold start). This is not "always mining" in the way a dedicated server would be.
- **No persistent disk on the free plan.** Chain data survives while the instance stays warm —
  including across the idle spin-down/wake cycle, since that stops the process rather than
  destroying the container — but a **redeploy wipes it**, and you restart from genesis. If you
  need state to survive redeploys, either attach a paid persistent disk, or point
  `server/src/storage.ts` at an external database.
- **Postgres free tier (if you add one) expires after 30 days.** Not used by default here for
  exactly that reason.

## Vercel

Vercel hosts the frontend correctly and is genuinely free and always-on for that purpose —
Next.js SSR/static pages are exactly what serverless functions are good at. It is **not**, and
cannot be, where the chain itself runs (see `docs/ARCHITECTURE.md` for why).

## If you want the full original spec

The honest path is: keep `packages/core` as-is (it's real and tested), and extend `server` with
a P2P module (TCP or WebSocket-based peer connections, the message types listed in the original
spec, header-first sync, and fork-choice-by-cumulative-work) running on a host that can hold
persistent inbound connections — a small always-on VM rather than a spin-down free web service.
That's a genuinely separate, multi-week project from what's delivered here.
