import "dotenv/config";

import { prisma } from "./db/prisma.js";
import { mcpClient } from "./mcp/client.js";
import { analyseToken } from "./pipeline/analyse.js";
import { disambiguatePrediction, formatDisambiguation, DisambiguationResult } from "./pipeline/disambiguate.js";
export { disambiguatePrediction, formatDisambiguation };
export type { DisambiguationResult };
import { buildRunbook } from "./pipeline/buildRunbook.js";
import { uploadRunbook } from "./mcp/greenfield.js";
import { submitPrediction, getAccuracy, getPrediction } from "./mcp/bsc.js";
import { scheduleResolution, startWorker } from "./scheduler/queue.js";

/**
 * Rector Prediction Assistant — Entry Point
 *
 * This agent handles Telegram messages via Rector and routes them
 * to the appropriate pipeline:
 *   /analyse [token]   → Market analysis
 *   /predict [claim]    → Prediction submission
 *   /leaderboard        → Top predictors
 *   /mystats            → User's prediction history
 *   /check [id]         → Check prediction status
 *   /help               → All commands
 */

// In-memory conversation state (per user)
const userState = new Map<string, {
    lastDisambiguation?: DisambiguationResult;
    lastAnalysisResistance?: number;
    lastAnalysisSymbol?: string;
    awaitingConfirmation?: string;
}>();

/**
 * Process an incoming message from Rector/Telegram.
 */
export async function handleMessage(
    telegramId: string,
    username: string,
    text: string
): Promise<string> {
    // Ensure user exists in DB
    const user = await prisma.user.upsert({
        where: { telegramId },
        update: { username },
        create: { telegramId, username },
    });

    const state = userState.get(telegramId) || {};

    // Handle confirmation responses
    if (state.awaitingConfirmation) {
        const answer = text.trim().toLowerCase();
        if (answer === "yes" || answer === "y") {
            const result = await handleConfirmation(user.id, telegramId, state);
            userState.set(telegramId, {});
            return result;
        } else {
            userState.set(telegramId, {});
            return "Okay, cancelled. What would you like to do?\n\nType /help for all commands.";
        }
    }

    // Route commands
    const trimmed = text.trim();

    if (trimmed.startsWith("/analyse") || trimmed.startsWith("/analyze")) {
        const symbol = trimmed.split(/\s+/)[1];
        if (!symbol) return "Usage: /analyse [token]\nExample: /analyse BNB";
        return handleAnalyse(telegramId, symbol);
    }

    if (trimmed.startsWith("/predict")) {
        const claim = trimmed.replace("/predict", "").trim();
        if (!claim) return "Usage: /predict [your prediction]\nExample: /predict BNB hits $1000 before Dec 2026";
        return handlePredict(telegramId, claim);
    }

    if (trimmed === "/leaderboard") {
        return handleLeaderboard();
    }

    if (trimmed === "/mystats") {
        return handleMyStats(user.id, telegramId);
    }

    if (trimmed.startsWith("/check")) {
        const idStr = trimmed.split(/\s+/)[1];
        if (!idStr) return "Usage: /check [prediction_id]\nExample: /check 47";
        return handleCheck(parseInt(idStr));
    }

    if (trimmed.startsWith("/wallet")) {
        const address = trimmed.split(/\s+/)[1];
        if (!address || !address.startsWith("0x") || address.length !== 42) {
            return "❌ Please provide a valid BNB address:\nExample: /wallet 0x123...456";
        }

        await prisma.user.update({
            where: { telegramId },
            data: { walletAddress: address } as any,
        });

        return `✅ Wallet linked! Your predictions will now be attributed onchain to: \`${address}\``;
    }

    if (trimmed === "/help" || trimmed === "/start") {
        return handleHelp();
    }

    // Natural language — try to detect intent
    return `I didn't understand that. Here are my commands:

/analyse [token]     → AI market analysis
/predict [claim]     → submit a prediction
/leaderboard         → top predictors this month
/mystats            → your prediction history
/check [id]          → check prediction status
/help               → all commands`;
}

export async function handleAnalyse(telegramId: string, symbol: string): Promise<string> {
    try {
        const result = await analyseToken(symbol);
        userState.set(telegramId, {
            lastAnalysisResistance: result.resistance,
            lastAnalysisSymbol: result.symbol,
            awaitingConfirmation: "alert",
        });
        return result.formattedMessage;
    } catch (error: any) {
        return `❌ Could not analyse ${symbol.toUpperCase()}. Make sure it's a valid Binance pair.\n\nError: ${error.message}`;
    }
}

