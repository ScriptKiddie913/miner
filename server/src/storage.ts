// Disk persistence via plain JSON files.
//
// HONEST CAVEAT (see README/DEPLOYMENT.md): on Render's free tier there is
// no attached persistent disk. Data written here survives while the
// instance stays warm (including across the 15-minute idle spin-down/
// wake cycle, since that stops the process rather than destroying the
// container) but is WIPED on every redeploy. For state that must survive
// redeploys, point SGK_DATA_DIR at a mounted persistent disk (a paid Render
// feature) or swap this module for an external store (e.g. a small
// Postgres instance) — the interface below is intentionally narrow so
// that swap is a single-file change.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Block } from "@sgk/core";

function replacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? { __bigint__: value.toString() } : value;
}

function reviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && "__bigint__" in (value as any)) {
    return BigInt((value as any).__bigint__);
  }
  return value;
}

export class ChainStore {
  constructor(private dataDir: string) {}

  private blocksFile() {
    return path.join(this.dataDir, "blocks.json");
  }
  private utxoFile() {
    return path.join(this.dataDir, "utxo.json");
  }
  private mempoolFile() {
    return path.join(this.dataDir, "mempool.json");
  }
  private faucetFile() {
    return path.join(this.dataDir, "faucet.json");
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async loadBlocks(): Promise<Block[] | null> {
    try {
      const raw = await fs.readFile(this.blocksFile(), "utf-8");
      return JSON.parse(raw, reviver);
    } catch {
      return null;
    }
  }

  async saveBlocks(blocks: Block[]) {
    await fs.writeFile(this.blocksFile(), JSON.stringify(blocks, replacer, 2));
  }

  async loadUtxoSnapshot(): Promise<Record<string, { amount: string; address: string }> | null> {
    try {
      const raw = await fs.readFile(this.utxoFile(), "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async saveUtxoSnapshot(snapshot: Record<string, { amount: string; address: string }>) {
    await fs.writeFile(this.utxoFile(), JSON.stringify(snapshot, null, 2));
  }

  async loadFaucetLog(): Promise<Record<string, number>> {
    try {
      const raw = await fs.readFile(this.faucetFile(), "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async saveFaucetLog(log: Record<string, number>) {
    await fs.writeFile(this.faucetFile(), JSON.stringify(log, null, 2));
  }
}
