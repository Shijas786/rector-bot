import "dotenv/config";

import { prisma } from "./db/prisma.js";
import { mcpClient } from "./mcp/client.js";
import { analyseToken } from "./pipeline/analyse.js";
import { disambiguatePrediction, formatDisambiguation, DisambiguationResult } from "./pipeline/disambiguate.js";
export { disambiguatePrediction, formatDisambiguation };
export type { DisambiguationResult };
import { buildRunbook } from "./pipeline/buildRunbook.js";
export { buildRunbook };
import { uploadRunbook } from "./mcp/greenfield.js";
import { submitPrediction, getAccuracy, getPrediction } from "./mcp/bsc.js";
import { scheduleResolution, startWorker } from "./scheduler/queue.js";
import { ethers } from "ethers";
import * as chrono from "chrono-node";

/**
 * Rector: The AI-Agentic Oracle
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
    // Ensure user exists in DB with a Shadow Wallet
    const existingUser = await prisma.user.findUnique({ where: { telegramId } });
    let user: any;

    if (!existingUser) {
        const wallet = ethers.Wallet.createRandom();
        user = await prisma.user.create({
            data: {
                telegramId,
                username,
                shadowAddress: wallet.address,
                shadowPrivateKey: wallet.privateKey,
            } as any,
        });
        console.log(`[Rector] Created shadow wallet for @${username}: ${wallet.address}`);
    } else {
        user = await prisma.user.update({
            where: { telegramId },
            data: { username },
        });
    }

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
            return "Okay, cancelled. Type /help to see what I can do.";
        }
    }

    const trimmed = text.trim();

    // 1. Explicit Commands
    if (trimmed.startsWith("/analyse") || trimmed.startsWith("/analyze")) {
        const symbol = trimmed.split(/\s+/)[1];
        if (!symbol) return "Usage: /analyse [token]";
        return handleAnalyse(telegramId, symbol);
    }

    if (trimmed.startsWith("/predict")) {
        const claim = trimmed.replace("/predict", "").trim();
        if (!claim) return "Usage: /predict [your prediction]";
        return handlePredict(telegramId, claim);
    }

    if (trimmed.startsWith("/check")) {
        const idStr = trimmed.split(/\s+/)[1];
        if (!idStr) return "Usage: /check [id]";
        return handleCheck(parseInt(idStr));
    }

    if (trimmed === "/mywallet") {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org");
        const balance = await provider.getBalance(user.shadowAddress);
        return `👤 **Your Rector Shadow Wallet**
        
📍 **Address:** \`${user.shadowAddress}\`
💰 **Balance:** \`${ethers.formatEther(balance)} BNB\`

🔗 [View on BscScan](https://testnet.bscscan.com/address/${user.shadowAddress})`;
    }

    if (trimmed.startsWith("/withdraw")) {
        const toAddress = trimmed.split(/\s+/)[1];
        if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 42) return "Usage: /withdraw [address]";

        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org");
        const wallet = new ethers.Wallet(user.shadowPrivateKey, provider);
        const balance = await provider.getBalance(wallet.address);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits("5", "gwei");
        const gasLimit = 21000n;
        const totalGas = gasPrice * gasLimit;

        if (balance <= totalGas) return "❌ Insufficient balance for gas.";

        try {
            const tx = await wallet.sendTransaction({ to: toAddress, value: balance - totalGas, gasLimit, gasPrice });
            return `✅ Withdrawal sent! 🔗 [BscScan](https://testnet.bscscan.com/tx/${tx.hash})`;
        } catch (e: any) {
            return `❌ Failed: ${e.message}`;
        }
    }

    if (trimmed === "/help" || trimmed === "/start") {
        return handleHelp(user.shadowAddress);
    }

    // 2. Natural Language Fallback
    // If user just types something, try to see if it's a prediction
    try {
        const resolutionDate = extractResolutionDate(trimmed);
        const result = await disambiguatePrediction(trimmed, resolutionDate);

        if (result.disambiguated) {
            userState.set(telegramId, { lastDisambiguation: result, awaitingConfirmation: "predict" });
            return formatDisambiguation(result);
        }
    } catch (e) {
        // Not a prediction, show welcome
    }

    return handleHelp(user.shadowAddress);
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
        return `❌ Could not analyse ${symbol.toUpperCase()}.`;
    }
}

export async function handlePredict(telegramId: string, claim: string): Promise<string> {
    try {
        const resolutionDate = extractResolutionDate(claim);
        const result = await disambiguatePrediction(claim, resolutionDate);
        userState.set(telegramId, { lastDisambiguation: result, awaitingConfirmation: "predict" });
        return formatDisambiguation(result);
    } catch (error: any) {
        return `❌ Could not process prediction.`;
    }
}

async function handleConfirmation(userId: string, telegramId: string, state: any): Promise<string> {
    if (state.awaitingConfirmation === "predict" && state.lastDisambiguation) {
        return executePredictionPipeline(userId, telegramId, state.lastDisambiguation);
    }
    return "Nothing to confirm.";
}

export async function executePredictionPipeline(
    userId: string,
    telegramId: string,
    disambiguation: DisambiguationResult
): Promise<string> {
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const walletAddress = (user as any)?.shadowAddress || "0x0000000000000000000000000000000000000000";

        const tempId = Date.now();
        const runbook = await buildRunbook(disambiguation, tempId);
        const runbookRef = await uploadRunbook(tempId, runbook);
        const resolutionTimestamp = Math.floor(new Date(disambiguation.resolutionDate).getTime() / 1000);

        const { txHash, predictionId } = await submitPrediction(
            disambiguation.disambiguated.substring(0, 200),
            disambiguation.disambiguated,
            runbookRef,
            resolutionTimestamp,
            walletAddress
        );

        await prisma.prediction.create({
            data: {
                onchainId: predictionId,
                userId,
                claimText: disambiguation.disambiguated,
                disambiguated: disambiguation.disambiguated,
                successCriteria: disambiguation.successCriteria,
                primarySource: disambiguation.primarySource,
                runbookRef,
                runbook,
                resolutionDate: new Date(disambiguation.resolutionDate),
                txHashSubmit: txHash,
            } as any,
        });

        await scheduleResolution(
            predictionId,
            new Date(disambiguation.resolutionDate),
            disambiguation.disambiguated,
            disambiguation.successCriteria || "",
            runbookRef
        );

        return `🛡 **Protocol Initiated**
        
✓ Runbook stored on BNB Greenfield
✓ Prediction #${predictionId} live on BSC
✓ TX: https://testnet.bscscan.com/tx/${txHash}`;
    } catch (error: any) {
        console.error(`[Pipeline Error] Failed for user ${userId} / claim: ${disambiguation.disambiguated}`, error);
        return `❌ Error: ${error.message}`;
    }
}

async function handleCheck(id: number): Promise<string> {
    const p = await prisma.prediction.findFirst({ where: { onchainId: id } });
    if (!p) return `❌ Prediction #${id} not found.`;
    const status = p.status === "RESOLVED" ? (p.outcome ? "✅ TRUE" : "❌ FALSE") : `⏳ ${p.status}`;
    return `📜 **PREDICTION #${id}**\n\nClaim: ${p.claimText}\nStatus: ${status}\nResolves: ${p.resolutionDate.toISOString().split("T")[0]}\n🔗 [Proof](https://testnet.bscscan.com/tx/${p.txHashSubmit})`;
}

function handleHelp(shadowAddress?: string): string {
    const walletInfo = shadowAddress
        ? `\n👤 **Your Shadow Wallet:** \`${shadowAddress}\`\n*(Auto-generated. Use /mywallet to see balance)*\n`
        : "";

    return `🛡 **Rector: The AI-Agentic Oracle** 🚀
${walletInfo}
I transform claims into verifiable on-chain truths.

**How It Works:**
1️⃣ **Make a Claim**: You provide a prediction, I disambiguate it.
2️⃣ **Generate a Runbook**: I build a roadmap for verification on Greenfield.
3️⃣ **Verify**: My agent executes the runbook (Binance/Chainlink/Polymarket).
4️⃣ **Attest On-Chain**: I sign and attest the outcome on BSC.
5️⃣ **Build on Me**: Use these attestations for conditional payments & more.

**Commands:**
/analyse BNB - Market analysis
/predict ... - Submit a claim
/mywallet - Check shadow balance
/withdraw [addr] - Move winnings
/check [id] - View on-chain proof

*(Tip: You can also just type your prediction directly, like "BNB hits $700 tomorrow")*`;
}

export function extractResolutionDate(text: string): Date {
    const parsed = chrono.parseDate(text, new Date(), { forwardDate: true });
    if (parsed) return parsed;

    // Fallback: 1 year from now if totally unparseable
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() + 1);
    return defaultDate;
}

async function main() {
    console.log("🤖 Rector starting...");
    try {
        await mcpClient.connect();
        const tools = await mcpClient.listTools();
        console.log("[MCP TOOLS]", JSON.stringify(tools, null, 2));
    } catch (e) {
        console.error("[MCP ERROR]", e);
    }
    
    startWorker(async (tid, msg) => {
        console.log(`[Notify] ${tid}: ${msg}`);
        const token = process.env.OPENCLAW_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return;
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: tid, text: msg }),
            });
        } catch (e: any) {
            console.error(`[Notify] Failed to send Telegram to ${tid}:`, e.message);
        }
    });

    console.log("🚀 Rector Protocol Active");
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV === "production") {
    main().catch(console.error);
}

export { handleMessage as processMessage };
