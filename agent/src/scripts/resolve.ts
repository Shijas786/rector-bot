#!/usr/bin/env tsx
/**
 * Manual Prediction Resolver — with on-chain attestation
 *
 * Fetches pending predictions, checks Binance klines to see if the target
 * price was reached, marks them WIN/LOSS in DB, and calls resolveAndAttest()
 * on the BSC smart contract so every resolution is verifiable on BSCScan.
 *
 * Usage:
 *   npx tsx src/scripts/resolve.ts                    → resolve ALL pending
 *   npx tsx src/scripts/resolve.ts --id 42            → resolve specific prediction
 *   npx tsx src/scripts/resolve.ts --telegramId 123   → resolve for a user
 *   npx tsx src/scripts/resolve.ts --dry-run          → check without writing
 */

import "dotenv/config";
import { ethers } from "ethers";
import { prisma } from "../db/prisma.js";
import { resolvePrediction as resolveOnChain, markInconclusive as markInconclusiveOnChain } from "../mcp/bsc.js";

const args = process.argv.slice(2);
const idArg = args.indexOf("--id");
const telegramIdArg = args.indexOf("--telegramId");
const isDryRun = args.includes("--dry-run");

const specificId = idArg !== -1 ? parseInt(args[idArg + 1]) : null;
const specificTelegramId = telegramIdArg !== -1 ? args[telegramIdArg + 1] : null;

if (isDryRun) console.log("🔍 DRY RUN MODE — no writes\n");

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

// ─── Extract target from claim text ─────────────────────────────────────────

function extractTarget(claimText: string): {
    symbol: string;
    targetPrice: number | null;
    direction: "above" | "below";
} {
    const priceMatch = claimText.match(/\$\s*([0-9,]+(?:\.[0-9]+)?)|([0-9,]+(?:\.[0-9]+)?)\s*(?:USD|\$|USDT)/i);
    const targetPrice = priceMatch
        ? parseFloat((priceMatch[1] || priceMatch[2]).replace(/,/g, ""))
        : null;

    const symbolMatch = claimText.match(
        /\b(BNB|BTC|ETH|SOL|XRP|ADA|MATIC|AVAX|DOT|LINK|UNI|DOGE|SHIB|PEPE|WLD)\b/i
    );
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() + "USDT" : "BNBUSDT";

    const belowKeywords = /\b(below|under|drop|fall|dip|crash)\b/i;
    const aboveKeywords = /\b(hit|reach|above|over|exceed|break|touch|past|surpass|pump)\b/i;
    const direction =
        belowKeywords.test(claimText) && !aboveKeywords.test(claimText) ? "below" : "above";

    return { symbol, targetPrice, direction };
}

// ─── Build oracle signature ──────────────────────────────────────────────────

async function signResolution(
    predictionId: number,
    outcome: boolean,
    evidenceRef: string
): Promise<string> {
    if (!process.env.PRIVATE_KEY) return "0x";
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const msgHash = ethers.solidityPackedKeccak256(
        ["uint256", "bool", "string"],
        [predictionId, outcome, evidenceRef]
    );
    return wallet.signMessage(ethers.getBytes(msgHash));
}

