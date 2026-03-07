import express from "express";
import {
    handleAnalyse,
    handleLeaderboard,
    handleMyStats,
    extractResolutionDate,
    executePredictionPipeline,
    disambiguatePrediction
} from "./index.js";
import { prisma } from "./db/prisma.js";

const app = express();
app.use(express.json());

const PORT = process.env.AGENT_API_PORT || 3001;

// 1. Live Crypto Price (Proxied from Binance for the bot)
app.get("/price/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
        const data = await r.json() as { symbol: string, price: string };
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Record Prediction (Disambiguate + Execute)
app.post("/predict", async (req, res) => {
    try {
        const { telegramId, username, claimText } = req.body;

        if (!telegramId || !claimText) {
            return res.status(400).json({ error: "Missing required fields: telegramId, claimText" });
        }

        // 1. Ensure user exists
        const user = await prisma.user.upsert({
            where: { telegramId: String(telegramId) },
            update: { username },
            create: { telegramId: String(telegramId), username },
        });

        // 2. Disambiguate
        const resolutionDate = extractResolutionDate(claimText);
        const disambiguation = await disambiguatePrediction(claimText, resolutionDate);

        // 3. Execute
        const resultMessage = await executePredictionPipeline(user.id, String(telegramId), disambiguation);

        res.json({ message: resultMessage });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Leaderboard
app.get("/leaderboard", async (req, res) => {
    try {
        const result = await handleLeaderboard();
        res.json({ message: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 4. User Stats
app.get("/stats/:telegramId", async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        const result = await handleMyStats(user.id, telegramId);
        res.json({ message: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Rector Agent API running on port ${PORT}`);
});
