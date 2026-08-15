# Security

## What's covered

- **Replay / double-spend**: every transaction is re-validated against the *live* UTXO set both
  at mempool-entry (`Mempool.accept`) and again at block-inclusion time
  (`validateTransactionAgainstUtxoSet` inside `validateBlock`). A transaction accepted once into
  the mempool is never assumed still valid — see `docs/ARCHITECTURE.md` for the data flow.
- **Forged signatures**: `pubKeyMatchesAddress` confirms the spending key actually hashes to the
  address that locked the referenced output, and `verify()` checks the Ed25519 signature over the
  canonical (signature-blanked) transaction payload. Both are exercised in
  `packages/core/src/chain.test.ts`.
- **Integer overflow / negative amounts**: all amounts are `bigint`, checked `> 0`, and checked
  against `MAX_SUPPLY` at every output — see `validateTransactionStructure`.
- **Invalid blocks**: `validateBlock` checks, in order: previous-hash linkage, timestamp bounds,
  configured difficulty, actual PoW satisfaction, per-transaction validity, merkle root match,
  single-coinbase-first structure, and a coinbase-amount ceiling of `reward + fees`.
- **Wallet key exposure**: the CLI wallet writes keys to a local file with `0o600` permissions and
  never transmits them. The browser wallet generates/signs entirely client-side (`web/lib/wallet.ts`)
  and only ever sends the signed transaction (public key + signature), never the private key.
  Neither wallet logs private keys, seed material, or passwords.
- **RPC / faucet abuse**: mutating endpoints (`/api/tx`, `/api/mine`, `/api/faucet`) are
  rate-limited per IP. The faucet additionally enforces a per-address cooldown and is
  structurally disabled whenever `SGK_NETWORK=sgk-mainnet`, regardless of other config.
- **Malformed input**: addresses are validated (checksum + network + length) before use;
  transaction bodies are structurally validated before touching UTXO state; malformed JSON
  bodies return `400` rather than throwing unhandled.

## What's explicitly out of scope here (see `docs/LIMITATIONS.md`)

Peer-to-peer message handling, since there is no P2P layer in this delivery — so peer-abuse,
message-flooding, and eclipse-attack considerations that would apply to a P2P node don't apply
to this single-node deployment, but also aren't "solved," just not yet relevant.

## Operational notes

- Never commit `.env` files or the CLI wallet's `~/.sgk-wallet/wallet.json` — both are already
  covered by `.gitignore`.
- The server's devnet convenience miner wallet (`server/data/miner-wallet.json`, auto-generated
  if `SGK_MINER_ADDRESS` isn't set) stores a plaintext private key on disk *by design*, so a
  freshly deployed devnet node has somewhere to send its own mining rewards. This is explicitly
  a devnet/testnet convenience — set `SGK_MINER_ADDRESS` to a real wallet you control for
  anything beyond casual local testing, and never reuse that convenience wallet for funds you
  care about.
- This is an educational/testnet protocol. Nothing here should be used to hold real value.
