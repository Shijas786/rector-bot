import OpenAI from "openai";

/**
 * Market Analysis Pipeline
 * Fetches Binance OHLCV data and runs GPT-4o analysis.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BINANCE_API = process.env.BINANCE_API_URL || "https://api.binance.com";

import { getZerionWalletPortfolio, getZerionWalletPositions } from "./dataSources.js";

interface MarketData {
    symbol: string;
    price: number;
    change24h: number;
    volume: number;
    avgVolume: number;
    ohlcv: Array<{
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        timestamp: number;
    }>;
    orderBook: {
        bids: Array<[string, string]>; // [Price, Quantity]
        asks: Array<[string, string]>;
    };
}

interface AnalysisResult {
    symbol: string;
    price: number;
    change24h: number;
    volumeRatio: number;
    trend: string;
    support: number;
    resistance: number;
    aiTake: string;
    formattedMessage: string;
}

/**
 * Fetch current price, 24h stats, and Order Book depth from Binance.
 */
async function fetchMarketData(symbol: string): Promise<MarketData> {
    const pair = `${symbol.toUpperCase()}USDT`;

    // Fetch ticker
    const tickerRes = await fetch(`${BINANCE_API}/api/v3/ticker/24hr?symbol=${pair}`);
    const ticker = await tickerRes.json() as {
        lastPrice: string;
        priceChangePercent: string;
        volume: string;
        quoteVolume: string;
    };

    // Fetch 7d klines for OHLCV
    const klinesRes = await fetch(
        `${BINANCE_API}/api/v3/klines?symbol=${pair}&interval=1d&limit=7`
    );
    const klines = await klinesRes.json() as Array<Array<string | number>>;

    const ohlcv = klines.map((k) => ({
        timestamp: k[0] as number,
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
    }));

    // Calculate average volume from 7d data
    const avgVolume = ohlcv.reduce((sum, d) => sum + d.volume, 0) / ohlcv.length;

    // Fetch Order Book Depth (top 50 levels) to find buy/sell walls
    const depthRes = await fetch(`${BINANCE_API}/api/v3/depth?symbol=${pair}&limit=50`);
    const depth = await depthRes.json() as {
        bids: Array<[string, string]>;
        asks: Array<[string, string]>;
    };

    return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.volume),
        avgVolume,
        ohlcv,
        orderBook: depth,
    };
}

/**
 * Run GPT-4o market analysis on the data, leveraging Order Book depth.
 */
async function runAIAnalysis(data: MarketData): Promise<{
    trend: string;
    support: number;
    resistance: number;
    aiTake: string;
}> {
    // Simplify order book for the prompt to fit context window
    const topBids = data.orderBook.bids.slice(0, 10).map(b => `Price: ${b[0]}, Qty: ${b[1]}`);
    const topAsks = data.orderBook.asks.slice(0, 10).map(a => `Price: ${a[0]}, Qty: ${a[1]}`);

    const prompt = `You are an elite OpenClaw Agent and "smart friend" trading assistant.
    
    Analyze this token: ${data.symbol}
    
    Data from Binance API:
    - Current price: $${data.price}
    - 24h change: ${data.change24h}%
    - 24h volume: ${data.volume}
    - 7d OHLCV context: ${JSON.stringify(data.ohlcv)}
    
    Order Book Depth (Find the walls!):
    - Top Bids (Buy Walls): ${JSON.stringify(topBids)}
    - Top Asks (Sell Walls): ${JSON.stringify(topAsks)}
    
    Provide:
    1. Trend direction (bullish/bearish/neutral)
    2. Key support level based on Bid walls (number only)
    3. Key resistance level based on Ask walls (number only)
    4. Brief AI take (2-3 sentences max). Use a casual, insightful "smart friend" tone discussing the buy/sell walls. (e.g., "Massive buy wall at $580 acting as strong support. If we chew through the $600 ask wall, we're flying.")
    
    Return ONLY JSON:
    {
      "trend": "bullish|bearish|neutral",
      "support": 580,
      "resistance": 600,
      "aiTake": "your analysis"
    }`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content);
}

/**
 * Full market analysis pipeline.
 */
export async function analyseToken(symbol: string): Promise<AnalysisResult> {
    const data = await fetchMarketData(symbol);
    const analysis = await runAIAnalysis(data);

    const volumeRatio = data.volume / data.avgVolume;
    const changeEmoji = data.change24h >= 0 ? "📈" : "📉";

    const formattedMessage = `📊 ${data.symbol}/USDT Analysis
─────────────────────
Price:      $${data.price.toLocaleString()}
24h Change: ${data.change24h >= 0 ? "+" : ""}${data.change24h.toFixed(1)}% ${changeEmoji}

AI Take:
"${analysis.aiTake}"

Trend: ${analysis.trend.charAt(0).toUpperCase() + analysis.trend.slice(1)}
Target Resistance: $${analysis.resistance.toLocaleString()}

Want me to set an alert at $${analysis.resistance.toLocaleString()}? ✅`;

    return {
        symbol: data.symbol,
        price: data.price,
        change24h: data.change24h,
        volumeRatio,
        trend: analysis.trend,
        support: analysis.support,
        resistance: analysis.resistance,
        aiTake: analysis.aiTake,
        formattedMessage,
    };
}
/**
 * Wallet Analysis Pipeline
 */
export async function analyseWallet(address: string): Promise<string> {
    try {
        const [portfolio, positions] = await Promise.all([
            getZerionWalletPortfolio(address),
            getZerionWalletPositions(address)
        ]);

        const totalValue = portfolio?.data?.attributes?.total?.positions || portfolio?.data?.attributes?.total?.value || 0;
        
        // Extract Chain Breakdown
        const chains = portfolio?.data?.attributes?.chains || {};
        const chainBreakdown = Object.entries(chains)
            .map(([name, data]: [string, any]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value: data?.value || data?.positions || 0
            }))
            .filter(c => c.value > 0.01)
            .sort((a, b) => b.value - a.value);

        const chainList = chainBreakdown.length > 0
            ? chainBreakdown.map(c => `• **${c.name}**: $${c.value.toLocaleString()}`).join("\n")
            : "No chain data found.";

        const topPositions = (positions?.data || [])
            .slice(0, 15) // Show top 15 instead of 5
            .map((p: any) => ({
                name: p.attributes?.name || "Unknown",
                value: p.attributes?.value || 0,
                symbol: p.attributes?.fungible_info?.symbol || "",
                price: p.attributes?.fungible_info?.implementations?.[0]?.price || 0
            }))
            .filter((p: any) => p.value > 0.01);

        const assetsList = topPositions.length > 0 
            ? topPositions.map((p: any) => `• **${p.name}** (${p.symbol}): $${p.value.toLocaleString()}`).join("\n")
            : "No significant positions found.";

        return `💰 **RECTOR: PORTFOLIO SUMMARY** 🛡️
━━━━━━━━━━━━━━━━━━━━━━━━
📍 **Address:** \`${address}\`
━━━━━━━━━━━━━━━━━━━━━━━━

💎 **Total Net Worth:** **$${totalValue.toLocaleString()}**

📊 **Chain Distribution:**
${chainList}

🚀 **Top Assets:**
${assetsList}

━━━━━━━━━━━━━━━━━━━━━━━━
*(Real-time sync enabled. Data powered by Zerion)*`;
    } catch (error: any) {
        console.error("[Zerion Error]", error.message);
        throw new Error(`Zerion Analysis Failed: ${error.message}`);
    }
}
