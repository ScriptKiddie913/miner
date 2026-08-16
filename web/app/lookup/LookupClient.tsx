"use client";

import { useState } from "react";
import { api, formatSgk } from "@/lib/api";

export default function LookupClient({ initialAddress }: { initialAddress: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [result, setResult] = useState<any>(null);
  const [vault, setVault] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setError(null);
    setResult(null);
    setVault(null);
    setLoading(true);
    try {
      const info = await api.address(address.trim());
      setResult(info);
      const v = await api.vaultStatus(address.trim());
      setVault(v);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="section-title">Query Console</div>
      <div className="panel raised" style={{ marginBottom: 24 }}>
        <div className="stat-label" style={{ marginBottom: 10 }}>address::query</div>
        <input
          placeholder="sgk1... / sgt1..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button onClick={lookup} disabled={loading || !address.trim()}>
          {loading ? "querying node…" : "run query"}
        </button>
      </div>

      {error && <div className="warn">{error}</div>}

      {result && (
        <>
          <div className="section-title">Balance Readout</div>
          <div className="readout nominal" style={{ marginBottom: 24 }}>
            <div className="hash" style={{ marginBottom: 12 }}>{result.address}</div>
            <div className="stat-value verified">{formatSgk(result.balance)} SGK</div>
            <div className="stat-sub">{result.utxos.length} spendable UTXO(s)</div>
          </div>

          {vault && (
            <>
              <div className="section-title">Vault Status</div>
              <div className={`readout ${vault.sealed ? "anomalous" : "critical"}`}>
                {vault.sealed ? (
                  <>
                    <div className="stat-value anomaly" style={{ fontSize: 16 }}>SEALED</div>
                    <div className="stat-sub">
                      requires {formatSgk(vault.required)} SGK at this address · currently {formatSgk(vault.current)} SGK
                    </div>
                  </>
                ) : (
                  <>
                    <div className="stat-value critical" style={{ fontSize: 16 }}>THRESHOLD MET</div>
                    <div className="stat-sub" style={{ marginTop: 6 }}>
                      Retrieving the ciphertext still requires proving ownership of this address's
                      private key via a signed challenge (<code>POST /api/vault/unlock</code>). This
                      console is read-only and doesn't hold your keys.
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