export async function handlePredict(telegramId: string, claim: string): Promise<string> {
    try {
        // Extract resolution date from claim or default to end of year
        const resolutionDate = extractResolutionDate(claim);
        const result = await disambiguatePrediction(claim, resolutionDate);

        userState.set(telegramId, {
            lastDisambiguation: result,
            awaitingConfirmation: "predict",
        });

        return formatDisambiguation(result);
    } catch (error: any) {
        return `❌ Could not process prediction.\n\nError: ${error.message}`;
    }
}

async function handleConfirmation(
    userId: string,
    telegramId: string,
    state: Record<string, unknown>
): Promise<string> {
    if (state.awaitingConfirmation === "predict" && state.lastDisambiguation) {
        const disambiguation = state.lastDisambiguation as DisambiguationResult;
        return executePredictionPipeline(userId, telegramId, disambiguation);
    }

    return "Nothing to confirm. Type /help for commands.";
}

/**
 * Execute the full onchain prediction pipeline.
 * Exported for use by MCP server.
 */
export async function executePredictionPipeline(
    userId: string,
    telegramId: string,
    disambiguation: DisambiguationResult
): Promise<string> {
    try {
        // Find user to get walletAddress
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const walletAddress = (user as any)?.walletAddress || "0x0000000000000000000000000000000000000000";

        // 1. Build runbook
        const tempId = Date.now();
        const runbook = await buildRunbook(disambiguation, tempId);

        // 2. Upload runbook to Greenfield
        const runbookRef = await uploadRunbook(tempId, runbook);

        // 3. Submit onchain
        const resolutionTimestamp = Math.floor(
            new Date(disambiguation.resolutionDate).getTime() / 1000
        );

        const { txHash, predictionId } = await submitPrediction(
            disambiguation.disambiguated.substring(0, 200),
            disambiguation.disambiguated,
            runbookRef,
            resolutionTimestamp,
            walletAddress // using real walletAddress as submitter
        );

        // 4. Save to database
        await prisma.prediction.create({
            data: {
                onchainId: predictionId,
                userId,
                claimText: disambiguation.disambiguated,
                disambiguated: disambiguation.disambiguated,
                successCriteria: disambiguation.successCriteria,
                primarySource: disambiguation.primarySource,
                runbookRef,
                resolutionDate: new Date(disambiguation.resolutionDate),
                txHashSubmit: txHash,
            },
        });

        // 5. Schedule auto-resolution
        await scheduleResolution(
            predictionId,
            new Date(disambiguation.resolutionDate),
            disambiguation.disambiguated,
            disambiguation.successCriteria
        );

        return `✦ Recording prediction onchain...

✓ Runbook stored on BNB Greenfield
✓ Prediction #${predictionId} live on BSC
✓ Auto-resolves: ${disambiguation.resolutionDate}

TX: bscscan.com/tx/${txHash}

Your prediction:
🔗 yoursite.xyz/predictions/${predictionId}

Your profile:
🔗 yoursite.xyz/@${telegramId}`;
    } catch (error: any) {
        return `❌ Failed to record prediction onchain.\n\nError: ${error.message}`;
    }
}

export async function handleLeaderboard(): Promise<string> {
    const users = await prisma.user.findMany({
        include: {
            predictions: {
                where: { status: "RESOLVED" },
            },
        },
    });

    const leaderboard = users
        .map((u) => ({
            username: u.username || u.telegramId,
            correct: u.predictions.filter((p) => p.outcome === true).length,
            total: u.predictions.length,
            accuracy: u.predictions.length > 0
                ? (u.predictions.filter((p) => p.outcome === true).length / u.predictions.length) * 100
                : 0,
        }))
        .filter((u) => u.total > 0)
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 10);

    if (leaderboard.length === 0) {
        return "🏆 No predictions resolved yet.\n\nBe the first! /predict [your prediction]";
    }

    const medals = ["🔥", "⭐", "🎯", "", "", "", "", "", "", ""];
    const rows = leaderboard
        .map((u, i) => `#${i + 1}  @${u.username}  ${u.correct}/${u.total}  ${u.accuracy.toFixed(0)}% ${medals[i] || ""}`)
        .join("\n");

    return `🏆 TOP PREDICTORS

Rank  Trader         Correct  Accuracy
${rows}

All verified onchain BSC ✅`;
}

