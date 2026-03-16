"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Prediction {
  id: number;
  claim: string;
  disambiguated: string;
  runbookMarkdown: string;
  evidenceJson: string;
  status: "PENDING" | "TRUE" | "FALSE" | "INCONCLUSIVE";
  createdAt: string;
  resolutionTimestamp?: string;
  txHash?: string;
  user?: {
    username: string;
    shadowAddress: string;
  };
}

export default function PredictionPage({ params }: { params: { id: string } }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:3001/predictions/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setPrediction(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch prediction:", err);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) return <div className="container text-center" style={{ marginTop: "20vh" }}>Loading claim #{params.id}...</div>;
  if (!prediction) return <div className="container text-center" style={{ marginTop: "20vh" }}>Claim not found.</div>;

  const getStatusColor = (status: string) => {
    if (status === "TRUE") return "var(--green)";
    if (status === "FALSE") return "var(--red)";
    return "var(--yellow)";
  };

  return (
    <div className="container" style={{ maxWidth: "800px", paddingBottom: "6rem" }}>
      {/* ── Claim Header ── */}
      <div className="mb-8 mt-8">
        <div className="logic-label mb-2" style={{ letterSpacing: "0.2em" }}>CLAIM #{prediction.id}</div>
        <h1 className="hero-title" style={{ textAlign: "left", fontSize: "clamp(2rem, 5vw, 3.5rem)", marginBottom: "2rem" }}>
          {prediction.disambiguated}
        </h1>

        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "1.5rem 0" }}>
          <div className="stat-item">
            <div className="stat-label">STATUS</div>
            <div className="stat-value" style={{ color: getStatusColor(prediction.status), fontSize: "1.5rem" }}>
              {prediction.status === "PENDING" ? "RESOLVING..." : prediction.status}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">SUBMITTED</div>
            <div className="stat-value" style={{ fontSize: "1.5rem" }}>
              {new Date(prediction.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">ATTESTOR</div>
            <div className="stat-value" style={{ fontSize: "1.5rem", color: "var(--yellow)" }}>
              AI ORACLE
            </div>
          </div>
        </div>
      </div>

      {/* ── Verification Runbook ── */}
      <div className="mb-8">
        <div className="logic-label mb-4" style={{ letterSpacing: "0.2em" }}>VERIFICATION RUNBOOK</div>
        <div className="card-mono" style={{ background: "var(--bg-secondary)", padding: "2rem", fontSize: "0.9rem", lineHeight: "1.8", border: "1px solid var(--border)" }}>
          {prediction.runbookMarkdown ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{prediction.runbookMarkdown}</div>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Agentic runbook generation in progress...</span>
          )}
        </div>
      </div>

      {/* ── Proof of Resolution ── */}
      {prediction.status !== "PENDING" && (
        <div className="mb-8">
          <div className="logic-label mb-4" style={{ letterSpacing: "0.2em" }}>ON-CHAIN PROOF</div>
          <div className="card" style={{ padding: "1.5rem", background: "var(--bg-tertiary)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>EVIDENCE STORE</span>
                <span className="btn-badge-dark" style={{ border: "1px solid var(--green)", color: "var(--green)" }}>✓ GREENFIELD</span>
              </div>
              
              <div className="card-mono" style={{ background: "var(--bg-primary)", padding: "1rem", fontSize: "0.75rem", overflowX: "auto" }}>
                {prediction.evidenceJson}
              </div>

              {prediction.txHash && (
                <div style={{ marginTop: "1rem" }}>
                  <a 
                    href={`https://testnet.bscscan.com/tx/${prediction.txHash}`} 
                    target="_blank" 
                    rel="noopener" 
                    className="btn btn-secondary w-full"
                    style={{ width: "100%", justifyContent: "center", border: "1px solid var(--yellow)", color: "var(--yellow)" }}
                  >
                    View BscScan Proof
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer Link ── */}
      <div className="text-center mt-8">
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: "0.9rem", textDecoration: "underline" }}>
          ← Back to Claims Feed
        </Link>
      </div>

    </div>
  );
}

