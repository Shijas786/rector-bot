"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

// ABI for the PredictionRegistry to fetch counts and details
const REGISTRY_ABI = [
    "function count() view returns (uint256)",
    "function getPrediction(uint256 _id) view returns (tuple(uint256 id, address submitter, string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, uint8 status, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature, uint256 createdAt, uint256 resolvedAt))"
];

// Fallback to bsc testnet if not provided
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x98188151A407DF6D41A25fcc95f00eD6aC1bb596";

interface Prediction {
    id: number;
    disambiguated: string;
    resolvesAt: string;
    status: number; // 0 PENDING, 1 RESOLVED, 2 INCONCLUSIVE, 3 EXPIRED
    outcome: boolean;
    confidence: number;
    reasoning: string;
}

export default function LiveFeedPage() {
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPredictions = async () => {
            try {
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const contract = new ethers.Contract(CONTRACT_ADDRESS, REGISTRY_ABI, provider);

                const totalCount: bigint = await contract.count();
                const count = Number(totalCount);

                // Fetch the latest 10
                const fetchCount = Math.min(count, 10);
                const newPredictions: Prediction[] = [];

                for (let i = 0; i < fetchCount; i++) {
                    const id = count - i;
                    const p = await contract.getPrediction(id);
                    newPredictions.push({
                        id: Number(p.id),
                        disambiguated: p.disambiguated,
                        resolvesAt: new Date(Number(p.resolutionDate) * 1000).toLocaleString(),
                        status: Number(p.status),
                        outcome: p.outcome,
                        confidence: Number(p.confidence),
                        reasoning: p.reasoning
                    });
                }

                setPredictions(newPredictions);
            } catch (err) {
                console.error("Failed to fetch live feed:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchPredictions();

        // Poll every 15 seconds
        const interval = setInterval(fetchPredictions, 15000);
        return () => clearInterval(interval);
    }, []);

    const getStatusPill = (status: number, outcome: boolean) => {
        if (status === 0) return <span className="p-1 px-3 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-500">PENDING</span>;
        if (status === 2) return <span className="p-1 px-3 rounded-full text-xs font-bold bg-gray-500/20 text-gray-500">INCONCLUSIVE</span>;
        if (status === 3) return <span className="p-1 px-3 rounded-full text-xs font-bold bg-red-500/20 text-red-500">EXPIRED</span>;

        // Status 1 (Resolved)
        if (outcome) return <span className="p-1 px-3 rounded-full text-xs font-bold bg-green-500/20 text-green-500">TRUE (YES)</span>;
        return <span className="p-1 px-3 rounded-full text-xs font-bold bg-red-500/20 text-red-500">FALSE (NO)</span>;
    };

    return (
        <div className="container" style={{ maxWidth: "800px", paddingTop: "2rem", paddingBottom: "4rem" }}>
            <div className="text-center mb-8">
                <h1 className="hero-title" style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Live Network Feed</h1>
                <p style={{ color: "var(--text-secondary)" }}>Real-time Agentic Verification directly from BNB Smart Chain.</p>
            </div>

            {loading && predictions.length === 0 ? (
                <div className="text-center" style={{ color: "var(--text-muted)", padding: "3rem" }}>Connecting to blockchain...</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {predictions.map((p) => (
                        <div key={p.id} className="card" style={{ padding: "1.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                    Claim #{p.id}
                                </div>
                                <div>
                                    {getStatusPill(p.status, p.outcome)}
                                </div>
                            </div>

                            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "1rem", lineHeight: "1.4" }}>
                                {p.disambiguated}
                            </h3>

                            {p.status === 1 && (
                                <div className="card-mono" style={{ padding: "1rem", marginTop: "1rem", fontSize: "0.85rem" }}>
                                    <span style={{ color: "var(--text-muted)" }}>Agent Reasoning:</span><br />
                                    {p.reasoning}
                                </div>
                            )}

                            <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                                <span>Resolves: {p.resolvesAt}</span>
                                {p.status === 1 && <span>Confidence: {p.confidence}%</span>}
                            </div>
                        </div>
                    ))}

                    {predictions.length === 0 && !loading && (
                        <div className="text-center" style={{ color: "var(--text-muted)", padding: "3rem" }}>No predictions found on this network.</div>
                    )}
                </div>
            )}
        </div>
    );
}
