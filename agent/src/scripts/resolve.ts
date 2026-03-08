#!/usr/bin/env tsx
/**
 * Manual Prediction Resolver
 * 
 * Fetches pending predictions, checks Binance klines to see if the target
 * price was reached, and marks them WIN/LOSS in the DB.
 * 
 * Usage:
 *   npx tsx src/scripts/resolve.ts                    → resolve ALL pending
 *   npx tsx src/scripts/resolve.ts --id 42            → resolve specific prediction
 *   npx tsx src/scripts/resolve.ts --telegramId 123   → resolve for a user
 */

import "dotenv/config";
import { prisma } from "../db/prisma.js";

const args = process.argv.slice(2);
const idArg = args.indexOf("--id");
const telegramIdArg = args.indexOf("--telegramId");

const specificId = idArg !== -1 ? parseInt(args[idArg + 1]) : null;
const specificTelegramId = telegramIdArg !== -1 ? args[telegramIdArg + 1] : null;

// ─── Binance klines fetch ────────────────────────────────────────────────────

async function getBinanceKlines(
    symbol: string,
    startMs: number,
    endMs: number,
    interval = "1h"
): Promise<{ high: number; low: number; close: number; openTime: number }[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance API error: ${res.status} for ${symbol}`);
    const data: any[] = await res.json();
    return data.map((c) => ({
        openTime: Number(c[0]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
    }));
}

// ─── Extract target price from claim text ──────────────────────────────────

function extractTarget(claimText: string): { symbol: string; targetPrice: number | null; direction: "above" | "below" } {
    // Extract target price: $900, 900$, 900 USD, hit 900
    const priceMatch = claimText.match(/\$\s*([0-9,]+(?:\.[0-9]+)?)|([0-9,]+(?:\.[0-9]+)?)\s*(?:USD|\$|USDT)/i);
    const targetPrice = priceMatch
        ? parseFloat((priceMatch[1] || priceMatch[2]).replace(/,/g, ""))
        : null;

    // Extract symbol (BNB, BTC, ETH, SOL, etc.)
    const symbolMatch = claimText.match(/\b(BNB|BTC|ETH|SOL|XRP|ADA|MATIC|AVAX|DOT|LINK|UNI|DOGE|SHIB|PEPE|WLD)\b/i);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() + "USDT" : "BNBUSDT";

    // Direction: "above" if "hit", "reach", "above", "over" — else "below"
    const aboveKeywords = /\b(hit|reach|above|over|exceed|break|touch|past|surpass)\b/i;
    const belowKeywords = /\b(below|under|drop|fall|dip)\b/i;
    const direction = belowKeywords.test(claimText) && !aboveKeywords.test(claimText) ? "below" : "above";

    return { symbol, targetPrice, direction };
}

// ─── Resolve a single prediction ───────────────────────────────────────────

async function resolvePrediction(prediction: {
    id: number;
    onchainId: number | null;
    claimText: string;
    disambiguated: string | null;
    resolutionDate: Date;
    createdAt: Date;
}): Promise<string> {
    const text = prediction.disambiguated || prediction.claimText;
    const { symbol, targetPrice, direction } = extractTarget(text);

    if (!targetPrice) {
        await prisma.prediction.update({
            where: { id: prediction.id },
            data: { status: "INCONCLUSIVE", reasoning: "Could not extract target price from claim." },
        });
        return `⚠️  #${prediction.id} → INCONCLUSIVE (no target price found in: "${text.substring(0, 80)}")`;
    }

    // Time range: from submission to resolution date (or now if past)
    const startMs = prediction.createdAt.getTime();
    const endMs = Math.min(prediction.resolutionDate.getTime(), Date.now());

    let outcome: boolean;
    let reasoning: string;
    let evidenceRef: string | undefined;

    try {
        const candles = await getBinanceKlines(symbol, startMs, endMs);

        if (candles.length === 0) {
            await prisma.prediction.update({
                where: { id: prediction.id },
                data: { status: "INCONCLUSIVE", reasoning: `No ${symbol} price data found for the period.` },
            });
            return `⚠️  #${prediction.id} → INCONCLUSIVE (no data for ${symbol})`;
        }

        const allHighs = candles.map((c) => c.high);
        const allLows = candles.map((c) => c.low);
        const maxHigh = Math.max(...allHighs);
        const minLow = Math.min(...allLows);
        const lastClose = candles[candles.length - 1].close;

        if (direction === "above") {
            outcome = maxHigh >= targetPrice;
            reasoning = outcome
                ? `✅ ${symbol} hit a high of $${maxHigh.toFixed(2)}, exceeding target of $${targetPrice}`
                : `❌ ${symbol} peaked at $${maxHigh.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`;
        } else {
            outcome = minLow <= targetPrice;
            reasoning = outcome
                ? `✅ ${symbol} dropped to $${minLow.toFixed(2)}, reaching target of $${targetPrice}`
                : `❌ ${symbol} lowest was $${minLow.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`;
        }

        evidenceRef = `binance_klines:${symbol}:${startMs}:${endMs}:high=${maxHigh}:low=${minLow}`;

    } catch (e: any) {
        await prisma.prediction.update({
            where: { id: prediction.id },
            data: { status: "INCONCLUSIVE", reasoning: `API error: ${e.message}` },
        });
        return `⚠️  #${prediction.id} → INCONCLUSIVE (${e.message})`;
    }

    // Update DB
    await prisma.prediction.update({
        where: { id: prediction.id },
        data: {
            status: "RESOLVED",
            outcome,
            reasoning,
            evidenceRef,
            resolvedAt: new Date(),
        },
    });

    const emoji = outcome ? "✅ WIN" : "❌ LOSS";
    return `${emoji}  #${prediction.id} → ${reasoning}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log("🔍 Rector Prediction Resolver\n");

    let query: any = { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 };

    if (specificId !== null) {
        query = { where: { id: specificId } };
    } else if (specificTelegramId) {
        const user = await prisma.user.findUnique({ where: { telegramId: specificTelegramId } });
        if (!user) { console.log(`❌ User ${specificTelegramId} not found`); process.exit(1); }
        query = { where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" } };
    }

    const predictions = await prisma.prediction.findMany(query);

    if (predictions.length === 0) {
        console.log("✅ No pending predictions to resolve.");
        process.exit(0);
    }

    console.log(`Found ${predictions.length} prediction(s) to check:\n`);

    for (const p of predictions) {
        const result = await resolvePrediction(p);
        console.log(result);
    }

    console.log("\nDone.");
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
