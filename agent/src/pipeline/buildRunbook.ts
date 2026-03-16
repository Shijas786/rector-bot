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

IMPORTANT: Decide what TYPE of claim this is and use the right step types:

═══ CRYPTO PRICE CLAIMS ═══
For price targets, use Binance + Chainlink + CoinGecko:
- Type: kline_check (for range/peak checks)
- Type: api_call with Binance/CoinGecko URLs
- Type: bsc_read with Chainlink contracts

Binance Kline URL Template:
https://api.binance.com/api/v3/klines?symbol=BNBUSDT&interval=1m&startTime=${startTimeMs}&endTime=${endTimeMs}

Known Chainlink BSC feeds:
${Object.entries(CHAINLINK_FEEDS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

═══ ON-CHAIN ANALYTICS / WALLETS (ZERION) ═══
For claims about wallet balances, NFT ownership, or non-Binance token data:

### Step N [WALLET]
- Type: wallet_check
- Source: <wallet address>
- Success: value >= <target USD value>

### Step N [NFT]
- Type: nft_check
- Source: <wallet address>
- Extract: <collection name or ID>
- Success: true (if they hold it)

### Step N [ASSET]
- Type: asset_check
- Source: <zerion asset ID, e.g. ethereum-mainnet:0x...>
- Extract: market_cap (optional)
- Success: value >= ...

═══ NEWS / EVENTS / SPORTS / GENERAL CLAIMS ═══
For non-crypto claims (sports results, elections, product launches, world events, etc.):

### Step N [NEWS]
- Type: news_search
- Extract: <search query keywords>
- Success: articles found confirming/denying the claim

### Step N [WEB]
- Type: web_search  
- Extract: <search query keywords>
- Success: answer or abstract confirms/denies the claim

### Step N [WIKI]
- Type: wiki_lookup
- Extract: <topic name>
- Success: article found with relevant information

═══ STEP STRUCTURE (FLOWCHART ALIGNMENT) ═══
Every verification step MUST follow this exact sub-step pattern:
1. **Fetch Data**: Define the precise API URL, Contract Address, or Search Query.
2. **Verify Source**: Specify how to verify the authenticity of the data (e.g., checking SSL, using an alternative provider, or validating a blockchain signature).
3. **Apply Criteria**: Define the logic/math to apply to the fetched data (e.g., compare price to target, check if keyword exists).
4. **Return YES/NO**: State clearly what data values lead to a YES vs NO outcome for this specific step.

═══ RULES ═══
- Use minimum 2 independent sources
- For crypto: Binance API → Chainlink BSC → CoinGecko
- For news/events: news_search → web_search → wiki_lookup
- For mixed claims: combine both types
- ALWAYS include a news_search or web_search step for non-price claims

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

### Step 1: [Name]
- **Type**: <pipeline_type>
1. **Fetch Data**: ...
2. **Verify Source**: ...
3. **Apply Criteria**: ...
4. **Return YES/NO**: ...

(Repeat for Step 2+)

## Outcome Logic
(describe how steps combine to determine outcome)

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
