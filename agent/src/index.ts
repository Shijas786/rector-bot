import "dotenv/config";

import { prisma } from "./db/prisma.js";
import { mcpClient } from "./mcp/client.js";
import { analyseToken, analyseWallet } from "./pipeline/analyse.js";
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

const FRONTEND_URL = process.env.FRONTEND_URL || "https://rector.up.railway.app";

// Database-backed Session Manager
const SessionManager = {
    async get(telegramId: string) {
        const session = await (prisma as any).userSession.findUnique({ where: { telegramId } });
        console.log(`[SessionManager] GET ${telegramId} -> ${session?.awaitingConfirmation || "none"}`);
        return {
            lastDisambiguation: session?.lastDisambiguation as any,
            lastRunbook: session?.lastRunbook || undefined,
            awaitingConfirmation: (session?.awaitingConfirmation as "predict" | "execute" | "alert") || undefined,
        };
    },
    async set(telegramId: string, data: any) {
        console.log(`[SessionManager] SET ${telegramId}`, JSON.stringify(data).substring(0, 100));
        if (!data || Object.keys(data).length === 0) {
            await (prisma as any).userSession.deleteMany({ where: { telegramId } });
        } else {
            await (prisma as any).userSession.upsert({
                where: { telegramId },
                update: {
                    lastDisambiguation: data.lastDisambiguation || null,
                    lastRunbook: data.lastRunbook || null,
                    awaitingConfirmation: data.awaitingConfirmation || null,
                },
                create: {
                    telegramId,
                    lastDisambiguation: data.lastDisambiguation || null,
                    lastRunbook: data.lastRunbook || null,
                    awaitingConfirmation: data.awaitingConfirmation || null,
                }
            });
        }
    }
};

/**
 * Process an incoming message from Rector/Telegram.
 */
