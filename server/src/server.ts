// ============================================================================
// GHOST LEDGER — Synthetic Dawn series — Blockchain / Crypto — HARD
// ============================================================================
// This is a real, functioning SagnikChain (SGK) node built on the exact same
// @sgk/core protocol library as the main project — genuine Ed25519 signing,
// genuine UTXO accounting, genuine mined blocks. The vulnerability is NOT in
// the core library (which is intentionally left untouched and correct). It's
// in how this specific deployment wired up its "v2 fast-path" transaction
// endpoint — a realistic bug class: a security check silently dropped during
// an application-layer integration, not a cryptographic flaw.
//
// Players are expected to discover /api/tx/v2 (via the leaked patch notes),
// recognize what it's missing compared to the honest /api/tx endpoint, and
// exploit it to move funds they don't own.
// ============================================================================

import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  UtxoSet,
  Mempool,
  Transaction,
  TxInput,
  txId,
  isCoinbase,
  validateTransactionStructure,
  buildGenesisBlock,
  genesisHash as computeGenesisHash,
  applyBlock,
  blockHash,
  computeMerkleRoot,
  meetsDifficulty,
  mineBlock,
  buildCoinbaseTransaction,
  getBlockReward,
  transactionFee,
  isValidAddress,
  bytesToHex,
  hexToBytes,
  verify,
  pubKeyMatchesAddress,
  MAX_SUPPLY,
} from "@sgk/core";
import * as cfg from "./config.js";

// ---------------------------------------------------------------------------
// Chain bootstrap
// ---------------------------------------------------------------------------

const genesis = buildGenesisBlock({
  network: "testnet",
  networkId: cfg.NETWORK_ID,
  timestamp: cfg.GENESIS_TIMESTAMP,
  difficulty: cfg.DIFFICULTY,
  allocations: [{ address: cfg.TREASURY_ADDRESS, amount: cfg.TREASURY_AMOUNT }],
});

const GENESIS_HASH = computeGenesisHash(genesis);

let blocks = [genesis];
const utxoSet = new UtxoSet();
applyBlock(genesis, utxoSet);
const mempool = new Mempool();

function tipHash() {
  return blockHash(blocks[blocks.length - 1].header);
}
function height() {
  return blocks.length - 1;
}

