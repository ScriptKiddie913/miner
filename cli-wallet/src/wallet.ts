#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateKeyPair,
  encodeAddress,
  bytesToHex,
  hexToBytes,
  publicKeyFromPrivate,
  buildTransaction,
  Network,
} from "@sgk/core";

const WALLET_DIR = process.env.SGK_WALLET_DIR ?? path.join(os.homedir(), ".sgk-wallet");
const WALLET_FILE = path.join(WALLET_DIR, "wallet.json");
const NODE_URL = process.env.SGK_NODE_URL ?? "http://localhost:8545";
const NETWORK: Network = (process.env.SGK_NETWORK_MODE as Network) ?? "devnet";

interface WalletFile {
  address: string;
  privateKey: string; // hex — stays local, never sent to the node
  network: Network;
}

async function loadWallet(): Promise<WalletFile> {
  const raw = await fs.readFile(WALLET_FILE, "utf-8");
  return JSON.parse(raw);
}

async function saveWallet(w: WalletFile) {
  await fs.mkdir(WALLET_DIR, { recursive: true });
  await fs.writeFile(WALLET_FILE, JSON.stringify(w, null, 2), { mode: 0o600 });
}

async function cmdCreate() {
  try {
    await fs.access(WALLET_FILE);
    console.error(`Wallet already exists at ${WALLET_FILE}. Delete it first or use 'import'.`);
    process.exit(1);
  } catch {
    // doesn't exist yet, proceed
  }
  const kp = generateKeyPair();
  const address = encodeAddress(kp.publicKey, NETWORK);
  const wallet: WalletFile = { address, privateKey: bytesToHex(kp.privateKey), network: NETWORK };
  await saveWallet(wallet);
  console.log(`Created wallet at ${WALLET_FILE}`);
  console.log(`Address: ${address}`);
  console.log(`\nBack up your private key somewhere safe — it is never recoverable if lost:`);
  console.log(wallet.privateKey);
}

async function cmdAddress() {
  const w = await loadWallet();
  console.log(w.address);
}

async function cmdBalance() {
  const w = await loadWallet();
  const res = await fetch(`${NODE_URL}/api/address/${w.address}/balance`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "request failed");
  const sgk = Number(BigInt(data.balance)) / 1e8;
  console.log(`${sgk} SGK (${data.balance} base units)`);
}

async function cmdHistory() {
  const w = await loadWallet();
  const res = await fetch(`${NODE_URL}/api/address/${w.address}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "request failed");
  console.log(`${data.utxoCount} spendable UTXO(s):`);
  for (const u of data.utxos) {
    console.log(`  ${u.txId}:${u.outputIndex}  ${Number(BigInt(u.amount)) / 1e8} SGK`);
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function cmdSend(args: string[]) {
  const { to, amount } = parseArgs(args);
  if (!to || !amount) {
    console.error("Usage: sgk-wallet send --to <address> --amount <SGK>");
    process.exit(1);
  }
  const w = await loadWallet();
  const amountBase = BigInt(Math.round(Number(amount) * 1e8));
  const fee = 1_000_000n; // 0.01 SGK flat fee for the reference wallet

  const utxoRes = await fetch(`${NODE_URL}/api/address/${w.address}`);
  const utxoData = await utxoRes.json();
  if (!utxoRes.ok) throw new Error(utxoData.error);

  let total = 0n;
  const chosen: { txId: string; outputIndex: number; amount: bigint }[] = [];
  for (const u of utxoData.utxos) {
    chosen.push({ txId: u.txId, outputIndex: u.outputIndex, amount: BigInt(u.amount) });
    total += BigInt(u.amount);
    if (total >= amountBase + fee) break;
  }
  if (total < amountBase + fee) {
    console.error(`Insufficient funds: have ${Number(total) / 1e8} SGK, need ${Number(amountBase + fee) / 1e8} SGK (incl. fee)`);
    process.exit(1);
  }

  const change = total - amountBase - fee;
  const outputs = [{ amount: amountBase, address: to }];
  if (change > 0n) outputs.push({ amount: change, address: w.address });

  const privateKey = hexToBytes(w.privateKey);
  const publicKey = publicKeyFromPrivate(privateKey);

  const tx = buildTransaction({
    inputsToSpend: chosen.map((u) => ({ ...u, address: w.address })),
    outputs,
    privateKey,
    publicKey,
  });

  // amounts must be sent as strings over JSON
  const wireTx = { ...tx, outputs: tx.outputs.map((o) => ({ ...o, amount: o.amount.toString() })) };

  const res = await fetch(`${NODE_URL}/api/tx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireTx),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "transaction rejected");
  console.log(`Sent. txId: ${data.txId}`);
}

async function cmdExport() {
  const w = await loadWallet();
  console.log(JSON.stringify(w, null, 2));
}

async function cmdImport(args: string[]) {
  const { key } = parseArgs(args);
  if (!key) {
    console.error("Usage: sgk-wallet import --key <hex-private-key>");
    process.exit(1);
  }
  const privateKey = hexToBytes(key);
  const publicKey = publicKeyFromPrivate(privateKey);
  const address = encodeAddress(publicKey, NETWORK);
  await saveWallet({ address, privateKey: key, network: NETWORK });
  console.log(`Imported wallet. Address: ${address}`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "create":
      return cmdCreate();
    case "address":
      return cmdAddress();
    case "balance":
      return cmdBalance();
    case "history":
      return cmdHistory();
    case "send":
      return cmdSend(rest);
    case "export":
      return cmdExport();
    case "import":
      return cmdImport(rest);
    default:
      console.log(`sgk-wallet <command>

Commands:
  create              generate a new wallet
  address             print your address
  balance             check your balance
  history             list spendable UTXOs
  send --to <addr> --amount <SGK>
  export              print wallet JSON (contains your private key!)
  import --key <hex>  import a wallet from a private key

Env vars:
  SGK_NODE_URL       node API base URL (default http://localhost:8545)
  SGK_NETWORK_MODE   mainnet | testnet | devnet (default devnet)
  SGK_WALLET_DIR     wallet storage dir (default ~/.sgk-wallet)`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
