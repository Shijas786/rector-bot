import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
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
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
});

// Process-level error handling to keep the service alive
process.on("unhandledRejection", (reason, promise) => {
    console.error(`[FATAL] Unhandled Rejection at:`, promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
    console.error(`[FATAL] Uncaught Exception:`, err);
});

const PORT = process.env.AGENT_API_PORT || 3001;


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
        const disambiguation = await disambiguatePrediction(claimText, resolutionDate);

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

        console.log(`[API] Processing prediction for user ${telegramId}: ${claimText}`);
        const resolutionDate = extractResolutionDate(claimText);
        console.log(`[API] Extracted resolution date: ${resolutionDate.toISOString()}`);
        const disambiguation = await disambiguatePrediction(claimText, resolutionDate);
        console.log(`[API] Disambiguation complete: ${disambiguation.disambiguated}`);
        const resultMessage = await executePredictionPipeline(user!.id, String(telegramId), disambiguation);
        console.log(`[API] Pipeline execution complete`);

        res.json({ message: resultMessage });
    } catch (error: any) {
        console.error("[API /predict-get] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});
 
// 4. List Predictions (for scrolling feed)
app.get("/predictions", async (req, res) => {
    try {
        const predictions = await prisma.prediction.findMany({
            orderBy: { id: "desc" },
            take: 20,
            include: {
                user: {
                    select: {
                        username: true,
                        telegramId: true
                    }
                }
            }
        });
        res.json(predictions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Get Single Prediction Detail
app.get("/predictions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const prediction = await prisma.prediction.findUnique({
            where: { id: parseInt(id) },
            include: {
                user: {
                    select: {
                        username: true,
                        telegramId: true,
                        shadowAddress: true
                    }
                }
            }
        });

        if (!prediction) {
            return res.status(404).json({ error: "Prediction not found" });
        }

        res.json(prediction);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Full message handler (handles all commands)
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

const startServer = async () => {
    try {
        console.log("[API] Connecting to MCP...");
        await mcpClient.connect();
        console.log("[API] MCP client connected");
        
        app.listen(PORT, () => {
            console.log(`🚀 Rector Agent API running on port ${PORT}`);
        });
    } catch (err: any) {
        console.error("[API] Failed to start:", err.message);
        process.exit(1);
    }
};

startServer();
