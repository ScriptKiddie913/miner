import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "GHOST LEDGER — Compromised Node Monitor",
  description: "Synthetic Dawn series — live telemetry for the compromised SagnikChain node",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">
              GHOST<span className="accent">_LEDGER</span>
              <span className="tag">// synthetic dawn</span>
            </a>
            <nav>
              <a href="/">Overview</a>
              <a href="/blocks">Blocks</a>
              <a href="/lookup">Lookup</a>
            </nav>
          </header>
          <div className="alertbar">
            NODE STATUS: COMPROMISED — VESSEL-7 ACTIVITY DETECTED — MONITORING ONLY, DO NOT TRUST
          </div>
          <main>{children}</main>
          <footer>
            SYNTHETIC DAWN series · GHOST LEDGER · flag format <code>syndwn{"{"}...{"}"}</code>
          </footer>
        </div>
      </body>
    </html>
  );
}
