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

function RunbookPreview({ text }: { text: string }) {
  // Clean up markdown code blocks if present
  const cleanText = text.replace(/```markdown\n|```/g, "").trim();
  
  // Robust extraction logic
  const runbookId = cleanText.match(/RunbookID: ([^\s\n\-]+)/)?.[1] || "N/A";
  const createdAtRaw = cleanText.match(/CreatedAt: ([^\s\n]+)/)?.[1];
  const resolveAtRaw = cleanText.match(/ResolveAt: ([^\s\n]+)/)?.[1];
  const outcomeType = cleanText.match(/OutcomeType: ([^\s\n]+)/)?.[1] || "BINARY";
  const allowed = cleanText.match(/AllowedOutcomes: ([^\s\n,]+(?:, [^\s\n,]+)*)/)?.[1] || "YES, NO, INCONCLUSIVE";
  
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  };

  // Extract Decision
  const decisionMatch = cleanText.match(/## Decision\n([\s\S]*?)(?=\n##|$)/);
  const decisionText = decisionMatch ? decisionMatch[1].trim() : "N/A";

  return (
    <div className="runbook-preview-card">
      <div className="runbook-preview-header">
        <span className="runbook-preview-label">RUNBOOK PREVIEW</span>
        <div className="runbook-tag">READY</div>
      </div>
      
      <ul className="runbook-metadata">
        <li>RunbookID: {runbookId}</li>
        <li>CreatedAt: {formatDate(createdAtRaw)}</li>
        <li>ResolveAt: {formatDate(resolveAtRaw)}</li>
        <li>OutcomeType: {outcomeType}</li>
        <li>AllowedOutcomes: {allowed}</li>
      </ul>

      <div className="runbook-section-title">## Decision</div>
      <div className="runbook-decision-box">
        <p>{decisionText}</p>
      </div>
    </div>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://openclaw-predictor-agent-production.up.railway.app";

export default function HomePage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  // Protocol Chat State
  const [messages, setMessages] = useState<{ role: 'user' | 'rector', text: string, runbookClaim?: string }[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [webUserId] = useState(() => "web-user-" + Math.random().toString(36).substring(7));

  useEffect(() => {
    fetch(`${API_BASE}/predictions`)
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

  // Auto-scroll chat
  useEffect(() => {
    const anchor = document.getElementById('chat-anchor');
    anchor?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInputValue("");
    setIsTyping(true);

    try {
      // Use /message endpoint for stateful chat
      const res = await fetch(`${API_BASE}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          telegramId: webUserId, 
          username: "Web Explorer", 
          text: userText 
        })
      });
      const data = await res.json();
      
      // If the response contains a runbook request, we also trigger the /disambiguate for the nice UI
      if (data.message.toLowerCase().includes("shall i proceed") || data.message.toLowerCase().includes("understood")) {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://openclaw-predictor-agent-production.up.railway.app";
        const dRes = await fetch(`${apiBase}/disambiguate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimText: userText })
        });
        const dData = await dRes.json();
        if (dData.runbook) {
          setMessages(prev => [...prev, { 
            role: 'rector', 
            text: dData.runbook, 
            runbookClaim: userText 
          }]);
        } else {
          setMessages(prev => [...prev, { role: 'rector', text: data.message }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'rector', text: data.message }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'rector', text: "Protocol connection lost. Is the Agent API online?" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFinalRecord = async (claimText: string) => {
    setIsRecording(true);
    setStatusMessage("Recording on-chain via Shadow Wallet...");

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          claimText,
          telegramId: webUserId,
          username: "Web Explorer"
        })
      });
      const data = await res.json();
      
      if (data.message && data.message.includes("Prediction #")) {
        setMessages(prev => [...prev, { role: 'rector', text: "✅ Claim Recorded Successfully! Re-syncing protocol feed..." }]);
        setStatusMessage("Success! Prediction is now live.");
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://openclaw-predictor-agent-production.up.railway.app";
        const freshRes = await fetch(`${apiBase}/predictions`);
        const freshData = await freshRes.json();
        setPredictions(freshData);
      } else {
        setStatusMessage("Error: " + (data.error || "Failed to record."));
      }
    } catch (e) {
      setStatusMessage("Blockchain transaction failed.");
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: "6rem" }}>
      {/* ── Hero Section ── */}
      <section className="text-center" style={{ marginTop: "10vh", marginBottom: "15vh" }}>
        <div className="btn-badge mb-4">PLAY WITH THE FUTURE</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)" }}>Agentic Verification</h1>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "400", color: "var(--text-secondary)", marginBottom: "2rem", marginTop: "-1rem" }}>via Claim Runbook</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "700px", margin: "0 auto 3rem auto", fontSize: "1.1rem", lineHeight: "1.6" }}>
          Rector shifts oracles from slow, coordination-heavy disputes to fast, agentic verification. Every claim is paired with an explicit verification plan—a <strong style={{ color: "var(--yellow)" }}>Claim Runbook</strong>—executed automatically on-chain.
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
          <button onClick={() => document.getElementById('create-claim')?.scrollIntoView({ behavior: 'smooth' })} className="btn btn-primary">Start Claiming</button>
          <a href="#feed" className="btn btn-secondary">Explore Live Feed</a>
        </div>
      </section>

      {/* ── Protocol Chat Interaction ── */}
      <section id="create-claim" className="mb-20" style={{ maxWidth: "800px", margin: "0 auto 10vh auto" }}>
        <div className="logic-label mb-8 text-center" style={{ letterSpacing: "0.2em" }}>PROTOCOL INTERFACE ACTIVE</div>
        
        <div className="chat-container">
          {/* Initial Greeting */}
          <div className="chat-bubble rector">
            Welcome to Rector Protocol. I am your agentic oracle. <br/>
            What claim would you like to verify on-chain today?
          </div>

          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'rector' && (msg.text.includes('# Prediction Runbook') || msg.text.includes('RunbookID:')) ? (
                <RunbookPreview text={msg.text} />
              ) : (
                msg.text
              )}
            </div>
          ))}

          {isTyping && (
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          )}

          <div id="chat-anchor" />
        </div>

        <div className="chat-input-wrapper">
          <input 
            type="text" 
            className="chat-input"
            placeholder="Describe your prediction..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={isTyping}
          />
          <button className="chat-send-btn" onClick={handleSendMessage} disabled={isTyping}>
            {isTyping ? "..." : "↑"}
          </button>
        </div>
        
        {statusMessage && (
          <div className="mono text-center mt-4" style={{ fontSize: '0.8rem', color: 'var(--yellow)' }}>
            {statusMessage}
          </div>
        )}
      </section>

      {/* ── Scrolling Live Ticker ── */}
      <div id="feed" className="mb-8">
        <div className="logic-label mb-4" style={{ letterSpacing: "0.2em", textIndent: "2.5rem" }}>LIVE FEED</div>
        
        <div className="carousel-wrapper">
          <div className="ticker-track">
            {predictions.map((p) => (
              <Link key={p.id} href={`/predictions/${p.id}`} className="ticker-text-item">
                <span>{p.disambiguated}</span>
                <span className={`ticker-status ${p.status.toLowerCase()}`}>{p.status}</span>
              </Link>
            ))}
            {/* Duplicate for infinite effect */}
            {predictions.map((p) => (
              <Link key={`dup-${p.id}`} href={`/predictions/${p.id}`} className="ticker-text-item">
                <span>{p.disambiguated}</span>
                <span className={`ticker-status ${p.status.toLowerCase()}`}>{p.status}</span>
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

