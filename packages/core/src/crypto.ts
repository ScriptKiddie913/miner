// Real cryptography only. Ed25519 signatures via the audited @noble/ed25519
// library, SHA-256 hashing via @noble/hashes. Nothing here is hand-rolled.

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils";

// @noble/ed25519 v2 needs a sha512 implementation wired in for sync APIs.
ed.etc.sha512Sync = (...msgs: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...msgs));

export interface KeyPair {
  privateKey: Uint8Array; // 32 bytes, NEVER transmitted or logged
  publicKey: Uint8Array; // 32 bytes
}

export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function publicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

export function doubleSha256(data: Uint8Array): Uint8Array {
  return nobleSha256(nobleSha256(data));
}

export { bytesToHex, hexToBytes, randomBytes };
