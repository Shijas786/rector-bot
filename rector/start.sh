#!/bin/sh
set -e

# Setup OpenClaw environment
mkdir -p /root/.openclaw/skills/crypto-prices

# Create crypto price skill so bot fetches live Binance data
cat > /root/.openclaw/skills/crypto-prices/SKILL.md << 'EOF'
---
name: crypto-prices
description: Fetch live cryptocurrency prices from Binance
---

When the user asks about any cryptocurrency price (BTC, BNB, ETH, or any token):

1. ALWAYS use web_fetch to call the Binance public API FIRST before answering
2. URL format: https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT
   - BNB price: https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT
   - BTC price: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
   - ETH price: https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT
3. Parse the "price" field from the JSON response
4. Always state the live price clearly with the timestamp

NEVER say you cannot fetch prices. ALWAYS call the Binance API first.
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
  },
  "tools": {
    "web": {
      "fetch": {
        "enabled": true
      }
    }
  }
}
EOF

# Start openclaw gateway (Auto-detects Telegram from config)
npx openclaw gateway --port 18789 --allow-unconfigured
