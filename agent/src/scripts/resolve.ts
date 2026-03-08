#!/usr/bin/env tsx
/**
 * Multi-Source Prediction Resolver — with on-chain attestation
 *
 * Routes to the correct data source based on disambiguation.primarySource:
 *   - binance_api     → Binance klines (price targets)
 *   - coingecko       → CoinGecko price history (alt coins not on Binance)
 *   - polymarket_api  → Polymarket Gamma API (real-world events)
 *   - chainlink_bsc   → Chainlink price feed on BSC
 *
 * Usage:
 *   npx tsx src/scripts/resolve.ts                    → resolve ALL pending
 *   npx tsx src/scripts/resolve.ts --id 42            → resolve specific
 *   npx tsx src/scripts/resolve.ts --telegramId 123   → resolve for a user
 *   npx tsx src/scripts/resolve.ts --dry-run          → preview only
 */

import "dotenv/config";
import { ethers } from "ethers";
import { prisma } from "../db/prisma.js";
import { resolvePrediction as resolveOnChain, markInconclusive as markInconclusiveOnChain } from "../mcp/bsc.js";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const idArg = args.indexOf("--id");
const telegramIdArg = args.indexOf("--telegramId");
const specificId = idArg !== -1 ? parseInt(args[idArg + 1]) : null;
const specificTelegramId = telegramIdArg !== -1 ? args[telegramIdArg + 1] : null;

if (isDryRun) console.log("🔍 DRY RUN MODE — no writes\n");

// ─── Binance klines ───────────────────────────────────────────────────────────

async function getBinanceKlines(symbol: string, startMs: number, endMs: number) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startMs}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance error ${res.status} for ${symbol}`);
    const data: any[] = await res.json();
    return data.map((c) => ({ high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) }));
}

// ─── CoinGecko price history ──────────────────────────────────────────────────

async function getCoinGeckoHistory(coinId: string, startMs: number, endMs: number) {
    const from = Math.floor(startMs / 1000);
    const to = Math.floor(endMs / 1000);
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko error ${res.status} for ${coinId}`);
    const data: { prices: [number, number][] } = await res.json();
    const prices = data.prices.map(([, p]) => p);
    return { high: Math.max(...prices), low: Math.min(...prices), last: prices[prices.length - 1] };
}

// ─── Polymarket Gamma API ─────────────────────────────────────────────────────

