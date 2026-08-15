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
      <div className="section-title">Address Lookup</div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <input
          placeholder="sgk / sgt address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button onClick={lookup} disabled={loading || !address.trim()}>
          {loading ? "Querying node…" : "Check Balance + Vault Status"}
        </button>
      </div>

      {error && <div className="warn">{error}</div>}

      {result && (
        <>
          <div className="section-title">Balance</div>
          <div className="panel" style={{ marginBottom: 24 }}>
            <div className="hash" style={{ marginBottom: 12 }}>{result.address}</div>
            <div className="stat-value">{formatSgk(result.balance)} SGK</div>
            <div className="muted" style={{ marginTop: 8 }}>{result.utxos.length} spendable UTXO(s)</div>
          </div>

          {vault && (
            <>
              <div className="section-title">Vault Status</div>
              <div className={vault.sealed ? "warn" : "ok"}>
                {vault.sealed ? (
                  <>
                    VAULT SEALED
                    <div className="muted" style={{ marginTop: 6 }}>
                      need {formatSgk(vault.required)} SGK at this address, currently {formatSgk(vault.current)} SGK
                    </div>
                  </>
                ) : (
                  <>
                    VAULT CONDITION MET — balance threshold satisfied.
                    <div className="muted" style={{ marginTop: 6 }}>
                      Retrieving the actual ciphertext requires proving ownership of this address's
                      private key (a signed challenge) via <code>POST /api/vault/unlock</code> — this
                      dashboard is read-only and doesn't hold your keys.
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
