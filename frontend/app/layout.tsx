import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rector Predictor",
  description: "Make predictions that resolve automatically onchain.",
  keywords: ["BNB", "predictions", "crypto", "onchain", "verification", "AI"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          {/* Left Vertical Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-icon">＋</div>
            <div className="sidebar-icon">ⓘ</div>
          </aside>

          {/* Main Content Area */}
          <div className="main-content">
            <nav className="top-nav">
              <a href="/" className="logo">Rector</a>

              <div className="nav-actions">
                <a href="https://t.me/RectorBot" target="_blank" rel="noopener" className="btn btn-secondary">
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--text-primary)', borderRadius: '50%', marginRight: '8px' }}></span>
                  BOT MODE
                </a>
                <a href="/profile/trader_x" className="btn btn-primary">Sign in</a>
              </div>
            </nav>

            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
