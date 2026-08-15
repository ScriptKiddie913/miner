import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair } from "./crypto.js";
import { encodeAddress } from "./address.js";
import { buildGenesisBlock, genesisHash } from "./genesis.js";
import { UtxoSet, validateBlock, applyBlock, validateTransactionAgainstUtxoSet } from "./chain.js";
import { buildTransaction, buildCoinbaseTransaction, txId } from "./transaction.js";
import { mineBlock, computeMerkleRoot, meetsDifficulty, blockHash } from "./block.js";

function makeChain(difficulty = 8) {
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const aliceAddr = encodeAddress(alice.publicKey, "devnet");
  const bobAddr = encodeAddress(bob.publicKey, "devnet");

  const genesis = buildGenesisBlock({
    network: "devnet",
    networkId: "sgk-devnet",
    timestamp: 1_700_000_000,
    difficulty,
    allocations: [{ address: aliceAddr, amount: 1000n * 100_000_000n }],
  });

  const utxoSet = new UtxoSet();
  applyBlock(genesis, utxoSet);

  return { alice, bob, aliceAddr, bobAddr, genesis, utxoSet, difficulty };
}

test("genesis hash is deterministic given identical params", () => {
  const fixedAddr = encodeAddress(generateKeyPair().publicKey, "devnet");
  const params = {
    network: "devnet" as const,
    networkId: "sgk-devnet",
    timestamp: 1_700_000_000,
    difficulty: 8,
    allocations: [{ address: fixedAddr, amount: 1000n * 100_000_000n }],
  };
  const a = buildGenesisBlock(params);
  const b = buildGenesisBlock(params);
  assert.equal(genesisHash(a), genesisHash(b));
});

test("spending a real UTXO validates and updates balances", () => {
  const { alice, aliceAddr, bobAddr, utxoSet } = makeChain();
  const utxos = utxoSet.utxosFor(aliceAddr);
  assert.equal(utxos.length, 1);

  const tx = buildTransaction({
    inputsToSpend: utxos.map((u) => ({ ...u, address: aliceAddr })),
    outputs: [
      { amount: 100n * 100_000_000n, address: bobAddr },
      { amount: 899n * 100_000_000n - 1_000_000n, address: aliceAddr }, // change, minus a small fee
    ],
    privateKey: alice.privateKey,
    publicKey: alice.publicKey,
  });

  const result = validateTransactionAgainstUtxoSet(tx, utxoSet, new Set());
  assert.equal(result.valid, true, result.reason);
});

test("rejects spending a UTXO that does not exist", () => {
  const { bob, bobAddr, utxoSet } = makeChain();
  const fakeTx = buildTransaction({
    inputsToSpend: [{ txId: "00".repeat(32), outputIndex: 0, amount: 10n, address: bobAddr }],
    outputs: [{ amount: 5n, address: bobAddr }],
    privateKey: bob.privateKey,
    publicKey: bob.publicKey,
  });
  const result = validateTransactionAgainstUtxoSet(fakeTx, utxoSet, new Set());
  assert.equal(result.valid, false);
});

test("rejects double-spending the same output twice within a block", () => {
  const { alice, aliceAddr, bobAddr, utxoSet } = makeChain();
  const utxos = utxoSet.utxosFor(aliceAddr);

  const tx1 = buildTransaction({
    inputsToSpend: utxos.map((u) => ({ ...u, address: aliceAddr })),
    outputs: [{ amount: 500n * 100_000_000n, address: bobAddr }],
    privateKey: alice.privateKey,
    publicKey: alice.publicKey,
  });

  const spent = new Set<string>();
  const first = validateTransactionAgainstUtxoSet(tx1, utxoSet, spent);
  assert.equal(first.valid, true);
  for (const inp of tx1.inputs as any) spent.add(`${inp.prevTxId}:${inp.outputIndex}`);

  const second = validateTransactionAgainstUtxoSet(tx1, utxoSet, spent);
  assert.equal(second.valid, false);
  assert.match(second.reason ?? "", /double spend/);
});

