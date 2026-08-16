import { api, formatSgk } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let briefing: any, status: any, info: any, blocks: any[] = [];
  let error: string | null = null;

  try {
    [briefing, status, info, blocks] = await Promise.all([
      api.briefing(),
      api.status(),
      api.blockchainInfo(),
      api.latestBlocks(8),
    ]);
  } catch (e: any) {
    error = e.message;
  }

  if (error) {
    return (
      <div className="warn">
        Could not reach the compromised node at <code>{api.nodeUrl}</code>: {error}
        <br />
        Set <code>NEXT_PUBLIC_GL_NODE_URL</code> to your deployed Render node URL.
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Incident Briefing</div>
      <div className="panel prose" style={{ marginBottom: 32 }}>
        {briefing.message}
      </div>

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
          <div className="stat-label">Mempool</div>
          <div className="stat-value">{status.mempoolSize} pending</div>
        </div>
        <div className="panel">
          <div className="stat-label">Difficulty</div>
          <div className="stat-value">{info.difficulty} bits</div>
        </div>
      </div>

      <div className="section-title">Treasury (drained target)</div>
      <div className="panel grid grid-2">
        <div>
          <div className="stat-label">Address</div>
          <a href={`/lookup?address=${briefing.treasuryAddress}`} className="hash">
            {briefing.treasuryAddress}
          </a>
        </div>
        <div>
          <div className="stat-label">Remaining Balance</div>
          <div className="stat-value danger">{formatSgk(briefing.treasuryAmount)} SGK (nominal)</div>
        </div>
      </div>

      <div className="section-title">Genesis</div>
      <div className="panel">
        <div className="hash">{info.genesisHash}</div>
      </div>

      <div className="section-title">Recent Blocks</div>
      <table>
        <thead>
          <tr><th>Height</th><th>Hash</th><th>Txs</th></tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.hash}>
              <td>{b.height}</td>
              <td><a href={`/block/${b.hash}`} className="hash">{b.hash}</a></td>
              <td>{b.txCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
