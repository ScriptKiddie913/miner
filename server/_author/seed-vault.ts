// Run once by the challenge author to bootstrap config.ts. Never ship this
// file (or its output before redaction) to players — it's the only place
// the flag plaintext appears.
//
// Usage: FLAG='syndwn{...}' npx tsx _author/seed-vault.ts

import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { generateKeyPair, encodeAddress, buildGenesisBlock, genesisHash as computeGenesisHash, bytesToHex } from "@sgk/core";

const NETWORK_ID = "sgk-testnet";
const DIFFICULTY = 14;
const GENESIS_TIMESTAMP = 1750000000;
const TREASURY_AMOUNT = 5_000_000n * 100_000_000n;

const flag = process.env.FLAG;
if (!flag) {
  console.error("Set FLAG env var, e.g. FLAG='syndwn{...}' npx tsx _author/seed-vault.ts");
  process.exit(1);
}

// Treasury keypair: the private key is generated then immediately discarded
// (never printed, never stored). It's structurally irrelevant to solving
// the challenge — that's the point of the vulnerability.
const treasuryKeyPair = generateKeyPair();
const treasuryAddress = encodeAddress(treasuryKeyPair.publicKey, "testnet");

const genesis = buildGenesisBlock({
  network: "testnet",
  networkId: NETWORK_ID,
  timestamp: GENESIS_TIMESTAMP,
  difficulty: DIFFICULTY,
  allocations: [{ address: treasuryAddress, amount: TREASURY_AMOUNT }],
});
const gHash = computeGenesisHash(genesis);

// key = SHA256(genesisHash || treasuryAddress) — this exact formula is what
// the leaked patch notes hint at, but players must derive genesisHash and
// treasuryAddress themselves from the live API.
const key = createHash("sha256").update(gHash + treasuryAddress).digest();
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(flag, "utf-8"), cipher.final()]);
const authTag = cipher.getAuthTag();

const blob = Buffer.concat([iv, authTag, ciphertext]).toString("hex");

console.log("=== paste these into server/src/config.ts ===");
console.log(`export const TREASURY_ADDRESS = "${treasuryAddress}";`);
console.log(`export const VAULT_CIPHERTEXT_HEX = "${blob}";`);
console.log("");
console.log(`(genesis hash for reference: ${gHash})`);
console.log("(treasury private key was generated and is now discarded — never logged)");
