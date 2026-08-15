import { Block, BlockHeader, computeMerkleRoot, blockHash } from "./block.js";
import { Transaction } from "./transaction.js";
import { Network } from "./address.js";

export interface GenesisParams {
  network: Network;
  networkId: string; // "sgk-mainnet" | "sgk-testnet" | "sgk-devnet"
  timestamp: number; // fixed, reproducible unix seconds — do NOT use Date.now()
  difficulty: number;
  allocations: { address: string; amount: bigint }[]; // initial distribution
}

/** Builds the deterministic genesis block. Every field is explicit and
 *  config-driven — nothing here depends on wall-clock time or randomness,
 *  so the same params always reproduce the same genesis hash. */
export function buildGenesisBlock(params: GenesisParams): Block {
  const genesisTx: Transaction = {
    version: 1,
    inputs: [{ coinbase: true, blockHeight: 0 }],
    // Genesis conventionally carries all allocations in one coinbase-style
    // transaction's outputs rather than a single output.
    outputs: params.allocations.map((a) => ({ amount: a.amount, address: a.address })),
    lockTime: 0,
  };

  const header: BlockHeader = {
    version: 1,
    previousHash: "0".repeat(64),
    merkleRoot: computeMerkleRoot([genesisTx]),
    timestamp: params.timestamp,
    difficulty: params.difficulty,
    nonce: 0, // genesis is not mined; nonce is fixed by convention
  };

  return { header, transactions: [genesisTx] };
}

export function genesisHash(block: Block): string {
  return blockHash(block.header);
}
