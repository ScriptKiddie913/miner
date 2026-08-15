import { MAX_SUPPLY } from "./transaction.js";

export const INITIAL_REWARD = 50n * 100_000_000n; // 50 SGK in base units
export const HALVING_INTERVAL = 210_000;

/** Deterministic block reward at a given height. Never allows cumulative
 *  issuance to exceed MAX_SUPPLY (reward floors to 0 once halvings exhaust it). */
export function getBlockReward(height: number): bigint {
  if (height < 0) throw new Error("height must be >= 0");
  const halvings = Math.floor(height / HALVING_INTERVAL);
  if (halvings >= 64) return 0n; // right-shifting a bigint 64+ times is always 0
  return INITIAL_REWARD >> BigInt(halvings);
}

/** Sums total issuance from genesis through `height` inclusive. Used in
 *  tests / audits to confirm the schedule never breaches MAX_SUPPLY. */
export function totalIssuanceThroughHeight(height: number): bigint {
  let total = 0n;
  let h = 0;
  while (h <= height) {
    const halvings = Math.floor(h / HALVING_INTERVAL);
    if (halvings >= 64) break;
    const reward = INITIAL_REWARD >> BigInt(halvings);
    if (reward === 0n) break;
    const blocksAtThisReward = Math.min(
      (halvings + 1) * HALVING_INTERVAL - h,
      height - h + 1
    );
    total += reward * BigInt(blocksAtThisReward);
    if (total > MAX_SUPPLY) throw new Error("issuance schedule exceeds MAX_SUPPLY");
    h += blocksAtThisReward;
  }
  return total;
}
