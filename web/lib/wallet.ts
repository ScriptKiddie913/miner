"use client";

import {
  generateKeyPair,
  encodeAddress,
  bytesToHex,
  hexToBytes,
  publicKeyFromPrivate,
  buildTransaction,
  type Network,
} from "@sgk/core";

const STORAGE_KEY = "sgk_wallet_v1";
const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SGK_NETWORK_MODE as Network) ?? "devnet";

export interface StoredWallet {
  address: string;
  privateKey: string; // hex, browser localStorage only — never sent to any server
  network: Network;
}

// IMPORTANT: this uses browser localStorage deliberately (this is a real
// deployed web app, not a claude.ai artifact sandbox). Private keys never
// leave the browser: signing happens here, and only the signed transaction
// object (with a public key, not the private key) is sent to the node.

export function loadWallet(): StoredWallet | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function createWallet(): StoredWallet {
  const kp = generateKeyPair();
  const address = encodeAddress(kp.publicKey, NETWORK);
  const wallet: StoredWallet = { address, privateKey: bytesToHex(kp.privateKey), network: NETWORK };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

export function importWallet(privateKeyHex: string): StoredWallet {
  const privateKey = hexToBytes(privateKeyHex);
  const publicKey = publicKeyFromPrivate(privateKey);
  const address = encodeAddress(publicKey, NETWORK);
  const wallet: StoredWallet = { address, privateKey: privateKeyHex, network: NETWORK };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

export function clearWallet() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function signTransfer(params: {
  wallet: StoredWallet;
  utxos: { txId: string; outputIndex: number; amount: string }[];
  to: string;
  amountSgk: number;
  feeSgk?: number;
}) {
  const amountBase = BigInt(Math.round(params.amountSgk * 1e8));
  const fee = BigInt(Math.round((params.feeSgk ?? 0.01) * 1e8));

  let total = 0n;
  const chosen: { txId: string; outputIndex: number; amount: bigint }[] = [];
  for (const u of params.utxos) {
    chosen.push({ txId: u.txId, outputIndex: u.outputIndex, amount: BigInt(u.amount) });
    total += BigInt(u.amount);
    if (total >= amountBase + fee) break;
  }
  if (total < amountBase + fee) {
    throw new Error(
      `Insufficient funds: have ${Number(total) / 1e8} SGK, need ${Number(amountBase + fee) / 1e8} SGK (incl. fee)`
    );
  }

  const change = total - amountBase - fee;
  const outputs = [{ amount: amountBase, address: params.to }];
  if (change > 0n) outputs.push({ amount: change, address: params.wallet.address });

  const privateKey = hexToBytes(params.wallet.privateKey);
  const publicKey = publicKeyFromPrivate(privateKey);

  const tx = buildTransaction({
    inputsToSpend: chosen.map((u) => ({ ...u, address: params.wallet.address })),
    outputs,
    privateKey,
    publicKey,
  });

  // wire format: bigint amounts as strings
  return { ...tx, outputs: tx.outputs.map((o) => ({ ...o, amount: o.amount.toString() })) };
}
