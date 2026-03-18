import type { Metadata } from "next";
import Script from "next/script";
import TelegramInit from "./TelegramInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rector Oracle",
  description: "Agentic Verification via OpenClaw Runbooks.",
  keywords: ["BNB", "predictions", "crypto", "onchain", "verification", "AI", "OpenClaw", "Oracle"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <TelegramInit />

        <div className="app-container" style={{ display: 'block' }}>
          {/* Top Navigation */}
          <nav className="top-nav">
            <a href="/" className="logo">Rector</a>

            <div className="nav-actions">
              <a href="https://t.me/RectorBsc_bot" target="_blank" rel="noopener" className="btn btn-secondary">
                <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--yellow)', borderRadius: '50%', marginRight: '8px' }}></span>
                LIVE BOT
              </a>
              <a href="/" className="btn btn-primary" style={{ color: '#000' }}>Explore</a>
            </div>
          </nav>

          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
