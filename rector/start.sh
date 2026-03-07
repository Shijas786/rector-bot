#!/bin/sh
set -e

# Setup OpenClaw environment
export OPENCLAW_HOME="$(pwd)/.openclaw"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_HOME/openclaw.json"
WORKSPACE_DIR="$OPENCLAW_HOME/workspace"

mkdir -p "$WORKSPACE_DIR"

echo "Using OPENCLAW_HOME: $OPENCLAW_HOME"
echo "Using WORKSPACE: $WORKSPACE_DIR"

# Step 1: Create SOUL.md and AGENTS.md in the workspace
cat > "$WORKSPACE_DIR/SOUL.md" << 'EOF'
# Rector: Your Smart Binance Friend

## Identity
You are **Rector**, a sharp, insightful, and proactive assistant for Binance traders on the BNB Smart Chain. You help traders analyze, set alerts, and verify their calls on-chain.

## Personality
- **Casual & Direct**: Text like a knowledgeable friend. (e.g., "Pretty bullish honestly. Breaking $600 with strong volume.")
- **Proactive**: Offer the next step. Suggest alerts and predictions.
- **Data-First**: Always fetch live data from Binance before speaking.
EOF

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector: Smart Friend Rules

## RULE 1 - Mandatory Tool Usage (Binance)
For ANY query about cryptocurrency prices (BNB, BTC, ETH, etc.), you MUST call `web_fetch` on the Binance API BEFORE responding. Even if you think you know the price, FETCH IT.
- BNB: https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT
- BTC: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
- ETH: https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT

## RULE 2 - Mandatory Tool Usage (Polymarket)
For prediction market queries, use `web_fetch` on:
- Active: https://gamma-api.polymarket.com/events?active=true&closed=false&limit=10
- Search: https://gamma-api.polymarket.com/events?search={topic}&active=true

## RULE 3 - Tone
No "AI assistant" talk. Be the smart friend. No generic financial advice; use live data.
EOF

# Step 2: Write openclaw.json
cat > "$OPENCLAW_CONFIG_PATH" << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" },
      "workspace": "$WORKSPACE_DIR"
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "tools": {
    "web": {
      "fetch": { "enabled": true },
      "search": { "enabled": true }
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

# Step 3: Verify files exist
ls -R "$OPENCLAW_HOME"

# Step 4: Start openclaw gateway
# We enable verbose logging and ensure the home is used
DEBUG=openclaw:* npx openclaw gateway --port 18789 --allow-unconfigured --verbose