export async function handleMyStats(userId: string, telegramId: string): Promise<string> {
    const predictions = await prisma.prediction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
    });

    if (predictions.length === 0) {
        return "📊 You have no predictions yet.\n\nGet started: /predict [your prediction]";
    }

    const resolved = predictions.filter((p) => p.status === "RESOLVED");
    const correct = resolved.filter((p) => p.outcome === true).length;

    const statusMap: Record<string, string> = {
        PENDING: "⏳",
        RESOLVED: "",
        INCONCLUSIVE: "⚠️",
        EXPIRED: "💀",
    };

    const rows = predictions
        .map((p) => {
            const emoji = p.status === "RESOLVED"
                ? (p.outcome ? "✅" : "❌")
                : statusMap[p.status];
            return `${emoji} ${p.claimText.substring(0, 50)}`;
        })
        .join("\n");

    return `📊 @${telegramId} Stats

Predictions: ${predictions.length}
Resolved: ${resolved.length}
Correct: ${correct}
Accuracy: ${resolved.length > 0 ? ((correct / resolved.length) * 100).toFixed(1) : 0}%

Recent:
${rows}`;
}

async function handleCheck(id: number): Promise<string> {
    const prediction = await prisma.prediction.findFirst({
        where: { onchainId: id },
    });

    if (!prediction) {
        return `❌ Prediction #${id} not found.`;
    }

    const statusEmoji: Record<string, string> = {
        PENDING: "⏳ PENDING",
        RESOLVED: prediction.outcome ? "✅ TRUE" : "❌ FALSE",
        INCONCLUSIVE: "⚠️ INCONCLUSIVE",
        EXPIRED: "💀 EXPIRED",
    };

    return `PREDICTION #${id}

Claim: ${prediction.claimText}
Status: ${statusEmoji[prediction.status]}
Submitted: ${prediction.createdAt.toISOString().split("T")[0]}
Resolves: ${prediction.resolutionDate.toISOString().split("T")[0]}
${prediction.reasoning ? `\nReasoning: ${prediction.reasoning}` : ""}
${prediction.txHashSubmit ? `\n🔗 bscscan.com/tx/${prediction.txHashSubmit}` : ""}`;
}

function handleHelp(): string {
    return `Hey! I'm Rector, your Binance trading assistant. I'm here to help you dominate the charts. 🚀

I can:
📊 **Analyse** any token
🚨 **Alert** you on price moves
🎯 **Verify** your predictions onchain

Try these commands:
/analyse BNB     → get my take on BNB
/predict BNB hits $1000 → record your call
/leaderboard     → see who's winning
/mystats         → check your accuracy
/check [id]      → view prediction proof

Ready to start? Just type \`/analyse BNB\``;
}

export function extractResolutionDate(text: string): string {
    // Try to extract date patterns
    const decMatch = text.match(/(?:dec|december)\s*(\d{4})/i);
    if (decMatch) return `${decMatch[1]}-12-31T23:59:00Z`;

    const monthYearMatch = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})/i);
    if (monthYearMatch) {
        const months: Record<string, string> = {
            jan: "01", feb: "02", mar: "03", apr: "04",
            may: "05", jun: "06", jul: "07", aug: "08",
            sep: "09", oct: "10", nov: "11", dec: "12",
        };
        const month = months[monthYearMatch[1].toLowerCase().substring(0, 3)];
        return `${monthYearMatch[2]}-${month}-28T23:59:00Z`;
    }

    const qMatch = text.match(/q(\d)\s*(\d{4})?/i);
    if (qMatch) {
        const year = qMatch[2] || "2026";
        const endMonths: Record<string, string> = { "1": "03", "2": "06", "3": "09", "4": "12" };
        return `${year}-${endMonths[qMatch[1]]}-28T23:59:00Z`;
    }

    // Default: end of current year
    return "2026-12-31T23:59:00Z";
}

/**
 * Main startup function.
 */
async function main() {
    console.log("🤖 Rector Prediction Assistant starting...\n");

    // Connect MCP client
    try {
        await mcpClient.connect();
        console.log("✅ MCP client connected");
    } catch (error: any) {
        console.warn("⚠️  MCP client not available (run in standalone mode):", error.message);
    }

    // Start resolution worker
    const notifyUser = async (telegramId: string, message: string) => {
        console.log(`[Notify] ${telegramId}: ${message}`);
        // In production, this sends via Rector Telegram
    };

    startWorker(notifyUser);
    console.log("✅ Resolution worker started");

    console.log("\n🚀 Agent ready! Listening for Rector messages...\n");

    // In production, Rector calls handleMessage() via its message handler.
    // For development/testing, you can simulate with stdin:
    if (process.env.NODE_ENV !== "production") {
        const readline = await import("readline");
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.on("line", async (line: string) => {
            const response = await handleMessage("dev_user", "developer", line);
            console.log("\n" + response + "\n");
        });

        console.log("📝 Dev mode — type commands here (e.g. /analyse BNB)\n");
    }
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV === "production") {
    // In production or when run directly, we start the worker
    // But for API imports, we might want to skip the stdin loop
}

main().catch(console.error);

export { handleMessage as processMessage };
