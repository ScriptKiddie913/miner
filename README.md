# SagnikCoin (SGK) — SagnikChain

A real, working UTXO cryptocurrency: Ed25519 keys, checksummed addresses, signed transactions,
proof-of-work blocks, a halving reward schedule, a mempool, a REST/WebSocket API node, a CLI
wallet, and a Next.js explorer + browser wallet. Verified end-to-end in development (see
`docs/TESTING.md`): faucet → sign → broadcast → mine → balance update, all real, no mocked data.

**Read `docs/LIMITATIONS.md` before you rely on this for anything.** In particular: this is a
**single-node** system (real crypto, real chain, real mining — but no peer-to-peer network yet),
architected to run for $0 on Render (node) + Vercel (frontend).

## Repo layout

```
packages/core/   pure TS: crypto, addresses, transactions, blocks, chain rules, mempool
server/          Express node (REST + WebSocket) — deploy this to Render
cli-wallet/      terminal wallet — sgk-wallet create/balance/send/...
web/             Next.js explorer + browser wallet — deploy this to Vercel
render.yaml      Render blueprint for the node
.env.example     every environment variable, documented
docs/            architecture, protocol, security, limitations, testnet guide
```

## Quickstart (local)

Requires Node.js 20+.

```bash
# 1. build the core library
cd packages/core && npm install && npm run build && npm test && cd ../..

# 2. build and run the node
cd server && npm install && npm run build
SGK_NETWORK=sgk-devnet SGK_DIFFICULTY=12 SGK_AUTO_MINE=true npm start
# -> node listening on :8545, mining blocks in the background
```

In another terminal:

```bash
# 3. create a wallet and request devnet coins
cd cli-wallet && npm install && npm run build
node dist/wallet.js create
node dist/wallet.js address        # copy this address
curl -X POST localhost:8545/api/faucet -H "Content-Type: application/json" \
     -d '{"address":"<paste address>"}'
node dist/wallet.js balance        # wait a few seconds for the next block, then check again
```

```bash
# 4. run the explorer + web wallet
cd web && npm install
NEXT_PUBLIC_SGK_NODE_URL=http://localhost:8545 npm run dev
# open http://localhost:3000
```

## Deploying for real, at $0

### Node → Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. It reads `render.yaml`.
3. Render free tier reality (see `docs/LIMITATIONS.md` for the full explanation):
   - spins down after 15 min idle, ~30-60s cold start on the next request
   - no persistent disk — chain data survives while the instance is warm, but is
     **wiped on redeploy**. Fine for a testnet you're experimenting with; not for
     anything you need to survive every redeploy without a paid disk.
4. Once live, note the URL, e.g. `https://sgk-node.onrender.com`.

### Explorer + wallet → Vercel

1. In Vercel: **New Project**, import the repo, set the **root directory to `web/`**.
2. Add environment variable `NEXT_PUBLIC_SGK_NODE_URL` = your Render URL.
3. Deploy. No API keys required anywhere in this stack.

### CLI wallet, pointed at your deployed node

```bash
SGK_NODE_URL=https://sgk-node.onrender.com SGK_NETWORK_MODE=devnet node cli-wallet/dist/wallet.js balance
```

## Mining

The node auto-mines in the background (`SGK_AUTO_MINE=true`) using real proof-of-work — every
block header hash is checked against the configured difficulty, exactly as validated by
`validateBlock`. You can also trigger a bounded mining attempt on demand:

```bash
curl -X POST localhost:8545/api/mine -H "Content-Type: application/json" -d '{"maxIterations":2000000}'
```

## Testing

```bash
cd packages/core && npm test
```

20 tests covering: address checksum validation (valid/invalid/wrong-network/malformed),
signature verification, forged-signature rejection, double-spend rejection (both within a block
and via mempool conflict), overspend rejection, real proof-of-work satisfaction, the full
halving reward schedule, and max-supply enforcement.

## Status against the original spec

Implemented and verified: cryptography, addresses w/ checksums, UTXO transactions, signing,
blocks, merkle trees, genesis, PoW consensus + validation, reward halving, mempool, node REST
API, WebSocket events, CLI wallet, browser wallet (client-side signing), explorer, testnet
faucet, JSON-file persistence, Render + Vercel deployment.

**Not implemented** (see `docs/LIMITATIONS.md` for why, and what real P2P would need):
peer-to-peer networking, multi-node sync, fork resolution/reorg, RocksDB-grade storage.
These are clearly labeled `NOT IMPLEMENTED` rather than faked, per the project's own
correctness rule.

## Security

See `docs/SECURITY.md`. Short version: private keys never leave the browser/CLI; every
transaction is independently re-validated against live UTXO state at both mempool-entry and
block-inclusion time (a transaction is never trusted just because it was accepted once); amounts
use `bigint` throughout with an enforced max-supply ceiling, so there's no float-precision or
overflow path to inflate supply.
