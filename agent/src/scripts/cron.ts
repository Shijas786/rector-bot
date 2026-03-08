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
import { resolvePrediction as resolveOnChain, markInconclusive as markInconclusiveOnChain } from "../mcp/bsc.js";
import { ethers } from "ethers";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const NOTIFY_QUEUE: { telegramId: string; message: string }[] = [];

// ─── Minimal resolvers (inline, no file import to avoid circular deps) ────────

async function fetchBinanceKlines(symbol: string, startMs: number, endMs: number) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startMs}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const data: any[] = await res.json();
    return data.map((c) => ({ high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) }));
}

async function fetchPolymarket(query: string) {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(query)}&limit=3`);
    if (!res.ok) return null;
    const markets: any[] = await res.json();
    return markets[0] || null;
}

function extractPriceTarget(text: string) {
    const priceMatch = text.match(/\$\s*([0-9,]+(?:\.[0-9]+)?)/);
    const targetPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;
    const symbolMatch = text.match(/\b(BNB|BTC|ETH|SOL|XRP|ADA|MATIC|AVAX|DOT|LINK|UNI|DOGE|SHIB|ARB|OP)\b/i);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() + "USDT" : "BNBUSDT";
    const direction = /\b(below|under|drop|fall|dip|crash)\b/i.test(text) ? "below" : "above";
    return { symbol, targetPrice, direction };
}

async function signAttestation(id: number, outcome: boolean, evidenceRef: string) {
    if (!process.env.PRIVATE_KEY) return "0x";
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const hash = ethers.solidityPackedKeccak256(["uint256", "bool", "string"], [id, outcome, evidenceRef]);
    return wallet.signMessage(ethers.getBytes(hash));
}

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
            let outcome: boolean;
            let reasoning: string;
            let evidenceRef: string;

            if (source === "polymarket_api") {
                const market = await fetchPolymarket((p as any).successCriteria || text.substring(0, 80));
                if (!market || !market.resolved) {
                    console.log(`[Cron] #${p.id} — Polymarket not yet resolved, skipping.`);
                    continue;
                }
                outcome = market.outcome?.toLowerCase() === "yes";
                reasoning = `Polymarket: "${market.question}" resolved ${market.outcome}`;
                evidenceRef = `polymarket:${market.question.substring(0, 80)}:${market.outcome}`;
            } else {
                const { symbol, targetPrice, direction } = extractPriceTarget(text);
                if (!targetPrice) {
                    await prisma.prediction.update({ where: { id: p.id }, data: { status: "INCONCLUSIVE", reasoning: "No target price" } });
                    if (p.onchainId) await markInconclusiveOnChain(p.onchainId).catch(() => { });
                    continue;
                }
                const candles = await fetchBinanceKlines(symbol, startMs, endMs);
                if (!candles.length) continue;
                const maxHigh = Math.max(...candles.map((c) => c.high));
                const minLow = Math.min(...candles.map((c) => c.low));
                const last = candles[candles.length - 1].close;
                outcome = direction === "above" ? maxHigh >= targetPrice : minLow <= targetPrice;
                reasoning = direction === "above"
                    ? outcome ? `${symbol} hit $${maxHigh.toFixed(2)} ≥ $${targetPrice}` : `${symbol} peaked at $${maxHigh.toFixed(2)}, missed $${targetPrice} (last $${last.toFixed(2)})`
                    : outcome ? `${symbol} dropped to $${minLow.toFixed(2)} ≤ $${targetPrice}` : `${symbol} hit $${minLow.toFixed(2)}, missed $${targetPrice}`;
                evidenceRef = `binance:${symbol}:hi=${maxHigh.toFixed(2)}:lo=${minLow.toFixed(2)}`;
            }

            // Update DB
            await prisma.prediction.update({
                where: { id: p.id },
                data: { status: "RESOLVED", outcome, reasoning, evidenceRef, resolvedAt: new Date() },
            });

            // Attest on-chain
            let txHash = "";
            if (p.onchainId) {
                try {
                    const sig = await signAttestation(p.onchainId, outcome, evidenceRef);
                    const result = await resolveOnChain(p.onchainId, outcome, 90, evidenceRef, reasoning.substring(0, 280), sig);
                    txHash = result.txHash;
                    await prisma.prediction.update({ where: { id: p.id }, data: { txHashResolve: txHash } });
                } catch (e: any) {
                    console.warn(`[Cron] On-chain failed for #${p.id}: ${e.message}`);
                }
            }

            const emoji = outcome ? "✅ WIN" : "❌ LOSS";
            console.log(`[Cron] ${emoji} #${p.id} → ${reasoning}${txHash ? ` | TX: ${txHash}` : ""}`);

            // Queue Telegram notification
            NOTIFY_QUEUE.push({
                telegramId: p.user.telegramId,
                message: `🔔 Prediction Update!\n\n${emoji} ${reasoning}\n\n${txHash ? `⛓ bscscan.com/tx/${txHash}` : ""}`,
            });

        } catch (e: any) {
            console.error(`[Cron] Error resolving #${p.id}: ${e.message}`);
        }
    }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("⏰ Rector Auto-Resolution Cron started");
    console.log(`   Polling every ${POLL_INTERVAL_MS / 60000} minutes\n`);

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
