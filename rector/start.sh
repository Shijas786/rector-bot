#!/bin/sh
set -e

# Setup OpenClaw workspace rules
mkdir -p /root/.openclaw/workspace

cat > /root/.openclaw/workspace/AGENTS.md << 'EOF'
# Crypto Price Bot Rules

## RULE 1 - Always fetch live prices
When any user asks about a crypto price, you MUST call web_fetch on the Binance public API. Never say you cannot fetch prices. Never redirect to CoinMarketCap or other sites.

## RULE 2 - API URLs
- BNB:  https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT
- BTC:  https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT  
- ETH:  https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT
- SOL:  https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT
- For any other token append USDT: e.g. ADAUSDT, DOTUSDT

## RULE 3 - Response format
Always reply: "Live BNB price: $X.XX (source: Binance)"
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
