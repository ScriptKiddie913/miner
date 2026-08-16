import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "GHOST LEDGER — Node Diagnostics",
  description: "Synthetic Dawn series — live diagnostics for the compromised SagnikChain node",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="sysbar">
            <span><span className="dot" />LINK ACTIVE</span>
            <span>SGK-TESTNET · NODE MONITOR v1</span>
          </div>

          <header className="topbar">
            <a href="/" className="brand">
              GHOST<span className="accent">_LEDGER</span>
              <span className="tag">Synthetic Dawn Series</span>
            </a>
            <nav>
              <a href="/">Overview</a>
              <a href="/blocks">Ledger</a>
              <a href="/lookup">Console</a>
            </nav>
          </header>

          <div className="alertbar">
            Node status: compromised — VESSEL-7 activity detected — telemetry only, do not trust balances at face value
          </div>

          <main>{children}</main>

          <footer>
            <span>SYNTHETIC DAWN · GHOST LEDGER</span>
            <span>flag format <code>syndwn{"{"}...{"}"}</code></span>
          </footer>
        </div>
      </body>
    </html>
  );
}
