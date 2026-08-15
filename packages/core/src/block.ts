import { doubleSha256, bytesToHex } from "./crypto.js";
import { Transaction, serializeFull, txId } from "./transaction.js";

export interface BlockHeader {
  version: number;
  previousHash: string;
  merkleRoot: string;
  timestamp: number; // unix seconds
  difficulty: number; // number of required leading zero bits
  nonce: number;
}

export interface Block {
  header: BlockHeader;
  transactions: Transaction[];
}

export function merkleRoot(txIds: string[]): string {
  if (txIds.length === 0) return bytesToHex(doubleSha256(new Uint8Array()));
  let level = txIds.map((id) => id);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      const combined = new TextEncoder().encode(left + right);
      next.push(bytesToHex(doubleSha256(combined)));
    }
    level = next;
  }
  return level[0];
}

export function computeMerkleRoot(transactions: Transaction[]): string {
  return merkleRoot(transactions.map((tx) => txId(tx)));
}

export function serializeHeader(header: BlockHeader): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      version: header.version,
      previousHash: header.previousHash,
      merkleRoot: header.merkleRoot,
      timestamp: header.timestamp,
      difficulty: header.difficulty,
      nonce: header.nonce,
    })
  );
}

export function blockHash(header: BlockHeader): string {
  return bytesToHex(doubleSha256(serializeHeader(header)));
}

/** Counts leading zero bits of a hex hash string. */
export function leadingZeroBits(hashHex: string): number {
  let bits = 0;
  for (const char of hashHex) {
    const nibble = parseInt(char, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    // count leading zero bits within this nibble
    if (nibble < 8) bits += 1;
    if (nibble < 4) bits += 1;
    if (nibble < 2) bits += 1;
    break;
  }
  return bits;
}

export function meetsDifficulty(hashHex: string, difficulty: number): boolean {
  return leadingZeroBits(hashHex) >= difficulty;
}

/** Real proof-of-work search. Blocking/synchronous — callers should run this
 *  off the request thread (e.g. in a worker or a background loop), never
 *  inline in an HTTP handler. */
export function mineBlock(
  header: Omit<BlockHeader, "nonce">,
  difficulty: number,
  maxIterations = 50_000_000
): BlockHeader | null {
  for (let nonce = 0; nonce < maxIterations; nonce++) {
    const candidate: BlockHeader = { ...header, difficulty, nonce };
    const hash = blockHash(candidate);
    if (meetsDifficulty(hash, difficulty)) {
      return candidate;
    }
  }
  return null;
}