export async function handleMessage(
    telegramId: string,
    username: string,
    text: string
): Promise<string> {
    console.log(`[handleMessage] @${username} (${telegramId}): "${text}"`);
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

    const state = await SessionManager.get(telegramId);
    const trimmed = text.trim();

    // 1. Explicit Commands (Take precedence over confirmation state)
    if (trimmed.startsWith("/analyse") || trimmed.startsWith("/analyze")) {
        const symbol = trimmed.split(/\s+/)[1];
        if (!symbol) return "Usage: /analyse [token]";
        await SessionManager.set(telegramId, {}); // Clear any pending confirmation state
        return handleAnalyse(telegramId, symbol);
    }

    if (trimmed.startsWith("/predict")) {
        const claim = trimmed.replace("/predict", "").trim();
        if (!claim) return "Usage: /predict [your prediction]";
        await SessionManager.set(telegramId, {}); // Clear any pending confirmation state
        return handlePredict(telegramId, claim);
    }

    if (trimmed.startsWith("/check")) {
        const idStr = trimmed.split(/\s+/)[1];
        if (!idStr) return "Usage: /check [id]";
        return handleCheck(parseInt(idStr));
    }

    if (trimmed === "/submit" || trimmed === "/confirm") {
        if (state.awaitingConfirmation === "execute" && state.lastRunbook) {
            return handleConfirmation(user.id, telegramId, state);
        }
        return "❌ Nothing to submit. Please type your prediction first!";
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

    if (trimmed === "/help" || trimmed === "/start" || trimmed === "/history") {
        await SessionManager.set(telegramId, {}); // Clear any pending confirmation state
        if (trimmed === "/history") return handleHistory(user.id);
        return handleHelp(user.shadowAddress);
    }

    // 2. Handle confirmation responses
    if (state.awaitingConfirmation) {
        const answer = text.trim().toLowerCase(); // No regex stripping here to keep emojis if needed
        const isYes = ["yes", "y", "confirm", "proceed", "ok", "okay", "submit", "approve", "doit", "go", "yesdoit", "✅ yes, proceed"].includes(answer);
        const isNo = ["no", "n", "cancel", "stop", "abort", "dont", "❌ cancel"].includes(answer);

        if (isYes) {
            // Optimistically clear the state to prevent double-clicks (race condition)
            await SessionManager.set(telegramId, {});

            if (!telegramId.startsWith("web-user-")) {
                // Background execution to prevent webhook timeout
                (async () => {
                    try {
                        const result = await handleConfirmation(user.id, telegramId, state);
                        if (!result.includes("SHALL I PROCEED WITH ON-CHAIN SUBMISSION?")) {
                            await sendDirectTelegram(telegramId, result, []);
                        } else {
                            // If it wasn't the final step, restore the session
                            await SessionManager.set(telegramId, { ...state, awaitingConfirmation: "execute" });
                            await sendDirectTelegram(telegramId, result, ["✅ YES, PROCEED", "❌ CANCEL"]);
                        }
                    } catch (e: any) {
                        console.error("[BG Error]", e.message);
                        await sendDirectTelegram(telegramId, `❌ **PROTOCOL ERROR**\n${e.message}`, []);
                    }
                })();
                return "🔄 **Rector: Processing your confirmation...**\n*(This takes ~15s for Greenfield+BSC)*";
            }

            const result = await handleConfirmation(user.id, telegramId, state);
            if (result.includes("SHALL I PROCEED WITH ON-CHAIN SUBMISSION?")) {
                await SessionManager.set(telegramId, { ...state, awaitingConfirmation: "execute" });
            }
            return result;
        } else if (isNo) {
            await SessionManager.set(telegramId, {});
            const cancelMsg = "Okay, cancelled. Type /help to see what I can do.";
            if (telegramId.startsWith("web-user-")) return cancelMsg;
            await sendDirectTelegram(telegramId, cancelMsg, []);
            return "";
        }
        // If it's not yes/no, fall through to natural language parsing (treat as new prediction)
    }

    // 2. Natural Language Fallback
    // If user just types a wallet, analyze it. If it's a claim, predict it.
    try {
        const fuzzyAddress = trimmed.replace(/[\.\s]/g, "");
        if (/^0x[a-fA-F0-9]{40}$/i.test(fuzzyAddress)) {
            await SessionManager.set(telegramId, {});
            return handleAnalyse(telegramId, fuzzyAddress);
        }

        // Guard: Don't try to disambiguate very short messages that aren't claims
        if (trimmed.length < 5 || (trimmed.split(/\s+/).length < 2 && !trimmed.startsWith("0x"))) {
            return handleHelp(user.shadowAddress);
        }

        return handlePredict(telegramId, trimmed);
    } catch (e: any) {
        console.error(`[handleMessage Fallback Error]`, e.message);
    }

    return handleHelp(user.shadowAddress);
}

export async function handleAnalyse(telegramId: string, symbol: string): Promise<string> {
    try {
        // Clean the symbol (remove trailing dots, spaces, etc.)
        const cleanSymbol = symbol.trim().replace(/[\.\,\?]$/, "");

        // Detect Wallet Address (Case-Insensitive)
        if (/^0x[a-fA-F0-9]{40}$/i.test(cleanSymbol)) {
            const analysis = await analyseWallet(cleanSymbol);
            return `🔍 **RECTOR: WALLET ANALYST** 🛡️
━━━━━━━━━━━━━━━━━━━━━━━━
📍 **Address:** \`${cleanSymbol}\`
━━━━━━━━━━━━━━━━━━━━━━━━

${analysis}
`;
        }

        const result = await analyseToken(cleanSymbol);
        await SessionManager.set(telegramId, {
            lastAnalysisResistance: result.resistance,
            lastAnalysisSymbol: result.symbol,
            awaitingConfirmation: "alert",
        });
        return result.formattedMessage;
    } catch (error: any) {
        console.error(`[Analyse Error] ${symbol}:`, error.message);
        return `❌ **RECTOR: ANALYSIS ERROR**
━━━━━━━━━━━━━━━━━━━━━━━━
I couldn't find market data for \`${symbol.toUpperCase()}\`. 

**Note:** Ensure you are using a standard ticker (e.g., BTC, BNB) or a valid EVM wallet address.`;
    }
}

export async function handlePredict(telegramId: string, claim: string): Promise<string> {
    if (telegramId.startsWith("web-user-")) {
        try {
            const resolutionDate = extractResolutionDate(claim);
            const disambiguation = await disambiguatePrediction(claim, resolutionDate);
            const runbook = await buildRunbook(disambiguation, Date.now());
            await SessionManager.set(telegramId, { lastDisambiguation: disambiguation, lastRunbook: runbook, awaitingConfirmation: "execute" });
            const combined = `${formatDisambiguation(disambiguation)}\n\n${formatRunbookPreview(runbook)}`;
            return `${combined}\n\n**SHALL I PROCEED WITH THIS VERIFICATION PLAN?**\n(Type 'ok' or 'yes' to confirm)`;
        } catch (error: any) {
            return `❌ Could not process prediction: ${error.message}`;
        }
    }

    // Telegram User: Background execution to prevent webhook timeouts and retry loops
    (async () => {
        try {
            const resolutionDate = extractResolutionDate(claim);
            const disambiguation = await disambiguatePrediction(claim, resolutionDate);
            if (disambiguation.disambiguated) {
                const runbook = await buildRunbook(disambiguation, Date.now());
                await SessionManager.set(telegramId, { lastDisambiguation: disambiguation, lastRunbook: runbook, awaitingConfirmation: "execute" });
                const combined = `${formatDisambiguation(disambiguation)}\n\n${formatRunbookPreview(runbook)}`;
                await sendDirectTelegram(telegramId, combined, ["✅ YES, PROCEED", "❌ CANCEL"]);
            }
        } catch (error: any) {
            console.error("[BG Predict Error]", error.message);
            await sendDirectTelegram(telegramId, `❌ **PROTOCOL ERROR**\n${error.message}`, []);
        }
    })();
    
    return "🔄 **Rector: Analysing Prediction & Building Runbook...**\n*(This takes ~15s)*";
}

/**
 * Format runbook into a rich Telegram preview.
 */
function formatRunbookPreview(runbook: string): string {
    const lines = runbook.split("\n");
    const steps = lines.filter(l => l.startsWith("### Step")).map(l => l.replace("### ", "🔹 **").concat("**"));
    const metadata = lines.slice(0, 10).filter(l => l.startsWith("- ")).join("\n");
    
    return `📜 **RECTOR: RUNBOOK GENERATED** 🚀

${metadata}

**VERIFICATION ROADMAP:**
${steps.join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━
*Building this roadmap on BNB Greenfield...*
*Attesting core logic to BSC...*
━━━━━━━━━━━━━━━━━━━━━━━━

**SHALL I PROCEED WITH ON-CHAIN SUBMISSION?**\n*(Click a button below or type **yes**)*`;
}

async function handleConfirmation(userId: string, telegramId: string, state: any): Promise<string> {
    if (state.awaitingConfirmation === "predict" && state.lastDisambiguation) {
        // Build runbook and SHOW PREVIEW first
        const runbook = await buildRunbook(state.lastDisambiguation, Date.now());
        await SessionManager.set(telegramId, { ...state, lastRunbook: runbook, awaitingConfirmation: "execute" });
        return formatRunbookPreview(runbook);
    }
    
    if (state.awaitingConfirmation === "execute" && state.lastRunbook) {
        return executePredictionPipeline(userId, telegramId, state.lastDisambiguation, state.lastRunbook);
    }
    return "Nothing to confirm.";
}

export async function executePredictionPipeline(
    userId: string,
    telegramId: string,
    disambiguation: DisambiguationResult,
    providedRunbook?: string
): Promise<string> {
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const walletAddress = (user as any)?.shadowAddress || "0x0000000000000000000000000000000000000000";

        const tempId = Date.now();
        const runbook = providedRunbook || await buildRunbook(disambiguation, tempId);
        const runbookRef = await uploadRunbook(tempId, runbook);
        const resDate = new Date(disambiguation.resolutionDate);
        const now = new Date();
        const resolutionTimestamp = Math.floor(resDate.getTime() / 1000);
        const nowTimestamp = Math.floor(now.getTime() / 1000);

        if (resolutionTimestamp <= nowTimestamp + 30) {
            throw new Error(`Your resolution date (${resDate.toISOString()}) is too close to the current time or in the past. 
The blockchain requires resolution dates to be in the future. 
Since you specified a short timeframe (e.g. "2 minutes"), and there was a delay in building the plan or confirming, this prediction is no longer valid.
Please try again with a longer timeframe (e.g. "at least 15 minutes").`);
        }

        const { txHash, predictionId } = await submitPrediction(
            disambiguation.disambiguated.substring(0, 200),
            disambiguation.disambiguated,
            runbookRef,
            resolutionTimestamp,
            walletAddress
        );

        const p = await prisma.prediction.create({
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

        return `🏆 **RECTOR: TRANSACTION CONFIRMED** 🚀
━━━━━━━━━━━━━━━━━━━━━━━━
📜 **History Entry:** #${predictionId}
🛡 **Protocol:** Rector Oracle
🎯 **Status:** ON-CHAIN ATTESTED
━━━━━━━━━━━━━━━━━━━━━━━━

✅ **RUNBOOK:** [View on BNB Greenfield](${runbookRef})
✅ **PROOF:** [LIVE ON BSC](https://testnet.bscscan.com/tx/${txHash})

━━━━━━━━━━━━━━━━━━━━━━━━
🌐 **OFFICIAL DASHBOARD:**
[rector.up.railway.app/predictions/${p.id}](https://rector.up.railway.app/predictions/${p.id})
━━━━━━━━━━━━━━━━━━━━━━━━

*(Protocol execution synchronized. Monitor resolution in the dashboard)*`;
    } catch (error: any) {
        console.error(`[Pipeline Error] Failed for user ${userId} / claim: ${disambiguation.disambiguated}`, error);
        return `❌ **RECTOR: PROTOCOL FAILURE** 🚨
━━━━━━━━━━━━━━━━━━━━━━━━
🛡 **Protocol:** Rector Oracle
🎯 **Status:** EXECUTION REJECTED
━━━━━━━━━━━━━━━━━━━━━━━━

**DETAILS:**
${error.message}

━━━━━━━━━━━━━━━━━━━━━━━━
*(Check logs and resolve missing collateral or account initialization)*`;
    }
}

async function handleCheck(id: number): Promise<string> {
    const p = await prisma.prediction.findFirst({ where: { onchainId: id } });
    if (!p) return `❌ Prediction #${id} not found.`;
    const status = p.status === "RESOLVED" ? (p.outcome ? "✅ TRUE" : "❌ FALSE") : `⏳ ${p.status}`;
    return `📜 **PREDICTION #${id}**\n\nClaim: ${p.claimText}\nStatus: ${status}\nResolves: ${p.resolutionDate.toISOString().split("T")[0]}\n🔗 [View Details](${FRONTEND_URL}/predictions/${id})\n🔗 [On-chain Proof](https://testnet.bscscan.com/tx/${p.txHashSubmit})`;
}

async function handleHistory(userId: string): Promise<string> {
    const predictions = await prisma.prediction.findMany({
        where: { userId },
        orderBy: { id: "desc" },
        take: 5
    });

    if (predictions.length === 0) return "📭 You haven't made any predictions yet. Try just typing one, like 'BTC hits 100k next week'!";

    const list = predictions.map(p => {
        const icon = p.status === "RESOLVED" ? (p.outcome ? "✅" : "❌") : "⏳";
        return `${icon} **#${p.onchainId}**: ${p.claimText.substring(0, 50)}...`;
    }).join("\n");

    return `📜 **YOUR PREDICTION HISTORY** 🛡️
    
${list}

🔗 [View Full Feed](${FRONTEND_URL}/live)`;
}

function handleHelp(shadowAddress?: string): string {
    const walletInfo = shadowAddress
        ? `\n👤 **Your Shadow Wallet:** \`${shadowAddress}\`\n*(Auto-generated. Use /mywallet to see balance)*\n`
        : "";

    return `🛡 **Rector: The AI-Agentic Oracle** 🚀
${walletInfo}
I transform claims into verifiable on-chain truths.
🌐 **Protocol Interface:** ${FRONTEND_URL}

**How It Works:**
1️⃣ **Make a Claim**: You provide a prediction, I disambiguate it.
2️⃣ **Generate a Runbook**: I build a roadmap for verification on Greenfield.
3️⃣ **Verify**: My agent executes the runbook (Binance/Chainlink/Polymarket).
4️⃣ **Attest On-Chain**: I sign and attest the outcome on BSC.
5️⃣ **Build on Me**: Use these attestations for conditional payments & more.

**Commands:**
/analyse BNB - Market analysis
/predict ... - Submit a claim
/confirm - Finalize and attest
/mywallet - Check shadow balance
/withdraw [addr] - Move winnings
/check [id] - View on-chain proof

*(Tip: You can also just type your prediction directly, like "BNB hits $700 tomorrow")*`;
}

/**
 * Direct Telegram Bot API helper for Sending Buttons/Keyboards
 */
export async function sendDirectTelegram(telegramId: string, text: string, buttons: string[] = []): Promise<void> {
    const token = process.env.OPENCLAW_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn("[Telegram] No bot token found to send direct message.");
        return;
    }

    const payload: any = {
        chat_id: telegramId,
        text: text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
    };

    if (buttons.length > 0) {
        payload.reply_markup = {
            inline_keyboard: [buttons.map(b => ({ text: b, callback_data: b }))]
        };
    } else {
        payload.reply_markup = { remove_keyboard: true };
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.ok) {
            console.error("[Telegram Error]", JSON.stringify(data));
            // If Markdown fails, try plain text
            if (data.description?.includes("can't parse entities")) {
                payload.parse_mode = undefined;
                await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
        }
    } catch (e: any) {
        console.error("[Telegram Fetch Error]", e.message);
    }
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

    console.log("🚀 Rector Protocol Active (v1.1.0-hotfix)");
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV === "production") {
    main().catch(console.error);
}

export { handleMessage as processMessage };
