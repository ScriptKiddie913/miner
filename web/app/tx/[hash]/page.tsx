import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TxDetailPage({ params }: { params: { hash: string } }) {
  const found = await api.transaction(params.hash);
  const { tx, blockHash, height } = found;

  return (
    <div>
      <div className="section-title">Transaction</div>
      <div className="panel">
        <div className="stat-label">Transaction ID</div>
        <div className="hash" style={{ marginBottom: 16 }}>{params.hash}</div>

        <div className="stat-label">Included in block</div>
        <div className="hash" style={{ marginBottom: 16 }}>
          <a href={`/block/${blockHash}`}>{blockHash}</a> (height {height})
        </div>

        <div className="grid grid-2">
          <div>
            <div className="stat-label">Inputs</div>
            {Array.isArray(tx.inputs) && tx.inputs[0]?.coinbase ? (
              <div className="muted">Coinbase (block reward)</div>
            ) : (
              tx.inputs.map((inp: any, i: number) => (
                <div key={i} className="hash">
                  {inp.prevTxId}:{inp.outputIndex}
                </div>
              ))
            )}
          </div>
          <div>
            <div className="stat-label">Outputs</div>
            {tx.outputs.map((o: any, i: number) => (
              <div key={i} className="hash">
                {o.address}: {(Number(o.amount) / 1e8).toLocaleString()} SGK
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
