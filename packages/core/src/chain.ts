import { Block, BlockHeader, blockHash, computeMerkleRoot, meetsDifficulty } from "./block.js";
import {
  Transaction,
  TxInput,
  isCoinbase,
  txId,
  validateTransactionStructure,
  pubKeyMatchesAddress,
} from "./transaction.js";
import { getBlockReward } from "./rewards.js";
import { MAX_SUPPLY, ValidationResult } from "./transaction.js";
export type { ValidationResult };

export interface UtxoEntry {
  amount: bigint;
  address: string;
}

/** In-memory UTXO set keyed by "txid:outputIndex". A ChainStore (storage.ts)
 *  snapshots this to disk after every block so a restart can reload it. */
export class UtxoSet {
  private map = new Map<string, UtxoEntry>();

  private key(txid: string, index: number) {
    return `${txid}:${index}`;
  }

  get(txid: string, index: number): UtxoEntry | undefined {
    return this.map.get(this.key(txid, index));
  }

  has(txid: string, index: number): boolean {
    return this.map.has(this.key(txid, index));
  }

  add(txid: string, index: number, entry: UtxoEntry) {
    this.map.set(this.key(txid, index), entry);
  }

  remove(txid: string, index: number) {
    this.map.delete(this.key(txid, index));
  }

  balanceOf(address: string): bigint {
    let total = 0n;
    for (const entry of this.map.values()) {
      if (entry.address === address) total += entry.amount;
    }
    return total;
  }

  utxosFor(address: string): { txId: string; outputIndex: number; amount: bigint }[] {
    const results: { txId: string; outputIndex: number; amount: bigint }[] = [];
    for (const [key, entry] of this.map.entries()) {
      if (entry.address !== address) continue;
      const [txid, idx] = key.split(":");
      results.push({ txId: txid, outputIndex: Number(idx), amount: entry.amount });
    }
    return results;
  }

  snapshot(): Record<string, { amount: string; address: string }> {
    const out: Record<string, { amount: string; address: string }> = {};
    for (const [k, v] of this.map.entries()) out[k] = { amount: v.amount.toString(), address: v.address };
    return out;
  }

  static fromSnapshot(snap: Record<string, { amount: string; address: string }>): UtxoSet {
    const set = new UtxoSet();
    for (const [k, v] of Object.entries(snap)) {
      const [txid, idx] = k.split(":");
      set.add(txid, Number(idx), { amount: BigInt(v.amount), address: v.address });
    }
    return set;
  }
}

/** Structural + signature validation, PLUS live UTXO-set checks: input
 *  existence, ownership, and double-spend prevention. Never trust a
 *  transaction just because it sat in the mempool — this must be re-run
 *  at block-inclusion time too. */
export function validateTransactionAgainstUtxoSet(
  tx: Transaction,
  utxoSet: UtxoSet,
  spentInThisBlock: Set<string>
): ValidationResult {
  const structural = validateTransactionStructure(tx);
  if (!structural.valid) return structural;
  if (isCoinbase(tx)) return { valid: true };

  const inputs = tx.inputs as TxInput[];
  let inputTotal = 0n;

  for (const inp of inputs) {
    const key = `${inp.prevTxId}:${inp.outputIndex}`;
    if (spentInThisBlock.has(key)) {
      return { valid: false, reason: `double spend within block: ${key}` };
    }
    const utxo = utxoSet.get(inp.prevTxId, inp.outputIndex);
    if (!utxo) {
      return { valid: false, reason: `input references nonexistent or already-spent UTXO: ${key}` };
    }
    if (!pubKeyMatchesAddress(inp.publicKey, utxo.address)) {
      return { valid: false, reason: `signer does not own referenced output: ${key}` };
    }
    inputTotal += utxo.amount;
  }

  let outputTotal = 0n;
  for (const o of tx.outputs) outputTotal += o.amount;

  if (outputTotal > inputTotal) {
    return { valid: false, reason: "outputs exceed inputs (would create money)" };
  }

  return { valid: true };
}