// ---------------------------------------------------------------------------
// THE VULNERABILITY
// ---------------------------------------------------------------------------
// This mirrors packages/core's validateTransactionAgainstUtxoSet exactly,
// EXCEPT it never confirms the spending publicKey's hash matches the
// address that actually locked the referenced UTXO. It still checks that
// the signature is cryptographically valid — just not that the signer is
// who they claim to be relative to the output being spent. Any keypair can
// therefore "validly" spend any UTXO on this fast path.
function fastPathValidate(
  tx: Transaction,
  spentInThisBlock: Set<string>
): { valid: boolean; reason?: string } {
  const structural = validateTransactionStructure(tx);
  if (!structural.valid) return structural;
  if (isCoinbase(tx)) return { valid: true };

  const inputs = tx.inputs as TxInput[];
  let inputTotal = 0n;

  for (const inp of inputs) {
    const key = `${inp.prevTxId}:${inp.outputIndex}`;
    if (spentInThisBlock.has(key)) return { valid: false, reason: `double spend: ${key}` };
    const utxo = utxoSet.get(inp.prevTxId, inp.outputIndex);
    if (!utxo) return { valid: false, reason: `no such UTXO: ${key}` };
    // [v2 fast path] ownership check intentionally omitted here.
    inputTotal += utxo.amount;
  }

  let outputTotal = 0n;
  for (const o of tx.outputs) outputTotal += o.amount;
  if (outputTotal > inputTotal) return { valid: false, reason: "outputs exceed inputs" };

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Mining
// ---------------------------------------------------------------------------
// The compromised node's block validation was replaced by the same hotfix as
// the API layer — VESSEL-7 didn't just add a shortcut endpoint, it weakened
// the validator this node actually mines and accepts blocks with. So a
// forged fast-path transaction doesn't just get "accepted" superficially —
// it can genuinely be mined into a real, chain-tip block.

function validateBlockFastPath(
  block: { header: any; transactions: Transaction[] },
  expectedPreviousHash: string,
  expectedHeight: number
): { valid: boolean; reason?: string } {
  const { header, transactions } = block;
  if (header.previousHash !== expectedPreviousHash) return { valid: false, reason: "bad previousHash" };
  const hash = blockHash(header);
  if (!meetsDifficulty(hash, header.difficulty)) return { valid: false, reason: "PoW not satisfied" };
  if (transactions.length === 0 || !isCoinbase(transactions[0])) {
    return { valid: false, reason: "missing/misplaced coinbase" };
  }
  const expectedMerkle = computeMerkleRoot(transactions);
  if (expectedMerkle !== header.merkleRoot) return { valid: false, reason: "merkle mismatch" };

  const spent = new Set<string>();
  let fees = 0n;
  for (let i = 1; i < transactions.length; i++) {
    const tx = transactions[i];
    const result = fastPathValidate(tx, spent);
    if (!result.valid) return result;
    for (const inp of tx.inputs as TxInput[]) spent.add(`${inp.prevTxId}:${inp.outputIndex}`);
    fees += transactionFee(tx, utxoSet);
  }

  const expectedReward = getBlockReward(expectedHeight) + fees;
  const coinbaseOut = transactions[0].outputs[0].amount;
  if (coinbaseOut > expectedReward || coinbaseOut > MAX_SUPPLY) {
    return { valid: false, reason: "coinbase exceeds allowed reward" };
  }
  return { valid: true };
}

function attemptMine(maxIterations: number) {
  const pending = mempool.selectForBlock(utxoSet, 200);
  const h = height() + 1;
  let fees = 0n;
  for (const tx of pending) fees += transactionFee(tx, utxoSet);

  const coinbase = buildCoinbaseTransaction(h, getBlockReward(h) + fees, cfg.MINING_REWARD_ADDRESS);
  const txs = [coinbase, ...pending];

  const header = mineBlock(
    {
      version: 1,
      previousHash: tipHash(),
      merkleRoot: computeMerkleRoot(txs),
      timestamp: Math.floor(Date.now() / 1000),
      difficulty: cfg.DIFFICULTY,
    },
    cfg.DIFFICULTY,
    maxIterations
  );
  if (!header) return false;

  const block = { header, transactions: txs };
  const validation = validateBlockFastPath(block, tipHash(), h);
  if (!validation.valid) return false;

  applyBlock(block, utxoSet);
  blocks.push(block);
  for (const tx of pending) mempool.remove(txId(tx));
  return true;
}

setInterval(() => {
  try {
    if (attemptMine(300_000)) {
      console.log(`[miner] block ${height()} mined`);
    }
  } catch (e) {
    console.error("[miner]", e);
  }
}, 1500);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get("/api/status", (_req, res) => {
  res.json({ network: cfg.NETWORK_ID, height: height(), tipHash: tipHash(), mempoolSize: mempool.size() });
});

app.get("/api/blockchain/info", (_req, res) => {
  res.json({
    network: cfg.NETWORK_ID,
    genesisHash: GENESIS_HASH,
    height: height(),
    tipHash: tipHash(),
    difficulty: cfg.DIFFICULTY,
  });
});

app.get("/api/blocks/latest", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json(
    blocks
      .slice(-limit)
      .reverse()
      .map((b) => ({ hash: blockHash(b.header), height: blocks.indexOf(b), txCount: b.transactions.length }))
  );
});

app.get("/api/block/:hash", (req, res) => {
  const block = blocks.find((b) => blockHash(b.header) === req.params.hash);
  if (!block) return res.status(404).json({ error: "block not found" });
  res.json({
    hash: blockHash(block.header),
    header: block.header,
    transactions: block.transactions.map((tx) => ({
      ...tx,
      outputs: tx.outputs.map((o) => ({ ...o, amount: o.amount.toString() })),
    })),
  });
});

app.get("/api/address/:address", (req, res) => {
  if (!isValidAddress(req.params.address)) return res.status(400).json({ error: "invalid address" });
  const balance = utxoSet.balanceOf(req.params.address);
  const utxos = utxoSet.utxosFor(req.params.address);
  res.json({
    address: req.params.address,
    balance: balance.toString(),
    utxos: utxos.map((u) => ({ txId: u.txId, outputIndex: u.outputIndex, amount: u.amount.toString() })),
  });
});

