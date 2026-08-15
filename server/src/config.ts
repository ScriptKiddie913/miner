import type { Network } from "@sgk/core";

function requireEnvOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const NETWORK = (requireEnvOrDefault("SGK_NETWORK", "sgk-devnet") as string);

export const NETWORK_MODE: Network =
  NETWORK === "sgk-mainnet" ? "mainnet" : NETWORK === "sgk-testnet" ? "testnet" : "devnet";

export const PORT = Number(requireEnvOrDefault("PORT", "8545"));

export const DATA_DIR = requireEnvOrDefault("SGK_DATA_DIR", "./data");

export const DIFFICULTY = Number(requireEnvOrDefault("SGK_DIFFICULTY", "16"));

export const MAX_TIMESTAMP_DRIFT_SECONDS = 7200;

export const AUTO_MINE = requireEnvOrDefault("SGK_AUTO_MINE", "true") === "true";

// Fixed genesis timestamp so the genesis block is reproducible from config
// alone (never Date.now()).
export const GENESIS_TIMESTAMP = Number(requireEnvOrDefault("SGK_GENESIS_TIMESTAMP", "1735689600")); // 2025-01-01T00:00:00Z

// Optional single initial allocation address (e.g. your own wallet, so the
// devnet/testnet isn't launched with zero spendable coins). Leave unset for
// a genesis block with no pre-mine — all coins then come from mining.
export const GENESIS_ALLOCATION_ADDRESS = process.env.SGK_GENESIS_ALLOCATION_ADDRESS ?? null;
export const GENESIS_ALLOCATION_AMOUNT = BigInt(
  requireEnvOrDefault("SGK_GENESIS_ALLOCATION_AMOUNT", "0")
);

export const FAUCET_ENABLED =
  requireEnvOrDefault("SGK_FAUCET_ENABLED", "true") === "true" && NETWORK !== "sgk-mainnet";
export const FAUCET_AMOUNT = BigInt(requireEnvOrDefault("SGK_FAUCET_AMOUNT", "1000000000")); // 10 SGK
export const FAUCET_COOLDOWN_SECONDS = Number(requireEnvOrDefault("SGK_FAUCET_COOLDOWN_SECONDS", "3600"));
