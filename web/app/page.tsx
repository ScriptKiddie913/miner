import { api, formatSgk } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let status: any, info: any, blocks: any[] = [];
  let error: string | null = null;

  try {
    [status, info, blocks] = await Promise.all([api.status(), api.blockchainInfo(), api.latestBlocks(10)]);
  } catch (e: any) {
    error = e.message;
  }

  if (error) {
    return (
      <div className="warn">
        Could not reach the node at <code>{api.nodeUrl}</code>: {error}
        <br />
        Set <code>NEXT_PUBLIC_SGK_NODE_URL</code> to your deployed Render node URL.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-4">
        <div className="panel">
          <div className="stat-label">Network</div>
          <div className="stat-value">{status.network}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Block Height</div>
          <div className="stat-value">{status.height}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Difficulty</div>
          <div className="stat-value">{info.difficulty} bits</div>
        </div>
        <div className="panel">
          <div className="stat-label">Mempool</div>
          <div className="stat-value">{status.mempoolSize} pending</div>
        </div>
      </div>

      <div className="section-title">Chain Tip</div>
      <div className="panel">
        <div className="hash">{status.tipHash}</div>
      </div>

      <div className="section-title">Latest Blocks</div>
      <table>
        <thead>
          <tr>
            <th>Height</th>
            <th>Hash</th>
            <th>Txs</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b: any) => (
            <tr key={b.hash}>
              <td>{b.height}</td>
              <td>
                <a href={`/block/${b.hash}`} className="hash">
                  {b.hash}
                </a>
              </td>
              <td>{b.txCount}</td>
              <td>{new Date(b.timestamp * 1000).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
