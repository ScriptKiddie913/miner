import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const blocks = await api.latestBlocks(50);
  return (
    <div>
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
