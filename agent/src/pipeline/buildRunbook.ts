import OpenAI from "openai";
import { DisambiguationResult } from "./disambiguate.js";

/**
 * Runbook Generation Pipeline
 * Uses GPT-4o to create a markdown verification runbook for a prediction.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Well-known Chainlink BSC price feed addresses
const CHAINLINK_FEEDS: Record<string, string> = {
    "BNB/USD": "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
    "BTC/USD": "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf",
    "ETH/USD": "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e",
    "CAKE/USD": "0xB6064eD41d4f67e353768aA239cA86f4F73665a1",
};

/**
 * Build a verification runbook from disambiguation output.
 */
export async function buildRunbook(
    disambiguation: DisambiguationResult,
    predictionId: number
): Promise<string> {
    const startAt = new Date();
    const startTimeIso = startAt.toISOString();
    const startTimeMs = startAt.getTime();
    const endTimeMs = new Date(disambiguation.resolutionDate).getTime();

    const prompt = `You are an elite onchain prediction verification assistant.

PREDICTION: "${disambiguation.disambiguated}"
SUCCESS CRITERIA: "${disambiguation.successCriteria}"
START TIME: "${startTimeIso}" (${startTimeMs}ms)
RESOLUTION DATE: "${disambiguation.resolutionDate}" (${endTimeMs}ms)
PRIMARY SOURCE: ${disambiguation.primarySource}
BSC CONTRACT: ${disambiguation.bscContract || "null"}

Task: Generate a markdown verification runbook.

CRITICAL: If the prediction is "at least once", "hits", or "reaches" a price (a range check), 
you MUST include a Binance Kline check step to verify the high/low across the interval.

Binance Kline URL Template:
https://api.binance.com/api/v3/klines?symbol=BNBUSDT&interval=1m&startTime=${startTimeMs}&endTime=${endTimeMs}
(Adjust symbol as needed)

Priority: Binance API → Chainlink BSC → CoinGecko.
Minimum 2 independent sources.

Known Chainlink BSC feeds:
${Object.entries(CHAINLINK_FEEDS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Format:

# Prediction Runbook

## Metadata
- RunbookID: predict-{id}-{hash}
- PredictionID: {id}
- StartAt: ${startTimeIso}
- ResolveAt: ${disambiguation.resolutionDate}
- Network: BNB Smart Chain (56)

## Decision
"{precise disambiguated claim}"

## Steps

### Step 1 [PRIMARY] [BINANCE_KLINES] weight:10
- Type: kline_check
- Source: https://api.binance.com/api/v3/klines?symbol=...&interval=1m&startTime={startTime_ms}&endTime={endTime_ms}
- Extract: high
- Success: max(high) >= ...

### Step 2 [BACKUP] [BSC_ONCHAIN] weight:9
- Type: bsc_read
- Contract: 0x...
- Description: Chainlink .../USD Feed on BSC
- Function: latestAnswer()
- Success: value / 1e8 >= ...

### Step 3 [FALLBACK] weight:6
- Type: api_call
- Source: https://api.binance.com/api/v3/ticker/price?symbol=...
- Extract: price
- Success: parseFloat(price) >= ...

## Outcome Logic
STEP_1 OR STEP_2 (≥2 sources must agree)

Use prediction ID ${predictionId} in the RunbookID.
Return ONLY the markdown runbook.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
    });

    return response.choices[0].message.content || "";
}

/**
 * Get Chainlink feed address for a symbol pair.
 */
export function getChainlinkFeed(symbol: string): string | null {
    const pair = `${symbol}/USD`;
    return CHAINLINK_FEEDS[pair] || null;
}
