# Architecture

## Components

- **`packages/core`** — pure, dependency-light TypeScript. No filesystem, no network. This is
  the protocol: crypto (Ed25519 via `@noble/ed25519`, hashing via `@noble/hashes`), addresses,
  UTXO transactions, blocks, merkle trees, proof-of-work, reward schedule, chain validation
  (`validateBlock`), and mempool logic. Runs identically in Node and in the browser, which is
  what lets the web wallet sign transactions client-side using the exact same code the server
  uses to validate them.

- **`server`** — a long-running Node.js process (Express + `ws`). Owns: the authoritative chain
  state (`SgkNode`), a JSON-file-backed `ChainStore`, the REST/WebSocket API, and the background
  auto-miner. This is what you deploy to Render.

- **`web`** — Next.js app (App Router). Server components fetch read-only chain data from the
  node's REST API for the explorer pages. The wallet page is a client component: it generates
  and stores keys in browser `localStorage`, and signs transactions locally before sending only
  the signed transaction (never the private key) to the node.

- **`cli-wallet`** — same signing logic, different UI: a terminal tool.

## Data flow for a transfer

1. Wallet (CLI or browser) fetches the sender's UTXOs from `GET /api/address/:address`.
2. Wallet builds and signs a transaction locally (`buildTransaction` in `packages/core`).
3. Wallet POSTs the signed transaction to `POST /api/tx`.
4. Node re-validates it from scratch against live UTXO state (`validateTransactionAgainstUtxoSet`)
   and, if valid, adds it to the mempool. A transaction is never trusted just because a client
   claims it's valid.
5. The auto-miner selects mempool transactions, builds a coinbase, searches for a valid
   proof-of-work nonce, and — only if the resulting block passes full `validateBlock` — applies
   it to the UTXO set and appends it to the chain.
6. The explorer's server components and the wallet's balance check both read the same live
   UTXO state via the REST API.

## Why this shape, given the free-tier constraints

Render's free web services are a real, persistent Node.js process while warm — which is what
lets `SgkNode` hold in-memory chain state and run a genuine PoW loop, something a stateless
serverless function (e.g. a Vercel API route) cannot do. Vercel, in turn, is excellent at what
this project needs from it: a fast, free, always-buildable static/SSR frontend. Splitting the
two is what makes "real chain + $0 always" possible at all — see `docs/LIMITATIONS.md` for the
tradeoffs that split still carries.
