// Filled in by running `npm run seed` (see _author/seed-vault.ts) once, then
// hardcoded here. The flag plaintext itself never appears in this file or
// anywhere in the deployed server — only the AES-GCM ciphertext does.

export const NETWORK_ID = "sgk-testnet";
export const DIFFICULTY = 14;
export const GENESIS_TIMESTAMP = 1750000000;

export const TREASURY_ADDRESS = "mgepXo2ExKEhhYhvpqNcYDnkqGn1w1o8Ag";
export const TREASURY_AMOUNT = 5_000_000n * 100_000_000n; // 5,000,000 SGK

// hex(iv[12] || authTag[16] || ciphertext) — AES-256-GCM
export const VAULT_CIPHERTEXT_HEX = "623f91785a0dde39bd134ba9ace32ba7dffc12b39833f3f062fe64b5cdb9379abdcc7b13e3c8ae3e46022f7ad4d1e559ba939c12a900b30feca981b5ad4581eb4e867fab82714b90113ae2b1879db5c5bf";

export const PORT = Number(process.env.PORT ?? 8600);
export const DATA_DIR = process.env.GL_DATA_DIR ?? "./data";