export function transactionFee(tx: Transaction, utxoSet: UtxoSet): bigint {
  if (isCoinbase(tx)) return 0n;
  let inputTotal = 0n;
  for (const inp of tx.inputs as TxInput[]) {
    const utxo = utxoSet.get(inp.prevTxId, inp.outputIndex);
    if (utxo) inputTotal += utxo.amount;
  }
  let outputTotal = 0n;
  for (const o of tx.outputs) outputTotal += o.amount;
  return inputTotal - outputTotal;
}

export interface ChainParams {
  networkId: string;
  genesisHash: string;
  difficulty: number;
  maxTimestampDriftSeconds: number; // reject blocks timestamped too far in the future
}

/**
 * Full block validation, in the order specified by the protocol design:
 * 1. header well-formed  2. previous-hash linkage  3. timestamp
 * 4. difficulty field sane  5. proof-of-work satisfied  6. transactions valid
 * 7. merkle root matches  8. coinbase correct  9. UTXO state transition
 */
export function validateBlock(
  block: Block,
  params: {
    expectedPreviousHash: string;
    expectedHeight: number;
    chainParams: ChainParams;
    utxoSet: UtxoSet;
    now?: number;
  }
): ValidationResult {
  const { header, transactions } = block;
  const now = params.now ?? Math.floor(Date.now() / 1000);

  if (header.previousHash !== params.expectedPreviousHash) {
    return { valid: false, reason: "previousHash does not match tip of chain" };
  }
  if (header.timestamp > now + params.chainParams.maxTimestampDriftSeconds) {
    return { valid: false, reason: "block timestamp too far in the future" };
  }
  if (header.difficulty !== params.chainParams.difficulty) {
    return { valid: false, reason: "unexpected difficulty" };
  }
  const hash = blockHash(header);
  if (!meetsDifficulty(hash, header.difficulty)) {
    return { valid: false, reason: "proof-of-work does not satisfy difficulty" };
  }

  if (transactions.length === 0) return { valid: false, reason: "block has no transactions" };
  const coinbaseTxs = transactions.filter(isCoinbase);
  if (coinbaseTxs.length !== 1 || !isCoinbase(transactions[0])) {
    return { valid: false, reason: "block must have exactly one coinbase transaction, first in list" };
  }

  const expectedMerkle = computeMerkleRoot(transactions);
  if (expectedMerkle !== header.merkleRoot) {
    return { valid: false, reason: "merkle root mismatch" };
  }

  const spentInBlock = new Set<string>();
  let totalFees = 0n;
  for (let i = 1; i < transactions.length; i++) {
    const tx = transactions[i];
    const result = validateTransactionAgainstUtxoSet(tx, params.utxoSet, spentInBlock);
    if (!result.valid) return result;
    for (const inp of tx.inputs as TxInput[]) {
      spentInBlock.add(`${inp.prevTxId}:${inp.outputIndex}`);
    }
    totalFees += transactionFee(tx, params.utxoSet);
  }

  const expectedReward = getBlockReward(params.expectedHeight) + totalFees;
  const coinbaseOut = transactions[0].outputs[0].amount;
  if (coinbaseOut > expectedReward) {
    return { valid: false, reason: `coinbase pays more than allowed (reward+fees): got ${coinbaseOut}, max ${expectedReward}` };
  }
  if (coinbaseOut > MAX_SUPPLY) {
    return { valid: false, reason: "coinbase exceeds max supply" };
  }

  return { valid: true };
}

/** Applies an already-validated block's transactions to the UTXO set. */
export function applyBlock(block: Block, utxoSet: UtxoSet) {
  for (const tx of block.transactions) {
    const id = txId(tx);
    if (!isCoinbase(tx)) {
      for (const inp of tx.inputs as TxInput[]) {
        utxoSet.remove(inp.prevTxId, inp.outputIndex);
      }
    }
    tx.outputs.forEach((out, idx) => {
      utxoSet.add(id, idx, { amount: out.amount, address: out.address });
    });
  }
}
