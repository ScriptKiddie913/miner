import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BlockDetailPage({ params }: { params: { hash: string } }) {
  const block = await api.block(params.hash);
  return (
    <div>
      <div className="section-title">Block Header</div>
      <div className="panel grid grid-2">
        <div>
          <div className="stat-label">Hash</div>
          <div className="hash">{block.hash}</div>
        </div>
        <div>
          <div className="stat-label">Previous Hash</div>
          <div className="hash">
            <a href={`/block/${block.header.previousHash}`}>{block.header.previousHash}</a>
          </div>
        </div>
        <div>
          <div className="stat-label">Merkle Root</div>
          <div className="hash">{block.header.merkleRoot}</div>
        </div>
        <div>
          <div className="stat-label">Timestamp</div>
          <div>{new Date(block.header.timestamp * 1000).toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Difficulty</div>
          <div>{block.header.difficulty} bits</div>
        </div>
        <div>
          <div className="stat-label">Nonce</div>
          <div>{block.header.nonce}</div>
        </div>
      </div>

      <div className="section-title">Transactions ({block.transactions.length})</div>
      {block.transactions.map((tx: any, i: number) => (
        <div key={i} className="panel" style={{ marginBottom: 12 }}>
          <div className="muted">
            {Array.isArray(tx.inputs) && tx.inputs[0]?.coinbase ? "Coinbase" : `${tx.inputs.length} input(s)`} →{" "}
            {tx.outputs.length} output(s)
          </div>
          {tx.outputs.map((o: any, j: number) => (
            <div key={j} className="hash">
              → {o.address}: {(Number(o.amount) / 1e8).toLocaleString()} SGK
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
