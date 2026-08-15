"use client";

import { useEffect, useState } from "react";
import { createWallet, importWallet, loadWallet, clearWallet, signTransfer, type StoredWallet } from "@/lib/wallet";
import { api, formatSgk } from "@/lib/api";

export default function WalletPage() {
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<any[]>([]);
  const [importKey, setImportKey] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setWallet(loadWallet());
  }, []);

  async function refresh(w: StoredWallet) {
    try {
      const info = await api.address(w.address);
      setBalance(info.balance);
      setUtxos(info.utxos);
    } catch (e: any) {
      setStatus(`Could not fetch balance: ${e.message}`);
    }
  }

  useEffect(() => {
    if (wallet) refresh(wallet);
  }, [wallet]);

  if (!wallet) {
    return (
      <div>
        <div className="section-title">Web Wallet</div>
        <div className="warn">
          Private keys are generated and stored only in your browser (localStorage). They are never
          sent to any server. Clearing your browser data or switching devices means losing access
          unless you export and back up your key.
        </div>
        <div className="panel" style={{ marginBottom: 16 }}>
          <button onClick={() => setWallet(createWallet())}>Create New Wallet</button>
        </div>
        <div className="panel">
          <div className="stat-label">Or import an existing private key</div>
          <input
            placeholder="hex private key"
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
          />
          <button
            onClick={() => {
              try {
                setWallet(importWallet(importKey.trim()));
              } catch (e: any) {
                setStatus(`Import failed: ${e.message}`);
              }
            }}
          >
            Import
          </button>
          {status && <div className="warn" style={{ marginTop: 12 }}>{status}</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Your Wallet</div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="stat-label">Address</div>
        <div className="hash" style={{ marginBottom: 16 }}>{wallet.address}</div>
        <div className="stat-label">Balance</div>
        <div className="stat-value" style={{ marginBottom: 16 }}>
          {balance !== null ? `${formatSgk(balance)} SGK` : "loading…"}
        </div>
        <button onClick={() => refresh(wallet)}>Refresh Balance</button>{" "}
        <button
          onClick={async () => {
            setStatus("Requesting faucet funds…");
            try {
              const res = await api.faucet(wallet.address);
              setStatus(`Faucet sent ${formatSgk(res.amount)} SGK — tx ${res.txId}`);
              await refresh(wallet);
            } catch (e: any) {
              setStatus(`Faucet error: ${e.message}`);
            }
          }}
        >
          Request Testnet Coins
        </button>
      </div>

      <div className="section-title">Send SGK</div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <input placeholder="recipient address" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
        <input
          placeholder="amount in SGK"
          value={sendAmount}
          onChange={(e) => setSendAmount(e.target.value)}
        />
        <button
          onClick={async () => {
            setStatus("Signing and broadcasting…");
            try {
              const tx = signTransfer({
                wallet,
                utxos,
                to: sendTo.trim(),
                amountSgk: Number(sendAmount),
              });
              const res = await api.submitTransaction(tx);
              setStatus(`Sent! txId: ${res.txId}`);
              setSendTo("");
              setSendAmount("");
              await refresh(wallet);
            } catch (e: any) {
              setStatus(`Send failed: ${e.message}`);
            }
          }}
        >
          Sign &amp; Send
        </button>
        {status && <div className="muted" style={{ marginTop: 12 }}>{status}</div>}
      </div>

      <div className="section-title">Wallet Management</div>
      <div className="panel">
        <button onClick={() => setShowKey((s) => !s)}>
          {showKey ? "Hide" : "Export"} Private Key
        </button>{" "}
        <button
          onClick={() => {
            if (confirm("This removes the wallet from this browser. Make sure you exported your key first. Continue?")) {
              clearWallet();
              setWallet(null);
            }
          }}
        >
          Remove Wallet From This Browser
        </button>
        {showKey && (
          <div className="warn" style={{ marginTop: 12 }}>
            Never share this. Anyone with this key can spend your funds.
            <div className="hash" style={{ marginTop: 8 }}>{wallet.privateKey}</div>
          </div>
        )}
      </div>
    </div>
  );
}
