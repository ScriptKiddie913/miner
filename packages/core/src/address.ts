// SGK address format
// ---------------------------------------------------------------
// address = base58( networkByte || pubKeyHash(20 bytes) || checksum(4 bytes) )
// pubKeyHash  = RIPEMD-like: sha256(sha256(publicKey)) truncated to 20 bytes
//               (we use double-sha256 truncation rather than RIPEMD160 since
//               that keeps us to a single, well-audited primitive)
// checksum    = doubleSha256(networkByte || pubKeyHash)[0:4]
// networkByte = 0x1F for mainnet ("sgk1..."), 0x6F for testnet ("sgt1...")
//
// This mirrors Bitcoin's Base58Check design (a well-established, documented
// pattern), applied to SGK's own network bytes and hash rules.

import { base58Decode, base58Encode } from "./base58.js";
import { doubleSha256 } from "./crypto.js";

export type Network = "mainnet" | "testnet" | "devnet";

const NETWORK_BYTES: Record<Network, number> = {
  mainnet: 0x1f,
  testnet: 0x6f,
  devnet: 0x8f,
};

const BYTE_TO_NETWORK: Record<number, Network> = Object.fromEntries(
  Object.entries(NETWORK_BYTES).map(([k, v]) => [v, k as Network])
) as Record<number, Network>;

export function publicKeyHash(publicKey: Uint8Array): Uint8Array {
  return doubleSha256(publicKey).slice(0, 20);
}

export function encodeAddress(
  publicKey: Uint8Array,
  network: Network = "mainnet"
): string {
  const networkByte = NETWORK_BYTES[network];
  const hash = publicKeyHash(publicKey);
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = networkByte;
  payload.set(hash, 1);
  const checksum = doubleSha256(payload).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

export interface DecodedAddress {
  network: Network;
  pubKeyHash: Uint8Array;
}

export class InvalidAddressError extends Error {}

export function decodeAddress(address: string): DecodedAddress {
  let raw: Uint8Array;
  try {
    raw = base58Decode(address);
  } catch (e) {
    throw new InvalidAddressError(`Malformed address (not valid base58): ${address}`);
  }

  if (raw.length !== 1 + 20 + 4) {
    throw new InvalidAddressError(`Malformed address length: ${address}`);
  }

  const payload = raw.slice(0, 21);
  const checksum = raw.slice(21);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);

  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new InvalidAddressError(`Bad checksum for address: ${address}`);
    }
  }

  const networkByte = payload[0];
  const network = BYTE_TO_NETWORK[networkByte];
  if (!network) {
    throw new InvalidAddressError(`Unknown network byte in address: ${address}`);
  }

  return { network, pubKeyHash: payload.slice(1) };
}

export function isValidAddress(address: string, network?: Network): boolean {
  try {
    const decoded = decodeAddress(address);
    if (network && decoded.network !== network) return false;
    return true;
  } catch {
    return false;
  }
}
