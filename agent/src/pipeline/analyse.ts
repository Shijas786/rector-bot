import OpenAI from "openai";

/**
 * Market Analysis Pipeline
 * Fetches Binance OHLCV data and runs GPT-4o analysis.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BINANCE_API = process.env.BINANCE_API_URL || "https://api.binance.com";

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
 * Fetch current price and 24h stats from Binance.
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

    return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.volume),
        avgVolume,
        ohlcv,
    };
}

/**
 * Run GPT-4o market analysis on the data.
 */
async function runAIAnalysis(data: MarketData): Promise<{
    trend: string;
    support: number;
    resistance: number;
    aiTake: string;
}> {
    const prompt = `You are Rector, a "smart friend" trading assistant for Binance traders.
    
    Analyze this token: ${data.symbol}
    
    Data from Binance API:
    - Current price: $${data.price}
    - 24h change: ${data.change24h}%
    - 24h volume: ${data.volume}
    - 7d OHLCV: ${JSON.stringify(data.ohlcv)}
    
    Provide:
    1. Trend direction (bullish/bearish/neutral)
    2. Key support level (number only)
    3. Key resistance level (number only)
    4. Brief AI take (2-3 sentences max). Use a casual, insightful "smart friend" tone. (e.g., "Pretty bullish honestly. Breaking $600 with strong volume.")
    
    Return ONLY JSON:
    {
      "trend": "bullish|bearish|neutral",
      "support": 580,
      "resistance": 650,
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