test("rejects a transaction that spends more than its inputs provide", () => {
  const { alice, aliceAddr, bobAddr, utxoSet } = makeChain();
  const utxos = utxoSet.utxosFor(aliceAddr);

  const overspend = buildTransaction({
    inputsToSpend: utxos.map((u) => ({ ...u, address: aliceAddr })),
    outputs: [{ amount: 999_999n * 100_000_000n, address: bobAddr }], // way more than the 1000 SGK available
    privateKey: alice.privateKey,
    publicKey: alice.publicKey,
  });

  const result = validateTransactionAgainstUtxoSet(overspend, utxoSet, new Set());
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /exceed inputs/);
});

test("rejects a forged signature (wrong key signs someone else's output)", () => {
  const { alice, bob, aliceAddr, bobAddr, utxoSet } = makeChain();
  const utxos = utxoSet.utxosFor(aliceAddr);

  // Bob tries to spend Alice's UTXO by signing with his own key.
  const forged = buildTransaction({
    inputsToSpend: utxos.map((u) => ({ ...u, address: aliceAddr })),
    outputs: [{ amount: 100n * 100_000_000n, address: bobAddr }],
    privateKey: bob.privateKey,
    publicKey: bob.publicKey,
  });

  const result = validateTransactionAgainstUtxoSet(forged, utxoSet, new Set());
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /does not own|invalid signature/);
});

test("mineBlock produces a header whose hash actually satisfies difficulty", () => {
  const difficulty = 12;
  const coinbase = buildCoinbaseTransaction(1, 50n * 100_000_000n, "placeholder");
  const header = mineBlock(
    {
      version: 1,
      previousHash: "11".repeat(32),
      merkleRoot: computeMerkleRoot([coinbase]),
      timestamp: 1_700_000_100,
      difficulty,
    },
    difficulty
  );
  assert.ok(header, "mining should find a valid nonce at this difficulty");
  const hash = blockHash(header!);
  assert.equal(meetsDifficulty(hash, difficulty), true);
});

test("full pipeline: mine block 1 spending genesis coins, validate, apply", () => {
  const { alice, aliceAddr, bobAddr, genesis, utxoSet, difficulty } = makeChain(10);
  const utxos = utxoSet.utxosFor(aliceAddr);

  const spendTx = buildTransaction({
    inputsToSpend: utxos.map((u) => ({ ...u, address: aliceAddr })),
    outputs: [
      { amount: 100n * 100_000_000n, address: bobAddr },
      { amount: 899n * 100_000_000n, address: aliceAddr },
    ],
    privateKey: alice.privateKey,
    publicKey: alice.publicKey,
  });

  const coinbase = buildCoinbaseTransaction(1, 50n * 100_000_000n, aliceAddr);
  const txs = [coinbase, spendTx];
  const header = mineBlock(
    {
      version: 1,
      previousHash: genesisHash(genesis),
      merkleRoot: computeMerkleRoot(txs),
      timestamp: 1_700_000_200,
      difficulty,
    },
    difficulty
  );
  assert.ok(header);

  const block = { header: header!, transactions: txs };
  const result = validateBlock(block, {
    expectedPreviousHash: genesisHash(genesis),
    expectedHeight: 1,
    chainParams: { networkId: "sgk-devnet", genesisHash: genesisHash(genesis), difficulty, maxTimestampDriftSeconds: 7200 },
    utxoSet,
    now: 1_700_000_500,
  });
  assert.equal(result.valid, true, result.reason);

  applyBlock(block, utxoSet);
  assert.equal(utxoSet.balanceOf(bobAddr), 100n * 100_000_000n);
  assert.equal(utxoSet.balanceOf(aliceAddr), 899n * 100_000_000n + 50n * 100_000_000n);
});
