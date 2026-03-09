import "dotenv/config";
import express from "express";
import {
    handleMessage,
    handleAnalyse,
    extractResolutionDate,
    executePredictionPipeline,
    disambiguatePrediction,
} from "./index.js";
import { prisma } from "./db/prisma.js";
import { mcpClient } from "./mcp/client.js";

const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)} - Query: ${JSON.stringify(req.query)}`);
    next();
});

const PORT = process.env.AGENT_API_PORT || 3001;

// Connect MCP client on startup
mcpClient.connect().then(() => {
    console.log("[API] MCP client connected");
}).catch((err: Error) => {
    console.error("[API] MCP client failed to connect:", err.message);
});

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "rector-agent" });
});

// 1. Live Crypto Price (Proxied from Binance)
app.get("/price/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
        const data = await r.json() as { symbol: string; price: string };
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Token Analysis
app.get("/analyse/:symbol", async (req, res) => {
    try {
        const { symbol } = req.params;
        const telegramId = (req.query.telegramId as string) || "system";
        const result = await handleAnalyse(telegramId, symbol.toUpperCase());
        res.json({ message: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Record Prediction (Disambiguate + Execute)
app.post("/predict", async (req, res) => {
    try {
        const { telegramId, username, claimText } = req.body;

        if (!telegramId || !claimText) {
            return res.status(400).json({ error: "Missing required fields: telegramId, claimText" });
        }

        // Ensure user exists WITH shadow wallet (critical for on-chain submission)
        let user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
        if (!user) {
            const { ethers } = await import("ethers");
            const wallet = ethers.Wallet.createRandom();
            user = await prisma.user.create({
                data: {
                    telegramId: String(telegramId),
                    username,
                    shadowAddress: wallet.address,
                    shadowPrivateKey: wallet.privateKey,
                } as any,
            });
            console.log(`[API] Created shadow wallet for ${username}: ${wallet.address}`);
        } else if (username) {
            user = await prisma.user.update({ where: { telegramId: String(telegramId) }, data: { username } }) as any;
        }

        // Disambiguate
        const resolutionDate = extractResolutionDate(claimText);
        const disambiguation = await (disambiguatePrediction as any)(claimText, resolutionDate);

        // Execute on-chain pipeline
        const resultMessage = await executePredictionPipeline(user!.id, String(telegramId), disambiguation);

        res.json({ message: resultMessage });
    } catch (error: any) {
        console.error("[API /predict] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3b. GET-based predict (easier for AI to call via web_fetch without POST body)
// Usage: /predict-get?telegramId=123&username=alice&claim=BNB+hits+900+next+month
app.get("/predict-get", async (req, res) => {
    try {
        const { telegramId, username, claim } = req.query;

        if (!telegramId || !claim) {
            return res.status(400).json({ error: "Missing telegramId or claim query params" });
        }

        const claimText = String(claim);

        // Ensure user exists WITH shadow wallet (critical for on-chain submission)
        let user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
        if (!user) {
            const { ethers } = await import("ethers");
            const wallet = ethers.Wallet.createRandom();
            user = await prisma.user.create({
                data: {
                    telegramId: String(telegramId),
                    username: String(username || "user"),
                    shadowAddress: wallet.address,
                    shadowPrivateKey: wallet.privateKey,
                } as any,
            });
        }

        const resolutionDate = extractResolutionDate(claimText);
        const disambiguation = await (disambiguatePrediction as any)(claimText, resolutionDate);
        const resultMessage = await executePredictionPipeline(user!.id, String(telegramId), disambiguation);

        res.json({ message: resultMessage });
    } catch (error: any) {
        console.error("[API /predict-get] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Full message handler (handles all commands)
app.post("/message", async (req, res) => {
    try {
        const { telegramId, username, text } = req.body;
        if (!telegramId || !text) {
            return res.status(400).json({ error: "Missing telegramId or text" });
        }
        const result = await handleMessage(String(telegramId), username || "user", text);
        res.json({ message: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Rector Agent API running on port ${PORT}`);
});
