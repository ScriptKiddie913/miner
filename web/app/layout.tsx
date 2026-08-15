import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SagnikChain Explorer",
  description: "SGK — SagnikChain testnet explorer and web wallet",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">
              SAGNIK<span className="accent">CHAIN</span>
            </a>
            <nav>
              <a href="/">Overview</a>
              <a href="/blocks">Blocks</a>
              <a href="/wallet">Wallet</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer>
            SGK · SagnikChain testnet · not a real financial product · educational protocol
          </footer>
        </div>
      </body>
    </html>
  );
}
