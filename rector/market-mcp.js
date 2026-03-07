const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', async (line) => {
    if (!line) return;
    try {
        const req = JSON.parse(line);

        if (req.method === "initialize") {
            console.log(JSON.stringify({
                jsonrpc: "2.0",
                id: req.id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: { name: "market-mcp", version: "1.0.0" }
                }
            }));
        } else if (req.method === "tools/list") {
            console.log(JSON.stringify({
                jsonrpc: "2.0",
                id: req.id,
                result: {
                    tools: [
                        {
                            name: "get_binance_market_data",
                            description: "Get real-time market data (price, 24h change, volume, 7d history) for a crypto token from Binance.",
                            inputSchema: {
                                type: "object",
                                properties: { symbol: { type: "string", description: "Token symbol (e.g. BNB, BTC)" } },
                                required: ["symbol"]
                            }
                        },
                        {
                            name: "search_polymarket_events",
                            description: "Search for active prediction market events on Polymarket by keyword to gauge probabilities.",
                            inputSchema: {
                                type: "object",
                                properties: { query: { type: "string", description: "Search keyword matching prediction topics." } },
                                required: ["query"]
                            }
                        }
                    ]
                }
            }));
        } else if (req.method === "tools/call") {
            if (req.params.name === "get_binance_market_data") {
                const symbol = req.params.arguments?.symbol || "BNB";
                try {
                    const pair = `${symbol.toUpperCase()}USDT`;
                    const [tickerRes, klinesRes] = await Promise.all([
                        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`),
                        fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=7`)
                    ]);

                    if (!tickerRes.ok) throw new Error(`Binance pair ${pair} not found.`);

                    const ticker = await tickerRes.json();
                    const klines = await klinesRes.json();

                    const ohlcv = Array.isArray(klines) ? klines.map(k => ({
                        timestamp: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
                        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
                    })) : [];

                    const avgVolume = ohlcv.length ? ohlcv.reduce((s, k) => s + k.volume, 0) / ohlcv.length : 0;

                    const resultData = {
                        symbol: symbol.toUpperCase(),
                        price: parseFloat(ticker.lastPrice),
                        change24hPercent: parseFloat(ticker.priceChangePercent),
                        volume24h: parseFloat(ticker.volume),
                        avgVolume7d: avgVolume,
                        history7d: ohlcv
                    };

                    console.log(JSON.stringify({
                        jsonrpc: "2.0",
                        id: req.id,
                        result: { content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }] }
                    }));
                } catch (e) {
                    console.log(JSON.stringify({
                        jsonrpc: "2.0",
                        id: req.id,
                        result: { isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] }
                    }));
                }
            } else if (req.params.name === "search_polymarket_events") {
                const query = req.params.arguments?.query || "crypto";
                try {
                    const res = await fetch(`https://gamma-api.polymarket.com/events?query=${encodeURIComponent(query)}&active=true&closed=false`);
                    const data = await res.json();

                    if (!res.ok) throw new Error("Polymarket API error.");

                    const events = (data || []).slice(0, 4).map(e => ({
                        title: e.title,
                        description: e.description,
                        startDate: e.startDate,
                        endDate: e.endDate,
                        markets: (e.markets || []).map(m => ({
                            question: m.question,
                            outcomePrices: m.outcomePrices
                        }))
                    }));

                    console.log(JSON.stringify({
                        jsonrpc: "2.0",
                        id: req.id,
                        result: { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] }
                    }));
                } catch (e) {
                    console.log(JSON.stringify({
                        jsonrpc: "2.0",
                        id: req.id,
                        result: { isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] }
                    }));
                }
            }
        }
    } catch (e) {
        // Ignore parse errors from blank lines
    }
});