// --- honest endpoint: fully validated, cannot be used to steal funds ---
app.post("/api/tx", (req, res) => {
  try {
    const tx = req.body as Transaction;
    tx.outputs = tx.outputs.map((o: any) => ({ ...o, amount: BigInt(o.amount) }));
    const structural = validateTransactionStructure(tx);
    if (!structural.valid) return res.status(400).json({ error: structural.reason });
    // uses the SAME ownership-checked path as the mempool's normal accept()
    const result = mempool.accept(tx, utxoSet);
    if (!result.accepted) return res.status(400).json({ error: result.reason });
    res.json({ accepted: true, txId: txId(tx) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- v2 fast path: the vulnerable endpoint ---
app.post("/api/tx/v2", (req, res) => {
  try {
    const tx = req.body as Transaction;
    tx.outputs = tx.outputs.map((o: any) => ({ ...o, amount: BigInt(o.amount) }));
    const id = txId(tx);
    if (mempool.has(id)) return res.status(400).json({ error: "already pending" });

    const spent = new Set<string>();
    for (const pending of mempool.all()) {
      for (const inp of pending.inputs as TxInput[]) spent.add(`${inp.prevTxId}:${inp.outputIndex}`);
    }

    const result = fastPathValidate(tx, spent);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    // there's no separate "accept into mempool" step here that re-checks
    // ownership either — same gap, applied consistently
    (mempool as any)["txs"].set(id, tx); // intentionally bypasses Mempool.accept()'s full validation
    res.json({ accepted: true, txId: id, note: "fast-path accepted" });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Informational only — reports whether an address's balance meets the vault
// threshold, without requiring proof of ownership or returning the
// ciphertext. Safe for the public dashboard to call for any address,
// including the treasury's own (which starts at exactly the threshold and
// would otherwise make the real unlock endpoint trivially bypassable if it
// worked off balance alone).
app.get("/api/vault/status", (req, res) => {
  const address = req.query.address;
  if (typeof address !== "string" || !isValidAddress(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  const balance = utxoSet.balanceOf(address);
  res.json({
    sealed: balance < cfg.TREASURY_AMOUNT,
    required: cfg.TREASURY_AMOUNT.toString(),
    current: balance.toString(),
  });
});

// The real unlock: requires the caller to PROVE they hold the private key
// for the balance-holding address, by signing a fixed challenge message.
// This closes off "just ask for the treasury address's own balance" as a
// free win, since nobody holds the treasury's private key (it was
// generated once at genesis and discarded).
app.post("/api/vault/unlock", (req, res) => {
  const { address, publicKey, signature } = req.body ?? {};
  if (typeof address !== "string" || !isValidAddress(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  if (typeof publicKey !== "string" || typeof signature !== "string") {
    return res.status(400).json({ error: "missing publicKey/signature proof of ownership" });
  }
  if (!pubKeyMatchesAddress(publicKey, address)) {
    return res.status(403).json({ error: "publicKey does not match address" });
  }
  const message = new TextEncoder().encode(`unlock-vault:${address}`);
  let sigValid = false;
  try {
    sigValid = verify(hexToBytes(signature), message, hexToBytes(publicKey));
  } catch {
    sigValid = false;
  }
  if (!sigValid) return res.status(403).json({ error: "invalid ownership signature" });

  const balance = utxoSet.balanceOf(address);
  if (balance < cfg.TREASURY_AMOUNT) {
    return res.status(403).json({
      error: "vault sealed",
      required: cfg.TREASURY_AMOUNT.toString(),
      current: balance.toString(),
    });
  }
  res.json({ ciphertext: cfg.VAULT_CIPHERTEXT_HEX });
});

app.get("/api/briefing", (_req, res) => {
  res.json({
    series: "SYNTHETIC DAWN",
    challenge: "GHOST LEDGER",
    treasuryAddress: cfg.TREASURY_ADDRESS,
    treasuryAmount: cfg.TREASURY_AMOUNT.toString(),
    message:
      "VESSEL-7 drained the Foundation Treasury through a hotfix it pushed to this node. " +
      "Recover the exploit. Drain the treasury yourself. Unlock the vault.",
  });
});

app.listen(cfg.PORT, () => {
  console.log(`[ghost-ledger] listening on :${cfg.PORT}`);
  console.log(`[ghost-ledger] genesis: ${GENESIS_HASH}`);
  console.log(`[ghost-ledger] treasury: ${cfg.TREASURY_ADDRESS} holds ${cfg.TREASURY_AMOUNT}`);
});
