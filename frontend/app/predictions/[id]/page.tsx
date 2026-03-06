import type { Metadata } from "next";

// Mock prediction data
const predictionsData: Record<number, {
    id: number;
    trader: string;
    claim: string;
    disambiguated: string;
    submitted: string;
    resolves: string;
    resolvedAt: string;
    status: "PENDING" | "TRUE" | "FALSE" | "INCONCLUSIVE";
    contractAddress: string;
    evidenceJson: string;
}> = {
    47: {
        id: 47,
        trader: "trader_x",
        claim: "BNB hits $1000 by Dec 2026",
        disambiguated: "BNB/USD spot price will close above $1,000 on Binance on or before Dec 31, 2026 23:59 UTC",
        submitted: "Mar 6, 2026",
        resolves: "Dec 31, 2026",
        resolvedAt: "2026-12-31 23:59 UTC",
        status: "FALSE",
        contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
        evidenceJson: `{
  "outcome": "NO",
  "resolved_at": "2026-12-31T23:59:00Z",
  "evidence": [
    "Binance API (api.binance.com) fetched 2026-12-31T23:59:00Z states BNB/USDT spot price is $985.40",
    "Chainlink BSC Feed (0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE) states BNB/USD is $985.55"
  ],
  "reasoning": "The claim demands BNB/USD close above $1,000. All data sources confirm it closed below that mark."
}`,
    },
};

const defaultPrediction = {
    id: 0,
    trader: "unknown",
    claim: "Sample prediction",
    disambiguated: "Sample disambiguated prediction text",
    submitted: "Jan 1, 2026",
    resolves: "Dec 31, 2026",
    resolvedAt: "Pending",
    status: "PENDING" as const,
    contractAddress: "0x0000000000000000000000000000000000000000",
    evidenceJson: "{\n  \"status\": \"waiting for expiry\"\n}",
};

export async function generateMetadata({
    params,
}: {
    params: { id: string };
}): Promise<Metadata> {
    const { id } = params;
    const prediction = predictionsData[parseInt(id)] || defaultPrediction;
    return {
        title: `Claim #${id} — Rector`,
        description: prediction.disambiguated,
    };
}

export default function PredictionPage({
    params,
}: {
    params: { id: string };
}) {
    const { id } = params;
    const prediction = predictionsData[parseInt(id)] || { ...defaultPrediction, id: parseInt(id) };

    // Translate TRUE/FALSE to YES/NO for the massive pill
    const getPillText = (status: string) => {
        if (status === "TRUE") return "YES";
        if (status === "FALSE") return "NO";
        return "PENDING";
    };

    const pillClass = prediction.status.toLowerCase();

    return (
        <div className="container" style={{ maxWidth: "800px" }}>

            {/* ── Header Area ── */}
            <div className="mb-8 mt-8">
                <div className="logic-label mb-2" style={{ letterSpacing: "0.1em" }}>CLAIM</div>
                <h1 className="hero-title" style={{ textAlign: "left", fontSize: "2.5rem", letterSpacing: "-0.02em", marginBottom: "2.5rem" }}>
                    {prediction.disambiguated}
                </h1>

                <div className="logic-label mb-2" style={{ letterSpacing: "0.1em" }}>CURRENT STATUS</div>
                <div className={`status-pill-massive ${pillClass}`}>
                    {getPillText(prediction.status)}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                    <span>Resolve {prediction.resolves}</span>
                    <span className="btn-badge-dark">✓ Attested</span>
                </div>
            </div>

            {/* ── Verification Box ── */}
            <div className="card mb-4" style={{ padding: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
                    <h3 className="card-title" style={{ fontSize: "1.25rem", margin: 0 }}>Verification</h3>
                    <button className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>Join to Run Verification</button>
                </div>

                <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                    <span style={{ color: "var(--text-secondary)" }}>📋</span>
                    <span style={{ fontWeight: 600 }}>Details</span>
                    <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>▼</span>
                </div>

                <div style={{ padding: "2rem" }}>
                    <div className="logic-label mb-4" style={{ letterSpacing: "0.1em" }}>LOG</div>

                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "2rem", fontFamily: "var(--font-mono)" }}>
                        <span>{prediction.resolvedAt} • <span style={{ background: "var(--red)", color: "#fff", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: "bold" }}>{getPillText(prediction.status)}</span></span>
                        <span style={{ color: "var(--text-secondary)", cursor: "pointer" }}>Save Onchain →</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start" }}>
                        <div className="pfp-ai">AI</div>
                        <div className="card-mono" style={{ flex: 1, border: "none", background: "transparent", padding: 0 }}>
                            <span style={{ color: "var(--text-muted)" }}>```json</span><br />
                            {prediction.evidenceJson}<br />
                            <span style={{ color: "var(--text-muted)" }}>```</span>
                        </div>
                    </div>

                    <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                        <span className="hover-text-primary" style={{ color: "var(--text-muted)", fontSize: "0.85rem", cursor: "pointer", transition: "color 0.2s" }}>Expand Logs</span>
                    </div>
                </div>
            </div>

            {/* ── Trigger Box ── */}
            <div className="card" style={{ padding: "0" }}>
                <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
                    <h3 className="card-title" style={{ fontSize: "1.25rem", margin: 0 }}>Trigger</h3>
                </div>
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                    Escrow funds when this claim resolves or connect it to your own smart contract. <a href="#" style={{ textDecoration: "underline" }}>Learn more</a>
                </div>
            </div>

            <div style={{ marginTop: "6rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: "24px", height: "36px", border: "2px solid var(--text-primary)", borderRadius: "12px", position: "relative" }}>
                    <div style={{ width: "4px", height: "8px", background: "var(--text-primary)", borderRadius: "2px", position: "absolute", top: "4px", left: "50%", transform: "translateX(-50%)" }}></div>
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>@ConductorBot_</div>
            </div>

        </div>
    );
}