// ─── Resolve a single prediction ─────────────────────────────────────────────

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

    // ── INCONCLUSIVE: no target price ──────────────────────────────────────────
    if (!targetPrice) {
        const reasoning = "Could not extract target price from claim.";
        if (!isDryRun) {
            await prisma.prediction.update({
                where: { id: prediction.id },
                data: { status: "INCONCLUSIVE", reasoning },
            });
            // On-chain: markInconclusive (only if we have an onchainId)
            if (prediction.onchainId) {
                try {
                    const { txHash } = await markInconclusiveOnChain(prediction.onchainId);
                    await prisma.prediction.update({
                        where: { id: prediction.id },
                        data: { txHashResolve: txHash },
                    });
                    return `⚠️  #${prediction.id} → INCONCLUSIVE (no target price) | TX: bscscan.com/tx/${txHash}`;
                } catch (e: any) {
                    return `⚠️  #${prediction.id} → INCONCLUSIVE (no target price) | On-chain failed: ${e.message}`;
                }
            }
        }
        return `⚠️  #${prediction.id} → INCONCLUSIVE (no target price in: "${text.substring(0, 80)}")`;
    }

    // ── Fetch klines ────────────────────────────────────────────────────────────
    const startMs = prediction.createdAt.getTime();
    const endMs = Math.min(prediction.resolutionDate.getTime(), Date.now());

    let outcome: boolean;
    let reasoning: string;
    let evidenceRef: string;

    try {
        const candles = await getBinanceKlines(symbol, startMs, endMs);

        if (candles.length === 0) {
            if (!isDryRun) {
                await prisma.prediction.update({
                    where: { id: prediction.id },
                    data: { status: "INCONCLUSIVE", reasoning: `No ${symbol} data for period.` },
                });
            }
            return `⚠️  #${prediction.id} → INCONCLUSIVE (no candle data for ${symbol})`;
        }

        const maxHigh = Math.max(...candles.map((c) => c.high));
        const minLow = Math.min(...candles.map((c) => c.low));
        const lastClose = candles[candles.length - 1].close;

        if (direction === "above") {
            outcome = maxHigh >= targetPrice;
            reasoning = outcome
                ? `${symbol} hit $${maxHigh.toFixed(2)}, exceeding target of $${targetPrice}`
                : `${symbol} peaked at $${maxHigh.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`;
        } else {
            outcome = minLow <= targetPrice;
            reasoning = outcome
                ? `${symbol} dropped to $${minLow.toFixed(2)}, reaching target of $${targetPrice}`
                : `${symbol} lowest was $${minLow.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`;
        }

        evidenceRef = `binance:${symbol}:${startMs}:${endMs}:hi=${maxHigh.toFixed(2)}:lo=${minLow.toFixed(2)}`;

    } catch (e: any) {
        if (!isDryRun) {
            await prisma.prediction.update({
                where: { id: prediction.id },
                data: { status: "INCONCLUSIVE", reasoning: `API error: ${e.message}` },
            });
        }
        return `⚠️  #${prediction.id} → INCONCLUSIVE (${e.message})`;
    }

    if (isDryRun) {
        const emoji = outcome ? "✅ WIN" : "❌ LOSS";
        return `${emoji}  #${prediction.id} [DRY RUN] → ${reasoning}`;
    }

    // ── Update DB ───────────────────────────────────────────────────────────────
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

    // ── On-chain resolveAndAttest ────────────────────────────────────────────────
    let txLine = "";
    if (prediction.onchainId) {
        try {
            const signature = await signResolution(prediction.onchainId, outcome, evidenceRef);
            const confidence = 90; // expressed as integer 0-100
            const { txHash } = await resolveOnChain(
                prediction.onchainId,
                outcome,
                confidence,
                evidenceRef,
                reasoning,
                signature
            );
            await prisma.prediction.update({
                where: { id: prediction.id },
                data: { txHashResolve: txHash },
            });
            txLine = ` | ⛓ bscscan.com/tx/${txHash}`;
        } catch (e: any) {
            txLine = ` | ⚠️ On-chain failed: ${e.message}`;
        }
    } else {
        txLine = " | (no onchainId — DB only)";
    }

    const emoji = outcome ? "✅ WIN" : "❌ LOSS";
    return `${emoji}  #${prediction.id} → ${reasoning}${txLine}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("🔍 Rector Prediction Resolver\n");

    let query: any = {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 50,
    };

    if (specificId !== null) {
        query = { where: { id: specificId } };
    } else if (specificTelegramId) {
        const user = await prisma.user.findUnique({ where: { telegramId: specificTelegramId } });
        if (!user) {
            console.log(`❌ User ${specificTelegramId} not found`);
            process.exit(1);
        }
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

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
