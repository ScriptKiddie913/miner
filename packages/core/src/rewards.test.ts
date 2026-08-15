import { test } from "node:test";
import assert from "node:assert/strict";
import { getBlockReward, totalIssuanceThroughHeight, HALVING_INTERVAL, INITIAL_REWARD } from "./rewards.js";
import { MAX_SUPPLY } from "./transaction.js";

test("height 0 and 1 pay the initial reward", () => {
  assert.equal(getBlockReward(0), INITIAL_REWARD);
  assert.equal(getBlockReward(1), INITIAL_REWARD);
});

test("reward halves exactly at the halving boundary", () => {
  assert.equal(getBlockReward(HALVING_INTERVAL - 1), INITIAL_REWARD);
  assert.equal(getBlockReward(HALVING_INTERVAL), INITIAL_REWARD / 2n);
});

test("multiple halvings compound correctly", () => {
  assert.equal(getBlockReward(HALVING_INTERVAL * 2), INITIAL_REWARD / 4n);
  assert.equal(getBlockReward(HALVING_INTERVAL * 3), INITIAL_REWARD / 8n);
});

test("reward eventually floors to zero and never goes negative", () => {
  const veryHigh = HALVING_INTERVAL * 70;
  assert.equal(getBlockReward(veryHigh), 0n);
});

test("cumulative issuance never exceeds MAX_SUPPLY", () => {
  const total = totalIssuanceThroughHeight(HALVING_INTERVAL * 40);
  assert.ok(total <= MAX_SUPPLY, `issuance ${total} exceeded max supply ${MAX_SUPPLY}`);
});

test("rejects a negative height", () => {
  assert.throws(() => getBlockReward(-1));
});
