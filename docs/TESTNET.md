# Running a testnet/devnet node

## Networks

- `sgk-devnet` — for local development. Faucet enabled.
- `sgk-testnet` — for a publicly reachable node (e.g. deployed to Render). Faucet enabled.
- `sgk-mainnet` — faucet is **structurally disabled** regardless of `SGK_FAUCET_ENABLED`.

Set `SGK_NETWORK` accordingly on the server, and `NEXT_PUBLIC_SGK_NETWORK_MODE` /
`SGK_NETWORK_MODE` to match on the frontend/CLI wallet — addresses are network-tagged, so a
devnet address won't validate as a testnet address, deliberately.

## Getting coins

```bash
curl -X POST https://your-node.onrender.com/api/faucet \
  -H "Content-Type: application/json" \
  -d '{"address":"<your sgk address>"}'
```

Or use the "Request Testnet Coins" button on the `/wallet` page of the deployed explorer.
Cooldown is per-address, configurable via `SGK_FAUCET_COOLDOWN_SECONDS` (default 1 hour).

## Difficulty

`SGK_DIFFICULTY` is the number of required leading zero **bits**. Higher values mean slower
mining. For a single free-tier instance, keep this low enough that the auto-miner finds blocks
in a reasonable time — 16-20 is a reasonable starting range; tune based on observed block times
via `/api/blocks/latest`.

## Multi-node devnet

Not implemented in this delivery — see `docs/LIMITATIONS.md`. Everything here runs against a
single node. If you extend this into real P2P, `scripts/start-devnet.sh` (three nodes on
different ports, auto-connected) would be the natural next addition — the port/config
conventions from the original spec (P2P 30301-30303, RPC 8541-8543) are a reasonable starting
point for that work.
