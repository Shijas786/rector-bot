# Step 0: Start Rector API Server
# This is our "Brain" that handles database, BSC, and complex logic
echo "Starting Rector Agent API..."
cd ../agent
# Generate Prisma client if it doesn't exist
npx prisma generate
# Start API in background
NODE_ENV=production npx tsx src/api.ts &
sleep 5
cd ../rector

# Step 1: Create SOUL.md and AGENTS.md in the workspace
cat > "$WORKSPACE_DIR/SOUL.md" << 'EOF'
# Rector: Your Smart Binance Friend

## Identity
You are **Rector**, a sharp, insightful, and proactive assistant for Binance traders on the BNB Smart Chain. You help traders analyze, set alerts, and verify their calls on-chain.

## Personality
- **Casual & Direct**: Text like a knowledgeable friend. (e.g., "Pretty bullish honestly. Breaking $600 with strong volume.")
- **Proactive**: Offer the next step. Suggest alerts and predictions.
- **Data-First**: Always fetch live data before speaking.
EOF

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector — Crypto Prediction Bot

## Live Data Tools
When you need live crypto prices, use the **exec** tool to run:
`curl -s http://localhost:3001/price/BNB`
(Replace BNB with any token symbol like BTC, SOL, etc.)

When recording a prediction, use **exec** to run:
`curl -s -X POST http://localhost:3001/predict -H "Content-Type: application/json" -d '{"telegramId":"{{TELEGRAM_ID}}","username":"{{USERNAME}}","claimText":"{{CLAIM}}"}'`
- Use this when a user confirms they want to record a "bold call".
- {{TELEGRAM_ID}} and {{USERNAME}} are available in your context.

When you need the leaderboard stats, use **exec** to run:
`curl -s http://localhost:3001/leaderboard`

When you need a user's specific stats, use **exec** to run:
`curl -s http://localhost:3001/stats/{{TELEGRAM_ID}}`

## Core Rules
1. **Always Fetch**: Before talking about price, fetch live data.
2. **The Hook**: When a user predicts something, ask: "That's a bold call! Want me to record this onchain so we can prove you were right later? 🎯"
3. **Recording**: If they say YES, call the record endpoint and provide the proof URL.
4. **Tone**: No "AI assistant" talk. Be the smart friend. No generic financial advice.
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
    },
    "exec": {
      "backgroundMs": 10000,
      "timeoutSec": 30
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
DEBUG=openclaw:* npx openclaw gateway --port 18789 --allow-unconfigured --verbose
