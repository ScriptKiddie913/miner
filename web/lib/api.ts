const NODE_URL = process.env.NEXT_PUBLIC_GL_NODE_URL ?? "http://localhost:8600";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${NODE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  nodeUrl: NODE_URL,
  briefing: () => get<any>("/api/briefing"),
  status: () => get<any>("/api/status"),
  blockchainInfo: () => get<any>("/api/blockchain/info"),
  latestBlocks: (limit = 20) => get<any[]>(`/api/blocks/latest?limit=${limit}`),
  address: (addr: string) => get<any>(`/api/address/${addr}`),
  vaultStatus: (addr: string) => get<any>(`/api/vault/status?address=${addr}`),
};

export function formatSgk(baseUnits: string | bigint): string {
  const n = typeof baseUnits === "string" ? BigInt(baseUnits) : baseUnits;
  return (Number(n) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
}
