# Protocol

## Identity

| | |
|---|---|
| Name | SagnikCoin |
| Ticker | SGK |
| Decimals | 8 (1 SGK = 100,000,000 base units) |
| Max supply | 100,000,000 SGK |
| Blockchain | SagnikChain |
| Network IDs | `sgk-mainnet`, `sgk-testnet`, `sgk-devnet` |

## Address format

```
address = base58( networkByte(1) || pubKeyHash(20) || checksum(4) )
pubKeyHash = doubleSha256(publicKey)[0:20]
checksum   = doubleSha256(networkByte || pubKeyHash)[0:4]
```

Network bytes: mainnet `0x1F`, testnet `0x6F`, devnet `0x8F`. Base58Check-style, alphabet
excludes `0`, `O`, `I`, `l`. See `packages/core/src/address.ts` and its test suite for the full
valid/invalid/wrong-checksum/wrong-network/malformed/duplicate coverage.

## Transaction model (UTXO)

```
Transaction {
  version: number
  inputs: TxInput[] | [CoinbaseInput]
  outputs: TxOutput[]     // { amount: bigint, address: string }
  lockTime: number
}
TxInput { prevTxId, outputIndex, publicKey, signature }
CoinbaseInput { coinbase: true, blockHeight }
```

Signing covers a canonical, signature-blanked serialization of the transaction
(`serializeForSigning`); the full serialization including signatures (`serializeFull`) is
double-SHA256'd to produce the txid.

## Block structure

```
BlockHeader { version, previousHash, merkleRoot, timestamp, difficulty, nonce }
Block { header, transactions }  // transactions[0] must be the coinbase
```

Merkle root: standard binary tree of txids, duplicating the last leaf on an odd count.

## Consensus: Proof-of-Work

`blockHash = doubleSha256(serializeHeader(header))`. Valid iff the hash's leading zero **bits**
(not just hex nibbles — see `leadingZeroBits`) meet the configured `difficulty`. Mining is a
plain nonce search (`mineBlock`), bounded by an iteration budget so it never runs unbounded
inside a single call.

## Block rewards

Initial reward 50 SGK, halving every 210,000 blocks (`getBlockReward(height)`), reward floors to
0 once halvings exhaust a 64-bit right-shift. `totalIssuanceThroughHeight` is used in tests to
confirm cumulative issuance never exceeds `MAX_SUPPLY`.

## Validation order (as implemented in `validateBlock`)

1. previous-hash matches current tip
2. timestamp not too far in the future
3. difficulty field matches chain config
4. block hash actually satisfies that difficulty (real PoW check)
5. exactly one coinbase transaction, first in the list
6. merkle root matches computed root over all transactions
7. every non-coinbase transaction: structural validity, signature validity, UTXO existence,
   ownership, no double-spend within the block, outputs ≤ inputs
8. coinbase output ≤ block reward + collected fees, and ≤ max supply

## What's not yet specified/built

Peer-to-peer wire messages (`VERSION`, `GETHEADERS`, etc.), fork-choice-by-cumulative-work, and
chain reorg logic are described in the original spec but not implemented in this delivery — see
`docs/LIMITATIONS.md`.
