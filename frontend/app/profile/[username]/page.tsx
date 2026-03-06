import type { Metadata } from "next";

// Mock profile data keyed by username
const profiles: Record<string, {
    username: string;
    predictions: number;
    correct: number;
    accuracy: number;
    memberSince: string;
    history: Array<{
        id: number;
        claim: string;
        status: "TRUE" | "FALSE" | "PENDING" | "INCONCLUSIVE";
        resolvedDate: string;
        txHash: string;
    }>;
}> = {
    trader_x: {
        username: "trader_x",
        predictions: 47,
        correct: 38,
        accuracy: 80.8,
        memberSince: "Jan 2026",
        history: [
            { id: 47, claim: "BNB hits $1000 by Dec 2026", status: "PENDING", resolvedDate: "Dec 31, 2026", txHash: "" },
            { id: 35, claim: "BNB hits $800 by Feb 2026", status: "TRUE", resolvedDate: "Feb 14, 2026", txHash: "0x7f3a" },
            { id: 28, claim: "BTC dominance above 50% Q1", status: "TRUE", resolvedDate: "Mar 1, 2026", txHash: "0x9c4d" },
            { id: 22, claim: "ETH flips BTC by March", status: "FALSE", resolvedDate: "Mar 31, 2026", txHash: "0x3b8f" },
            { id: 18, claim: "BSC daily TX hits 5M in January", status: "TRUE", resolvedDate: "Jan 22, 2026", txHash: "0x1d5e" },
        ],
    },
};

const defaultProfile = {
    username: "unknown",
    predictions: 5,
    correct: 3,
    accuracy: 60,
    memberSince: "Feb 2026",
    history: [
        { id: 99, claim: "Sample prediction", status: "PENDING" as const, resolvedDate: "Dec 2026", txHash: "" },
    ],
};

export async function generateMetadata({
    params,
}: {
    params: { username: string };
}): Promise<Metadata> {
    const { username } = params;
    return {
        title: `@${username} — OpenClaw Predictor`,
        description: `View @${username}'s onchain prediction history.`,
    };
}

const getStatusDot = (status: string) => {
    switch (status) {
        case "TRUE": return "status-dot true";
        case "FALSE": return "status-dot false";
        default: return "status-dot pending";
    }
};

export default function ProfilePage({
    params,
}: {
    params: { username: string };
}) {
    const { username } = params;
    const profile = profiles[username] || { ...defaultProfile, username };

    return (
        <div className="container">
            <div className="mb-4">
                <h1 className="section-title" style={{ textAlign: "left", marginBottom: "0.5rem", fontSize: "2.5rem" }}>
                    @{profile.username}
                </h1>
                <p style={{ color: "var(--text-secondary)" }}>
                    Member since {profile.memberSince}
                </p>
            </div>

            <div className="stat-row">
                <div className="stat-item">
                    <span className="stat-value">{profile.predictions}</span>
                    <span className="stat-label">Predictions</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{profile.correct}</span>
                    <span className="stat-label">Correct</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">
                        <span style={{ color: profile.accuracy >= 70 ? "var(--green)" : "var(--text-primary)" }}>
                            {profile.accuracy}%
                        </span>
                    </span>
                    <span className="stat-label">Accuracy</span>
                </div>
            </div>

            <div className="mb-8">
                <h3 className="card-title mb-4">Prediction History</h3>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>STATUS</th>
                                <th>CLAIM</th>
                                <th>RESOLVED DATE</th>
                                <th>ONCHAIN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profile.history.map((p) => (
                                <tr key={p.id}>
                                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                                        <span className={getStatusDot(p.status)}></span>
                                        {p.status}
                                    </td>
                                    <td>
                                        <a href={`/predictions/${p.id}`} style={{ fontWeight: 500 }}>
                                            {p.claim}
                                        </a>
                                    </td>
                                    <td className="mono" style={{ color: "var(--text-secondary)" }}>{p.resolvedDate}</td>
                                    <td className="mono" style={{ color: "var(--text-secondary)" }}>
                                        {p.txHash ? (
                                            <a href={`https://testnet.bscscan.com/tx/${p.txHash}...`} target="_blank" rel="noopener">
                                                {p.txHash}... ↗
                                            </a>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
