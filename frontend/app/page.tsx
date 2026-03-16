"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Prediction {
  id: number;
  disambiguated: string;
  status: "PENDING" | "TRUE" | "FALSE" | "INCONCLUSIVE";
  createdAt: string;
  user?: {
    username: string;
    telegramId: string;
  };
}

export default function HomePage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:3001/predictions")
      .then((res) => res.json())
      .then((data) => {
        setPredictions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch predictions:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="container" style={{ paddingBottom: "6rem" }}>
      {/* ── Hero Section ── */}
      <section className="text-center" style={{ marginTop: "10vh", marginBottom: "15vh" }}>
        <div className="btn-badge mb-4">PLAY WITH THE FUTURE</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)" }}>Agentic Verification</h1>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "400", color: "var(--text-secondary)", marginBottom: "2rem", marginTop: "-1rem" }}>via Claim Runbook</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "700px", margin: "0 auto 3rem auto", fontSize: "1.1rem", lineHeight: "1.6" }}>
          Rector shifts oracles from slow, coordination-heavy disputes to fast, agentic verification. Every claim is paired with an explicit verification plan—a **Claim Runbook**—executed automatically on-chain.
        </p>

        <div className="logic-block">
          <div className="logic-row">
            <span className="logic-label">If</span>
            <div className="logic-input">
              <div className="pfp-sm" style={{ background: "linear-gradient(135deg, #F3BA2F, #e2a822)" }}></div>
              <span>BTC hits $100k</span>
            </div>
          </div>
          <div className="logic-row">
            <span className="logic-label">Result</span>
            <div className="logic-input">
              <div className="pfp-ai">AI</div>
              <span>Resolved Verified Proof</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          <a href="https://t.me/RectorBot" className="btn btn-primary">Start Claiming</a>
          <a href="#feed" className="btn btn-secondary">Explore Live Feed</a>
        </div>
      </section>

      {/* ── Scrolling Live Ticker ── */}
      <div id="feed" className="mb-8">
        <div className="logic-label mb-4" style={{ letterSpacing: "0.2em", textIndent: "2.5rem" }}>LIVE FEED</div>
        
        <div className="carousel-wrapper">
          <div className="ticker-track">
            {predictions.map((p) => (
              <Link key={p.id} href={`/predictions/${p.id}`} className="claim-card">
                <div className="claim-card-text">{p.disambiguated}</div>
                <div className="claim-card-meta">
                  <span className="claim-card-source">ID #{p.id}</span>
                  <span className={`claim-card-status ${p.status.toLowerCase()}`}>{p.status}</span>
                </div>
              </Link>
            ))}
            {/* Duplicate for infinite effect */}
            {predictions.map((p) => (
              <Link key={`dup-${p.id}`} href={`/predictions/${p.id}`} className="claim-card">
                <div className="claim-card-text">{p.disambiguated}</div>
                <div className="claim-card-meta">
                  <span className="claim-card-source">ID #{p.id}</span>
                  <span className={`claim-card-status ${p.status.toLowerCase()}`}>{p.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── List View for Mobile/Table ── */}
      <div className="table-container mt-8">
        <table>
          <thead>
            <tr>
              <th>Claim</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center">Loading live claims...</td></tr>
            ) : predictions.length === 0 ? (
              <tr><td colSpan={3} className="text-center">No claims found. Start a claim on Telegram!</td></tr>
            ) : (
              predictions.map((p) => (
                <tr key={p.id} onClick={() => window.location.href = `/predictions/${p.id}`} style={{ cursor: 'pointer' }}>
                  <td>{p.disambiguated.substring(0, 80)}...</td>
                  <td>
                    <span className={`claim-card-status ${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

