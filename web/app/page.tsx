import { api, formatSgk } from "@/lib/api";
import PulseTrace from "./PulseTrace";

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
        Uplink failed — could not reach the node at <code>{api.nodeUrl}</code>: {error}
        <br />
        Set <code>NEXT_PUBLIC_GL_NODE_URL</code> to your deployed Render node URL.
      </div>
    );
  }

  return (
    <div>
      <div className="casefile">
        <div className="stamp">Active Incident</div>
        <div className="incident-code">CASE // SYNTHETIC-DAWN-07 · SUBJECT: VESSEL-7 · NODE: {status.network}</div>
        <h1>GHOST LEDGER</h1>
        <p className="prose">{briefing.message}</p>
        <PulseTrace seed={status.tipHash} anomalous={status.mempoolSize > 0} />
      </div>

      <div className="section-title">Node Vitals</div>
      <div className="grid grid-4">
        <div className="readout nominal">
          <div className="stat-label">Block Height</div>
          <div className="stat-value verified">{status.height}</div>
          <div className="stat-sub">chain advancing normally</div>
        </div>
        <div className="readout nominal">
          <div className="stat-label">Difficulty</div>
          <div className="stat-value">{info.difficulty}<span style={{ fontSize: 12, color: "var(--text-dim)" }}> bits</span></div>
        </div>
        <div className={`readout ${status.mempoolSize > 0 ? "anomalous" : "nominal"}`}>
          <div className="stat-label">Mempool</div>
          <div className={`stat-value ${status.mempoolSize > 0 ? "anomaly" : ""}`}>{status.mempoolSize}</div>
          <div className="stat-sub">pending transaction(s)</div>
        </div>
        <div className="readout anomalous">
          <div className="stat-label">Integrity Check</div>
          <div className="stat-value anomaly">FAILED</div>
          <div className="stat-sub">v2 fast-path unverified</div>
        </div>
      </div>

      <div className="section-title">Compromised Asset — Foundation Treasury</div>
      <div className="panel raised" style={{ borderLeft: "3px solid var(--critical)" }}>
        <div className="grid grid-2">
          <div>
            <div className="stat-label">Address</div>
            <a href={`/lookup?address=${briefing.treasuryAddress}`} className="hash">
              {briefing.treasuryAddress}
            </a>
          </div>
          <div>
            <div className="stat-label">Nominal Holdings</div>
            <div className="stat-value critical">{formatSgk(briefing.treasuryAmount)} SGK</div>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 14 }}>
          Balance reflects on-chain state only. On-chain state is exactly what VESSEL-7 exploited —
          confirm what this figure actually means before assuming it's safe.
        </div>
      </div>

      <div className="section-title">Genesis</div>
      <div className="panel">
        <div className="hash">{info.genesisHash}</div>
      </div>

      <div className="section-title">
        Recent Ledger Activity <span className="count">last {blocks.length} blocks</span>
      </div>
      <table>
        <thead>
          <tr><th>Height</th><th>Block Hash</th><th>Txs</th></tr>
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
