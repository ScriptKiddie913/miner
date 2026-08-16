import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const blocks = await api.latestBlocks(50);
  return (
    <div>
      <div className="section-title">
        Ledger Feed <span className="count">{blocks.length} entries</span>
      </div>
      <table>
        <thead>
          <tr><th>Height</th><th>Block Hash</th><th>Txs</th><th>Difficulty</th></tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.hash}>
              <td>{b.height}</td>
              <td><a href={`/block/${b.hash}`} className="hash">{b.hash}</a></td>
              <td>{b.txCount}</td>
              <td>{b.difficulty} bits</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
