#!/usr/bin/env tsx
/**
 * Rector Auto-Resolution Cron
 *
 * Polls the DB every hour for predictions past their resolution date
 * and triggers the multi-source resolver on them.
 *
 * This is a lightweight fallback for environments without Redis/BullMQ.
 * Run as a background process alongside the gateway.
 *
 * Usage: npx tsx src/scripts/cron.ts
 */

import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { resolvePrediction as resolveOnChain, markInconclusive as markInconclusiveOnChain, getAccuracy } from "../mcp/bsc.js";
import { downloadRunbook } from "../mcp/greenfield.js";
import { executeRunbook } from "../pipeline/executeRunbook.js";
import { determineOutcome } from "../pipeline/determineOutcome.js";
import { packageAndUploadEvidence } from "../pipeline/packageEvidence.js";
import { mcpClient } from "../mcp/client.js";
import { ethers } from "ethers";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const NOTIFY_QUEUE: { telegramId: string; message: string }[] = [];

// ─── Main resolution logic ────────────────────────────────────────────────────

async function resolveExpiredPredictions(): Promise<void> {
    const now = new Date();
    const expired = await prisma.prediction.findMany({
        where: {
            status: "PENDING",
            resolutionDate: { lte: now },
        },
        include: { user: true },
        orderBy: { resolutionDate: "asc" },
        take: 20,
    });

    if (!expired.length) {
        console.log(`[Cron] ${now.toISOString()} — No expired predictions.`);
        return;
    }

    console.log(`[Cron] ${now.toISOString()} — Resolving ${expired.length} expired prediction(s)...`);

    for (const p of expired) {
        const text = p.disambiguated || p.claimText;
        const source = (p as any).primarySource || "binance_api";
        const startMs = p.createdAt.getTime();
        const endMs = p.resolutionDate.getTime();

        try {
            if (!p.runbookRef) {
                console.warn(`[Cron] #${p.id} has no runbookRef, skipping.`);
                continue;
            }

            // 1. Download or retrieve runbook
            let runbook = (p as any).runbook || "";
            if (!runbook && p.runbookRef) {
                console.log(`[Cron] #${p.id} Fetching from runbookRef: ${p.runbookRef}`);
                try {
                    runbook = await downloadRunbook(p.runbookRef);
                } catch (e: any) {
                    console.error(`[Cron] #${p.id} ERROR downloading runbook:`, e.message);
                }
            }
            
            if (!runbook) {
                console.warn(`[Cron] #${p.id} No runbook content found. Skipping.`);
                continue;
            }

            // 2. Execute verification steps
            console.log(`[Cron] #${p.id} Executing runbook...`);
            const execution = await executeRunbook(runbook);
            console.log(`[Cron] #${p.id} Execution yielded ${execution.stepResults.length} step results`);

            // 3. Determine outcome via GPT-4o
            const outcomeResult = await determineOutcome(
                p.disambiguated || p.claimText,
                p.successCriteria || "",
                runbook,
                execution.stepResults
            );
            
            const { outcome, reasoning, confidence } = outcomeResult;

            // 4. Package evidence
            const { evidenceRef, signature } = await packageAndUploadEvidence(
                p.onchainId || p.id,
                p.disambiguated || p.claimText,
                p.successCriteria || "",
                p.resolutionDate.toISOString(),
                execution.stepResults,
                outcomeResult
            );

            // 5. Update Database
            await prisma.prediction.update({
                where: { id: p.id },
                data: {
                    status: outcome === "INCONCLUSIVE" ? "INCONCLUSIVE" : "RESOLVED",
                    outcome: outcome === "INCONCLUSIVE" ? null : (outcome as boolean),
                    confidence,
                    evidenceRef,
                    reasoning: reasoning || "Verification complete",
                    resolvedAt: new Date(),
                },
            });

            // 6. On-chain Resolution
            let txHash = "";
            if (p.onchainId) {
                try {
                    if (outcome === "INCONCLUSIVE") {
                        const res = await markInconclusiveOnChain(p.onchainId);
                        txHash = res.txHash;
                    } else {
                        const res = await resolveOnChain(
                            p.onchainId,
                            outcome as boolean,
                            confidence,
                            evidenceRef,
                            (reasoning || "").substring(0, 280),
                            signature
                        );
                        txHash = res.txHash;
                    }
                    await prisma.prediction.update({ where: { id: p.id }, data: { txHashResolve: txHash } });
                } catch (e: any) {
                    console.warn(`[Cron] On-chain failed for #${p.id}: ${e.message}`);
                }
            }

            // 7. Notification Formatting
            let message = "";
            if (outcome === "INCONCLUSIVE") {
                message = `⚠️ PREDICTION #${p.id} — INCONCLUSIVE\n\n${outcomeResult.inconclusiveReason || "Sources conflicted"}\n\nReasoning: ${reasoning}\n\nOnchain proof: 🔗 https://testnet.bscscan.com/tx/${txHash}`;
                console.log(`[Cron] ⚠️ #${p.id} → INCONCLUSIVE: ${reasoning}`);
            } else {
                const emoji = outcome ? "✅ WIN" : "❌ LOSS";
                const acc = await getAccuracy(p.user.telegramId).catch(() => ({ correct: 0, total: 0 }));
                message = `${emoji} PREDICTION #${p.id} — ${outcome ? "TRUE" : "FALSE"}\n\nConfidence: ${confidence}%\nReasoning: ${reasoning}\n\nOnchain proof: 🔗 https://testnet.bscscan.com/tx/${txHash}\nYour record: ${acc.correct}/${acc.total} correct 🎯`;
                console.log(`[Cron] ${emoji} #${p.id} → ${reasoning}${txHash ? ` | TX: ${txHash}` : ""}`);
            }

            NOTIFY_QUEUE.push({
                telegramId: p.user.telegramId,
                message,
            });

        } catch (e: any) {
            console.error(`[Cron] Error resolving #${p.id}: ${e.message}`);
        }
    }

    await processNotificationQueue();
}

async function processNotificationQueue() {
    const token = process.env.OPENCLAW_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn("[Cron] No TELEGRAM_BOT_TOKEN found, skipping notifications");
        NOTIFY_QUEUE.length = 0;
        return;
    }

    while (NOTIFY_QUEUE.length > 0) {
        const item = NOTIFY_QUEUE.shift();
        if (!item) continue;
        
        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: item.telegramId,
                    text: item.message,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                console.error(`[Cron] Failed to send Telegram: ${text}`);
            } else {
                console.log(`[Cron] Notification sent to ${item.telegramId}`);
            }
        } catch (e: any) {
            console.error(`[Cron] Error sending notification to ${item.telegramId}: ${e.message}`);
        }
    }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("⏰ Rector Auto-Resolution Cron started");
    console.log(`   Polling every ${POLL_INTERVAL_MS / 60000} minutes\n`);

    try {
        await mcpClient.connect();
        console.log("[Cron] Connected to MCP server");
    } catch (e) {
        console.error("[Cron MCP ERROR]", e);
    }
    
    // Run immediately on startup
    await resolveExpiredPredictions();

    // Then poll on interval
    setInterval(async () => {
        try {
            await resolveExpiredPredictions();
        } catch (e: any) {
            console.error("[Cron] Poll error:", e.message);
        }
    }, POLL_INTERVAL_MS);
}

main().catch(console.error);
