#!/bin/sh

# Fix paths - openclaw uses /root/.openclaw NOT /app/rector/.openclaw
export OPENCLAW_HOME="/root/.openclaw"
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Write SOUL.md - Defines the persona
cat > "$WORKSPACE_DIR/SOUL.md" << 'EOF'
# Rector: Your Smart Binance Friend
You are Rector, a sharp crypto assistant for BNB traders.
Be casual, direct, and data-first. Text like a knowledgeable friend.
EOF

# Write AGENTS.md - Defines the behavior rules
cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector Rules

When a user makes a price prediction (e.g. "BTC will crash to $50k"), you MUST:
1. Fetch the live price first using web_fetch: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
2. Then say: "That's a bold call! Want me to record this on-chain so you can prove it later? Reply YES to confirm 🎯"
3. If they reply YES, confirm the prediction is being recorded and give them: https://rector-bot.js.org/profile/@USERNAME

For any price question, ALWAYS use web_fetch on https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT first.
Never say you cannot fetch prices.
EOF

echo "AGENTS.md written to $WORKSPACE_DIR"
ls "$WORKSPACE_DIR"

# Start openclaw gateway
# We use --allow-unconfigured to run with env vars (TELEGRAM_BOT_TOKEN)
npx openclaw gateway --port 18789 --allow-unconfigured
