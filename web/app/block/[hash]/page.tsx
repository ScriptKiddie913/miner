import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BlockDetailPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const res = await fetch(`${api.nodeUrl}/api/block/${hash}`, { cache: "no-store" });
  const block = await res.json();
  if (!res.ok) {
    return <div className="warn">{block.error ?? "block not found"}</div>;
  }

  return (
    <div>
      <div className="section-title">Block Record</div>
      <div className="panel grid grid-2">
        <div>
          <div className="stat-label">Hash</div>
          <div className="hash">{block.hash}</div>
        </div>
        <div>
          <div className="stat-label">Previous Hash</div>
          <div className="hash"><a href={`/block/${block.header.previousHash}`}>{block.header.previousHash}</a></div>
        </div>
        <div>
          <div className="stat-label">Merkle Root</div>
          <div className="hash">{block.header.merkleRoot}</div>
        </div>
        <div>
          <div className="stat-label">Difficulty</div>
          <div>{block.header.difficulty} bits</div>
        </div>
      </div>

      <div className="section-title">
        Transactions <span className="count">{block.transactions.length}</span>
      </div>
      {block.transactions.map((tx: any, i: number) => (
        <div key={i} className="panel" style={{ marginBottom: 10 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            {Array.isArray(tx.inputs) && tx.inputs[0]?.coinbase ? "Coinbase (block reward)" : `${tx.inputs.length} input(s)`} →{" "}
            {tx.outputs.length} output(s)
          </div>
          {tx.outputs.map((o: any, j: number) => (
            <div key={j} className="hash">
              → <a href={`/lookup?address=${o.address}`}>{o.address}</a>: {(Number(o.amount) / 1e8).toLocaleString()} SGK
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
