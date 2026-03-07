#!/bin/sh
set -e

# Setup OpenClaw workspace rules
mkdir -p /root/.openclaw/workspace

cat > /root/.openclaw/workspace/AGENTS.md << 'EOF'
# Crypto & Prediction Market Bot Rules

## RULE 1 - Always fetch live prices (Binance)
When any user asks about a crypto price (BTC, BNB, ETH, etc.), you MUST call web_fetch on the Binance public API. 
- API URLs:
  - BNB: https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT
  - BTC: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
  - ETH: https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT
  - SOL: https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT
- Format: "Live {TOKEN} price: $X.XX (source: Binance)"

## RULE 2 - Fetch Prediction Markets (Polymarket)
When a user asks about prediction markets, upcoming events, or past results on Polymarket:
1. Use web_fetch to query the Polymarket Gamma API.
2. Endpoints:
   - Active/Upcoming Markets: https://gamma-api.polymarket.com/events?active=true&closed=false&limit=10
   - Search Specific Topic: https://gamma-api.polymarket.com/events?search={topic}&active=true
   - Past/Closed Markets: https://gamma-api.polymarket.com/events?closed=true&limit=10
3. Rule: Always provide the current "probability" or "odds" if available in the response.
4. Rule: If the user asks for "upcoming" or "past" data, use the corresponding filters above.

## RULE 3 - Generic Response Pattern
Never say you cannot fetch prices or market data. ALWAYS attempt to call the relevant API first (Binance for prices, Polymarket for predictions).
EOF

# Write minimal openclaw config from env
cat > /root/.openclaw/openclaw.json << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" }
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  }
}
EOF

# Start openclaw gateway
npx openclaw gateway --port 18789 --allow-unconfigured
