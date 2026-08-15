const NODE_URL = process.env.NEXT_PUBLIC_SGK_NODE_URL ?? "http://localhost:8545";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${NODE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export interface StatusResponse {
  network: string;
  height: number;
  tipHash: string;
  mempoolSize: number;
  autoMining: boolean;
}

export interface BlockSummary {
  hash: string;
  height: number;
  timestamp: number;
  txCount: number;
  difficulty: number;
}

export interface FullBlock {
  hash: string;
  header: {
    version: number;
    previousHash: string;
    merkleRoot: string;
    timestamp: number;
    difficulty: number;
    nonce: number;
  };
  transactions: any[];
}

export interface AddressInfo {
  address: string;
  balance: string;
  utxoCount: number;
  utxos: { txId: string; outputIndex: number; amount: string }[];
}

export const api = {
  nodeUrl: NODE_URL,
  status: () => get<StatusResponse>("/api/status"),
  blockchainInfo: () => get<any>("/api/blockchain/info"),
  latestBlocks: (limit = 20) => get<BlockSummary[]>(`/api/blocks/latest?limit=${limit}`),
  block: (hash: string) => get<FullBlock>(`/api/block/${hash}`),
  transaction: (txid: string) => get<any>(`/api/tx/${txid}`),
  address: (addr: string) => get<AddressInfo>(`/api/address/${addr}`),
  mempool: () => get<any[]>("/api/mempool"),
  submitTransaction: async (tx: any) => {
    const res = await fetch(`${NODE_URL}/api/tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "transaction rejected");
    return data as { accepted: true; txId: string };
  },
  faucet: async (address: string) => {
    const res = await fetch(`${NODE_URL}/api/faucet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "faucet request failed");
    return data;
  },
};

export function formatSgk(baseUnits: string | bigint): string {
  const n = typeof baseUnits === "string" ? BigInt(baseUnits) : baseUnits;
  return (Number(n) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
}
