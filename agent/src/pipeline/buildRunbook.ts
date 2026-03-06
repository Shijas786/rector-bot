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
    const prompt = `You are an onchain prediction verification assistant.

PREDICTION: "${disambiguation.disambiguated}"
SUCCESS CRITERIA: "${disambiguation.successCriteria}"
RESOLUTION DATE: "${disambiguation.resolutionDate}"
PRIMARY SOURCE: ${disambiguation.primarySource}
BSC CONTRACT: ${disambiguation.bscContract || "null"}

Generate markdown runbook.
Priority: Binance API → Chainlink BSC → CoinGecko.
Minimum 2 independent sources.
Use real BSC contract addresses.

Known Chainlink BSC feeds:
${Object.entries(CHAINLINK_FEEDS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Follow this exact format:

# Prediction Runbook

## Metadata
- RunbookID: predict-{id}-{hash}
- PredictionID: {id}
- ResolveAt: {ISO8601}
- Network: BNB Smart Chain (56)
- StoredOn: BNB Greenfield

## Decision
"{precise disambiguated claim}"

## Steps

### Step 1 [PRIMARY] [BINANCE] weight:10
- Type: api_call
- Source: https://api.binance.com/api/v3/ticker/price?symbol=...
- Extract: price
- Success: parseFloat(price) >= ...

### Step 2 [BACKUP] [BSC_ONCHAIN] weight:9
- Type: bsc_read
- Contract: 0x...
- Description: Chainlink .../USD Feed on BSC
- Function: latestAnswer()
- MCP Tool: read_contract
- Success: value / 1e8 >= ...

### Step 3 [FALLBACK] weight:6
- Type: api_call
- Source: https://api.coingecko.com/api/v3/simple/price?ids=...&vs_currencies=usd
- Extract: ...
- Success: value >= ...

## Outcome Logic
STEP_1 OR STEP_2 (≥2 sources must agree)

## Rules
- Binance API is primary source.
- Require ≥2 sources to agree for TRUE.
- Never infer or estimate.
- Return INCONCLUSIVE if sources conflict.
- All timestamps must be on or before ResolveAt.

Use prediction ID ${predictionId} in the RunbookID.
Return ONLY the markdown runbook, nothing else.`;

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
