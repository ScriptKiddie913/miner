// UTXO transaction model.
//
// Amounts are represented as JS `bigint` (base units, 8 decimals — 1 SGK =
// 100_000_000 base units) so we never lose precision to floating point and
// can hard-cap at MAX_SUPPLY without silent overflow.

import { doubleSha256, sign, verify, bytesToHex, hexToBytes } from "./crypto.js";
import { decodeAddress, publicKeyHash } from "./address.js";

export const MAX_SUPPLY = 100_000_000n * 100_000_000n; // 100,000,000 SGK in base units

export interface TxInput {
  prevTxId: string; // hex txid being spent
  outputIndex: number;
  publicKey: string; // hex — spender's pubkey (must hash to the output's locking hash)
  signature: string; // hex — signs the tx with this input's signature field blanked
}

export interface TxOutput {
  amount: bigint; // base units, must be > 0
  address: string; // SGK address (locking condition)
}

export interface CoinbaseInput {
  coinbase: true;
  blockHeight: number;
}

export interface Transaction {
  version: number;
  inputs: TxInput[] | [CoinbaseInput];
  outputs: TxOutput[];
  lockTime: number;
}

export function isCoinbase(tx: Transaction): boolean {
  return tx.inputs.length === 1 && (tx.inputs[0] as CoinbaseInput).coinbase === true;
}

// --- Deterministic serialization -----------------------------------------
// JSON with sorted keys + explicit bigint->string encoding, so hashing and
// signing are reproducible across implementations.

function canonicalOutput(o: TxOutput) {
  return { amount: o.amount.toString(), address: o.address };
}

function canonicalInputForSigning(i: TxInput) {
  // signature is excluded from the signed payload
  return { prevTxId: i.prevTxId, outputIndex: i.outputIndex, publicKey: i.publicKey };
}

export function serializeForSigning(tx: Transaction): Uint8Array {
  const payload = isCoinbase(tx)
    ? {
        version: tx.version,
        inputs: tx.inputs,
        outputs: tx.outputs.map(canonicalOutput),
        lockTime: tx.lockTime,
      }
    : {
        version: tx.version,
        inputs: (tx.inputs as TxInput[]).map(canonicalInputForSigning),
        outputs: tx.outputs.map(canonicalOutput),
        lockTime: tx.lockTime,
      };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function serializeFull(tx: Transaction): Uint8Array {
  const payload = {
    version: tx.version,
    inputs: isCoinbase(tx)
      ? tx.inputs
      : (tx.inputs as TxInput[]).map((i) => ({ ...i })),
    outputs: tx.outputs.map(canonicalOutput),
    lockTime: tx.lockTime,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function txId(tx: Transaction): string {
  return bytesToHex(doubleSha256(serializeFull(tx)));
}

// --- Building & signing ----------------------------------------------------

export interface UnspentOutput {
  txId: string;
  outputIndex: number;
  amount: bigint;
  address: string;
}

export function buildTransaction(params: {
  inputsToSpend: UnspentOutput[];
  outputs: TxOutput[];
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  lockTime?: number;
}): Transaction {
  const unsigned: Transaction = {
    version: 1,
    inputs: params.inputsToSpend.map((u) => ({
      prevTxId: u.txId,
      outputIndex: u.outputIndex,
      publicKey: bytesToHex(params.publicKey),
      signature: "",
    })),
    outputs: params.outputs,
    lockTime: params.lockTime ?? 0,
  };

  const message = serializeForSigning(unsigned);
  const signature = bytesToHex(sign(message, params.privateKey));

  return {
    ...unsigned,
    inputs: (unsigned.inputs as TxInput[]).map((i) => ({ ...i, signature })),
  };
}

export function buildCoinbaseTransaction(
  blockHeight: number,
  reward: bigint,
  toAddress: string
): Transaction {
  return {
    version: 1,
    inputs: [{ coinbase: true, blockHeight }],
    outputs: [{ amount: reward, address: toAddress }],
    lockTime: 0,
  };
}

// --- Validation --------------------------------------------------------
// Structural + cryptographic validation only. UTXO-existence / double-spend
// checks require chain state and live in chain.ts (validateTransactionAgainstUtxoSet).

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateTransactionStructure(tx: Transaction): ValidationResult {
  if (isCoinbase(tx)) {
    if (tx.outputs.length !== 1) return { valid: false, reason: "coinbase must have exactly one output" };
    if (tx.outputs[0].amount <= 0n) return { valid: false, reason: "coinbase amount must be positive" };
    return { valid: true };
  }

  const inputs = tx.inputs as TxInput[];
  if (inputs.length === 0) return { valid: false, reason: "no inputs" };
  if (tx.outputs.length === 0) return { valid: false, reason: "no outputs" };

  // no negative / zero / non-integer / overflowing amounts
  let total = 0n;
  for (const o of tx.outputs) {
    if (typeof o.amount !== "bigint") return { valid: false, reason: "amount must be bigint" };
    if (o.amount <= 0n) return { valid: false, reason: "output amount must be positive" };
    if (o.amount > MAX_SUPPLY) return { valid: false, reason: "output amount exceeds max supply" };
    total += o.amount;
    if (total > MAX_SUPPLY) return { valid: false, reason: "output total overflows max supply" };
    try {
      decodeAddress(o.address);
    } catch {
      return { valid: false, reason: `invalid recipient address: ${o.address}` };
    }
  }

  // reject duplicate inputs within the same tx (self double-spend)
  const seen = new Set<string>();
  for (const inp of inputs) {
    const key = `${inp.prevTxId}:${inp.outputIndex}`;
    if (seen.has(key)) return { valid: false, reason: "duplicate input within transaction" };
    seen.add(key);
  }

  // verify every signature
  const message = serializeForSigning({ ...tx, inputs: inputs.map((i) => ({ ...i, signature: "" })) });
  for (const inp of inputs) {
    if (!inp.signature) return { valid: false, reason: "missing signature" };
    const ok = verify(hexToBytes(inp.signature), message, hexToBytes(inp.publicKey));
    if (!ok) return { valid: false, reason: "invalid signature" };
  }

  return { valid: true };
}

/** Confirms the spender's pubkey actually matches the locking address on a referenced output. */
export function pubKeyMatchesAddress(publicKeyHex: string, address: string): boolean {
  try {
    const decoded = decodeAddress(address);
    const hash = publicKeyHash(hexToBytes(publicKeyHex));
    if (hash.length !== decoded.pubKeyHash.length) return false;
    for (let i = 0; i < hash.length; i++) {
      if (hash[i] !== decoded.pubKeyHash[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}
