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

function RunbookPreview({ text, claimText, onFinalize, isRecording }: { text: string; claimText?: string; onFinalize?: (text: string) => void; isRecording?: boolean }) {
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

      {onFinalize && claimText && (
        <button 
          className="btn" 
          onClick={() => onFinalize(claimText)}
          disabled={isRecording}
          style={{ 
            width: "100%", 
            background: "#fff", 
            color: "#000", 
            marginTop: "2rem", 
            fontWeight: "700", 
            padding: "1rem",
            fontSize: "1rem",
            borderRadius: "999px"
          }}
        >
          {isRecording ? "FINALIZING..." : "Finalize Claim"}
        </button>
      )}
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
  const [predictionIdx, setPredictionIdx] = useState(0);

  const heroPredictions = [
    {
      ifText: "Tesla stock doubles this year",
      ifIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/tesla_logo_circle_1773816707092.png",
      thenText: "donate $500 to FIRE Foundation",
      thenIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/heart_charity_circle_1773816792158.png"
    },
    {
      ifText: "Bitcoin hits $100,000",
      ifIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/bitcoin_logo_circle_1773816806695.png",
      thenText: "send 1.5 BNB to @alpha_vault",
      thenIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/media__1773637137219.png" // Placeholder or similar
    },
    {
      ifText: "Apple releases Foldable iPhone",
      ifIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/apple_logo_circle_1773816778312.png",
      thenText: "auto-buy 10 shares of AAPL",
      thenIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/apple_logo_circle_v2_1773816829786.png"
    },
    {
      ifText: "ETH reaches $5,000",
      ifIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/eth_logo_circle_v2_1773817030753.png",
      thenText: "unlock 'Whale' status badge",
      thenIcon: "/Users/shijas/.gemini/antigravity/brain/8c29d555-0a62-4cd4-a456-ca12adc00d02/final_project_success_verification_1773733447543.webp"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setPredictionIdx(prev => (prev + 1) % heroPredictions.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);
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
          username: "Web Explorer",
          confirm: true
        })
      });
      const data = await res.json();
      
      if (data.message && (data.message.includes("CONFIRMED") || data.message.includes("#"))) {
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
        <h1 className="hero-title" style={{ fontSize: "clamp(3rem, 10vw, 5.5rem)", marginBottom: "3rem" }}>Play with the Future</h1>
        
        <div className="logic-container">
          {/* IF Block */}
          <div key={`if-${predictionIdx}`} className="logic-box" style={{ animation: "fadeIn 0.5s ease" }}>
            <span className="logic-box-label">IF</span>
            <div className="logic-box-content">
              <div className="logic-icon-circle">
                <img src={heroPredictions[predictionIdx].ifIcon} alt="Icon" />
              </div>
              <div className="logic-box-text">{heroPredictions[predictionIdx].ifText}</div>
            </div>
          </div>

          {/* THEN Block */}
          <div key={`then-${predictionIdx}`} className="logic-box" style={{ animation: "fadeIn 0.5s ease 0.2s both" }}>
            <span className="logic-box-label">THEN</span>
            <div className="logic-box-content">
              <div className="logic-icon-circle">
                <img src={heroPredictions[predictionIdx].thenIcon} alt="Action" />
              </div>
              <div className="logic-box-text">{heroPredictions[predictionIdx].thenText}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          <button className="btn" style={{ background: '#fff', color: '#000', padding: '0.75rem 2rem', fontWeight: '600' }}>Learn More</button>
          <button onClick={() => document.getElementById('create-claim')?.scrollIntoView({ behavior: 'smooth' })} className="btn btn-secondary" style={{ padding: '0.75rem 2rem' }}>Make a Claim</button>
        </div>
      </section>

      {/* ── How it Works Section ── */}
      <section className="info-section">
        <h2 className="info-heading">Make Claims that Resolve Automatically</h2>
        
        <div className="info-grid">
          {/* List Card */}
          <div className="info-card">
            <h3>How it Works</h3>
            <ul className="info-list">
              <li>Make a claim</li>
              <li>Create a verification runbook</li>
              <li>Resolve automatically</li>
              <li>Attest onchain</li>
            </ul>
          </div>

          {/* Runbook Preview Card */}
          <div className="info-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Claim Runbook</h3>
              <div className="btn-badge" style={{ fontSize: '0.6rem', padding: '0.2rem 0.6rem', opacity: 0.6 }}>PREVIEW</div>
            </div>
            
            <div className="runbook-mock">
              <div className="header"># Claim Runbook</div>
              
              <div className="section">## Metadata</div>
              <span className="item">- RunbookID: example-followers-500k</span>
              <span className="item">- ResolveAt: 2026-06-01T00:00:00Z</span>
              
              <div className="section">## Decision</div>
              <p style={{ margin: '0.5rem 0', fontStyle: 'italic', color: '#aaa' }}>
                "The X (Twitter) account @example will have at least 500,000 followers."
              </p>
              
              <div className="section">## Primary Verification</div>
              <span className="item">- Primary source: https://x.com/example</span>
              <span className="item">- Exact check: Read the follower count displayed on the profile page</span>
              <span className="item">- Success condition: follower_count &gt;= 500,000</span>
            </div>
          </div>
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
                <RunbookPreview 
                  text={msg.text} 
                  claimText={msg.runbookClaim} 
                  onFinalize={handleFinalRecord} 
                  isRecording={isRecording}
                />
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