async function searchPolymarket(query: string): Promise<{
    question: string;
    resolved: boolean;
    outcome?: string;  // "Yes" | "No"
    endDate?: string;
} | null> {
    const url = `https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const markets: any[] = await res.json();
    if (!markets.length) return null;

    // Pick the most relevant market (highest volume, closest match)
    const market = markets[0];
    return {
        question: market.question,
        resolved: market.resolved ?? false,
        outcome: market.outcome,
        endDate: market.endDate,
    };
}

// ─── Chainlink on BSC ────────────────────────────────────────────────────────

const CHAINLINK_FEEDS: Record<string, string> = {
    BNBUSDT: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
    BTCUSDT: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf",
    ETHUSDT: "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e",
};

async function getChainlinkPrice(symbol: string): Promise<number | null> {
    const feedAddress = CHAINLINK_FEEDS[symbol.toUpperCase()];
    if (!feedAddress) return null;
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org");
        const abi = ["function latestAnswer() view returns (int256)", "function decimals() view returns (uint8)"];
        const feed = new ethers.Contract(feedAddress, abi, provider);
        const [answer, decimals] = await Promise.all([feed.latestAnswer(), feed.decimals()]);
        return Number(answer) / Math.pow(10, Number(decimals));
    } catch {
        return null;
    }
}

// ─── Extract target from text ─────────────────────────────────────────────────

function extractPriceTarget(text: string): { symbol: string; targetPrice: number | null; direction: "above" | "below" } {
    const priceMatch = text.match(/\$\s*([0-9,]+(?:\.[0-9]+)?)|([0-9,]+(?:\.[0-9]+)?)\s*(?:USD|\$|USDT)/i);
    const targetPrice = priceMatch ? parseFloat((priceMatch[1] || priceMatch[2]).replace(/,/g, "")) : null;
    const symbolMatch = text.match(/\b(BNB|BTC|ETH|SOL|XRP|ADA|MATIC|AVAX|DOT|LINK|UNI|DOGE|SHIB|PEPE|WLD|ARB|OP)\b/i);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() + "USDT" : "BNBUSDT";
    const direction = /\b(below|under|drop|fall|dip|crash)\b/i.test(text) && !/\b(hit|reach|above|over|exceed|break|touch)\b/i.test(text) ? "below" : "above";
    return { symbol, targetPrice, direction };
}

function symbolToCoinGeckoId(symbol: string): string {
    const map: Record<string, string> = {
        BNB: "binancecoin", BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
        XRP: "ripple", ADA: "cardano", MATIC: "matic-network", AVAX: "avalanche-2",
        DOT: "polkadot", LINK: "chainlink", UNI: "uniswap", DOGE: "dogecoin",
        SHIB: "shiba-inu", ARB: "arbitrum", OP: "optimism",
    };
    return map[symbol.replace("USDT", "")] || symbol.toLowerCase().replace("usdt", "");
}

// ─── Oracle signature ─────────────────────────────────────────────────────────

async function signResolution(predictionId: number, outcome: boolean, evidenceRef: string): Promise<string> {
    if (!process.env.PRIVATE_KEY) return "0x";
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const msgHash = ethers.solidityPackedKeccak256(["uint256", "bool", "string"], [predictionId, outcome, evidenceRef]);
    return wallet.signMessage(ethers.getBytes(msgHash));
}

// ─── Resolver: Binance ────────────────────────────────────────────────────────

async function resolveBinance(text: string, startMs: number, endMs: number) {
    const { symbol, targetPrice, direction } = extractPriceTarget(text);
    if (!targetPrice) return null;

    const candles = await getBinanceKlines(symbol, startMs, endMs);
    if (!candles.length) throw new Error(`No Binance data for ${symbol}`);

    const maxHigh = Math.max(...candles.map((c) => c.high));
    const minLow = Math.min(...candles.map((c) => c.low));
    const lastClose = candles[candles.length - 1].close;
    const outcome = direction === "above" ? maxHigh >= targetPrice : minLow <= targetPrice;
    const reasoning = direction === "above"
        ? outcome ? `${symbol} hit $${maxHigh.toFixed(2)}, exceeding target $${targetPrice}` : `${symbol} peaked at $${maxHigh.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`
        : outcome ? `${symbol} dropped to $${minLow.toFixed(2)}, reaching target $${targetPrice}` : `${symbol} lowest $${minLow.toFixed(2)}, never reached $${targetPrice} (last: $${lastClose.toFixed(2)})`;
    const evidenceRef = `binance:${symbol}:hi=${maxHigh.toFixed(2)}:lo=${minLow.toFixed(2)}`;

    return { outcome, reasoning, evidenceRef };
}

// ─── Resolver: CoinGecko ──────────────────────────────────────────────────────

async function resolveCoinGecko(text: string, startMs: number, endMs: number) {
    const { symbol, targetPrice, direction } = extractPriceTarget(text);
    if (!targetPrice) return null;

    const coinId = symbolToCoinGeckoId(symbol);
    const { high, low, last } = await getCoinGeckoHistory(coinId, startMs, endMs);
    const outcome = direction === "above" ? high >= targetPrice : low <= targetPrice;
    const reasoning = direction === "above"
        ? outcome ? `${symbol} hit $${high.toFixed(2)}, exceeding target $${targetPrice}` : `${symbol} peaked at $${high.toFixed(2)}, never reached $${targetPrice} (last: $${last.toFixed(2)})`
        : outcome ? `${symbol} dropped to $${low.toFixed(2)}, reaching target $${targetPrice}` : `${symbol} lowest $${low.toFixed(2)}, never reached $${targetPrice}`;
    const evidenceRef = `coingecko:${coinId}:hi=${high.toFixed(2)}:lo=${low.toFixed(2)}`;

    return { outcome, reasoning, evidenceRef };
}

// ─── Resolver: Polymarket ─────────────────────────────────────────────────────

async function resolvePolymarket(text: string, successCriteria: string) {
    // Use successCriteria (precise statement) for better search
    const searchQuery = successCriteria || text.substring(0, 100);
    const market = await searchPolymarket(searchQuery);

    if (!market) {
        throw new Error(`No Polymarket market found for: "${searchQuery.substring(0, 60)}"`);
    }

    if (!market.resolved) {
        return null; // Not resolved yet — leave as PENDING
    }

    // Polymarket resolved — outcome is "Yes" or "No"
    const outcome = market.outcome?.toLowerCase() === "yes";
    const reasoning = `Polymarket market "${market.question}" resolved ${market.outcome} (end date: ${market.endDate})`;
    const evidenceRef = `polymarket:${encodeURIComponent(market.question.substring(0, 100))}:outcome=${market.outcome}`;

    return { outcome, reasoning, evidenceRef };
}

// ─── Resolver: Chainlink ──────────────────────────────────────────────────────

async function resolveChainlink(text: string) {
    const { symbol, targetPrice, direction } = extractPriceTarget(text);
    if (!targetPrice) return null;

    const price = await getChainlinkPrice(symbol);
    if (!price) throw new Error(`No Chainlink feed for ${symbol}`);

    const outcome = direction === "above" ? price >= targetPrice : price <= targetPrice;
    const reasoning = `Chainlink BSC feed: ${symbol} current price $${price.toFixed(2)} vs target $${targetPrice}`;
    const evidenceRef = `chainlink:${symbol}:price=${price.toFixed(2)}:target=${targetPrice}:direction=${direction}`;

    return { outcome, reasoning, evidenceRef };
}

// ─── Write on-chain ───────────────────────────────────────────────────────────

async function writeOnChain(prediction: { id: number; onchainId: number | null }, outcome: boolean, evidenceRef: string, reasoning: string) {
    if (!prediction.onchainId || isDryRun) return null;
    try {
        const signature = await signResolution(prediction.onchainId, outcome, evidenceRef);
        const { txHash } = await resolveOnChain(prediction.onchainId, outcome, 90, evidenceRef, reasoning, signature);
        await prisma.prediction.update({ where: { id: prediction.id }, data: { txHashResolve: txHash } });
        return txHash;
    } catch (e: any) {
        console.warn(`⚠️  On-chain write failed: ${e.message}`);
        return null;
    }
}

// ─── Main resolver ────────────────────────────────────────────────────────────

async function resolvePrediction(prediction: {
    id: number;
    onchainId: number | null;
    claimText: string;
    disambiguated: string | null;
    successCriteria: string | null;
    primarySource: string | null;
    resolutionDate: Date;
    createdAt: Date;
}): Promise<string> {
    const text = prediction.disambiguated || prediction.claimText;
    const source = prediction.primarySource || "binance_api";
    const startMs = prediction.createdAt.getTime();
    const endMs = Math.min(prediction.resolutionDate.getTime(), Date.now());

    let result: { outcome: boolean; reasoning: string; evidenceRef: string } | null = null;

    try {
        switch (source) {
            case "binance_api":
                result = await resolveBinance(text, startMs, endMs);
                break;
            case "coingecko":
                result = await resolveCoinGecko(text, startMs, endMs);
                break;
            case "polymarket_api":
                result = await resolvePolymarket(text, prediction.successCriteria || "");
                if (!result) return `⏳ #${prediction.id} → PENDING (Polymarket market not yet resolved)`;
                break;
            case "chainlink_bsc":
                result = await resolveChainlink(text);
                break;
            default:
                result = await resolveBinance(text, startMs, endMs);
        }
    } catch (e: any) {
        const msg = `Resolution error (${source}): ${e.message}`;
        if (!isDryRun) {
            await prisma.prediction.update({ where: { id: prediction.id }, data: { status: "INCONCLUSIVE", reasoning: msg } });
            if (prediction.onchainId) await markInconclusiveOnChain(prediction.onchainId).catch(() => { });
        }
        return `⚠️  #${prediction.id} → INCONCLUSIVE | ${msg}`;
    }

    if (!result) {
        if (!isDryRun) {
            await prisma.prediction.update({ where: { id: prediction.id }, data: { status: "INCONCLUSIVE", reasoning: "Could not extract target from claim." } });
        }
        return `⚠️  #${prediction.id} → INCONCLUSIVE (no target price/event found)`;
    }

    const { outcome, reasoning, evidenceRef } = result;

    if (!isDryRun) {
        await prisma.prediction.update({
            where: { id: prediction.id },
            data: { status: "RESOLVED", outcome, reasoning, evidenceRef, resolvedAt: new Date() },
        });
        const txHash = await writeOnChain(prediction, outcome, evidenceRef, reasoning);
        const txLine = txHash ? ` | ⛓ bscscan.com/tx/${txHash}` : " | (DB only)";
        return `${outcome ? "✅ WIN" : "❌ LOSS"}  #${prediction.id} [${source}] → ${reasoning}${txLine}`;
    }

    return `${outcome ? "✅ WIN" : "❌ LOSS"}  #${prediction.id} [DRY RUN/${source}] → ${reasoning}`;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("🔍 Rector Multi-Source Prediction Resolver\n");

    let query: any = { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 };

    if (specificId !== null) {
        query = { where: { id: specificId } };
    } else if (specificTelegramId) {
        const user = await prisma.user.findUnique({ where: { telegramId: specificTelegramId } });
        if (!user) { console.log(`❌ User ${specificTelegramId} not found`); process.exit(1); }
        query = { where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" } };
    }

    const predictions = await prisma.prediction.findMany(query);

    if (!predictions.length) { console.log("✅ No pending predictions."); process.exit(0); }

    console.log(`Found ${predictions.length} prediction(s):\n`);
    for (const p of predictions) {
        const result = await resolvePrediction(p as any);
        console.log(result);
    }
    console.log("\nDone.");
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
