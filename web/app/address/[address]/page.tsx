import { api, formatSgk } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AddressPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const info = await api.address(address);
  return (
    <div>
      <div className="section-title">Address</div>
      <div className="panel">
        <div className="hash" style={{ marginBottom: 16 }}>{info.address}</div>
        <div className="stat-label">Balance</div>
        <div className="stat-value">{formatSgk(info.balance)} SGK</div>
      </div>

      <div className="section-title">Spendable UTXOs ({info.utxoCount})</div>
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Output #</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {info.utxos.map((u, i) => (
            <tr key={i}>
              <td>
                <a href={`/tx/${u.txId}`} className="hash">{u.txId}</a>
              </td>
              <td>{u.outputIndex}</td>
              <td>{formatSgk(u.amount)} SGK</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
