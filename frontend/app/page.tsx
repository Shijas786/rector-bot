import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rector Predictor",
  description: "Make predictions that resolve automatically onchain.",
};

export default function HomePage() {
  return (
    <div className="container" style={{ paddingBottom: "2rem" }}>
      {/* ── Hero Section ── */}
      <div className="mt-8 mb-8" style={{ marginTop: "6rem" }}>
        <h1 className="hero-title">Play with the Future</h1>

        <div className="logic-block">
          <div className="logic-row">
            <span className="logic-label">If</span>
            <div className="logic-input">
              <div className="pfp-sm" style={{ background: "linear-gradient(135deg, #F3BA2F, #e2a822)" }}></div>
              <span>BNB hits $1000 by December 2026</span>
            </div>
          </div>
          <div className="logic-row">
            <span className="logic-label">Then</span>
            <div className="logic-input">
              <div className="pfp-sm" style={{ background: "linear-gradient(135deg, #627EEA, #4a66d1)" }}></div>
              <span>execute smart contract payout</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "6rem" }}>
          <a href="/predictions/47" className="btn btn-primary">Make a Claim</a>
        </div>
      </div>

      <div className="text-center mb-4">
        <span className="btn-badge">USE CASES</span>
      </div>
      <h2 className="section-title" style={{ fontSize: "2.5rem", marginBottom: "3rem" }}>
        Power Prediction Markets, Bounties, and Wills
      </h2>

      {/* ── Horizontal Scrolling Ticker ── */}
      <div className="carousel-wrapper">
        <div className="carousel-container">
          <div className="scroll-card">
            <div className="scroll-card-image-placeholder"></div>
            <div className="scroll-card-title">M5 MacBook Pro Claim</div>
          </div>

          <div className="scroll-card" style={{ background: "linear-gradient(to bottom, #111, #0a0a0c)" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "1.5rem", fontWeight: "700" }}>
              @ConductorBot_
            </div>
            <div className="scroll-card-title">@ConductorBot_ Claim</div>
          </div>

          <div className="scroll-card" style={{ background: "linear-gradient(to bottom, #2a2a2c, #1a1a1c)" }}>
            <div style={{ position: "absolute", top: "30%", left: "10%", right: "10%", background: "#0e0e10", border: "1px solid #3f3f46", borderRadius: "8px", padding: "1rem", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--green)" }}>
              &gt; npm run resolve <br />
              &gt; verifying onchain...<br />
              &gt; status: true
            </div>
            <div className="scroll-card-title">Automated Bounties</div>
          </div>

          <div className="scroll-card">
            <div style={{ position: "absolute", top: "2rem", left: "50%", transform: "translateX(-50%)", width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #F3BA2F, #e2a822)" }}></div>
            <div className="scroll-card-title">Crypto Price Feeds</div>
          </div>
        </div>
      </div>

    </div>
  );
}
