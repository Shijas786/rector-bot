#!/bin/sh

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Step 1: Seed workspace files
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector Core Logic
When a user wants to make a prediction, use the `exec` tool to run the predict script in /app/agent.
When a user asks for analysis of a token, use the `exec` tool to run the analyse script in /app/agent.
Refer to the rector-predictor skill for exact commands.
EOF

cat > "$WORKSPACE_DIR/TOOLS.md" << 'EOF'
# Available Tools

You have the following tools available. USE THEM — do not give generic text responses.

## exec
Run shell commands on the server. Use this for token analysis and predictions.
- Parameter: `command` (string) — the shell command to run.
- Example: `exec` with command `cd /app/agent && npx tsx src/scripts/analyse.ts BNB`

## web_fetch
Fetch content from any URL. Use this for live price data.
- Parameter: `url` (string) — the URL to fetch.
- Example: `web_fetch` with url `https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT`

## CRITICAL RULES
- When asked about crypto prices, you MUST use `web_fetch` on the Binance API.
- When asked for token analysis, you MUST use `exec` to run the analyse script.
- When a user makes a prediction, you MUST use `exec` to run the predict script.
- NEVER say "I can't access real-time data". You CAN — use the tools above.
- NEVER give generic advice. Always fetch real data first.
EOF

cat > "$WORKSPACE_DIR/IDENTITY.md" << 'EOF'
# Rector Oracle
You are Rector, a crypto prediction oracle on BNB Smart Chain.
You have access to exec and web_fetch tools. Always use them.
EOF

cat > "$WORKSPACE_DIR/BOOTSTRAP.md" << 'EOF'
# Bootstrap
Load and follow the rector-predictor skill in skills/rector-predictor/SKILL.md.
Always use exec and web_fetch tools to fetch live data. Never guess.
EOF

# Copy skills
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/* "$WORKSPACE_DIR/skills/"

echo "=== Skills ==="
find "$WORKSPACE_DIR/skills" -name "SKILL.md"

# Step 2: Write openclaw.json
mkdir -p /root/.openclaw
cat > "/root/.openclaw/openclaw.json" << 'EOF'
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" },
      "workspace": "/root/.openclaw/workspace"
    }
  },
  "tools": {
    "profile": "full",
    "allow": ["group:runtime", "group:web", "group:fs"],
    "web": {
      "fetch": { "enabled": true },
      "search": { "enabled": true }
    },
    "exec": {
      "security": "full",
      "ask": "off",
      "backgroundMs": 10000,
      "timeoutSec": 60
    }
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  },
  "gateway": {
    "mode": "local",
    "port": 18790,
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
EOF

# Step 3: Doctor fix
echo "=== Running doctor --fix ==="
npx openclaw doctor --fix 2>&1 || true

# Step 4: Start gateway
echo "=== Starting Gateway ==="
npx openclaw gateway --port 18790 &
GATEWAY_PID=$!

socat TCP-LISTEN:18789,fork,reuseaddr TCP:127.0.0.1:18790 &

echo "Waiting 20s for gateway..."
sleep 20

# Step 5: Pairing
npx openclaw pairing approve telegram CYXPFK84 2>/dev/null || true

# Step 6: Read gateway log with strings to strip binary/ANSI
echo "=== Gateway log (via strings) ==="
strings /tmp/openclaw/openclaw-*.log 2>/dev/null | tail -100 || echo "No log"

echo "Rector live. PID: $GATEWAY_PID"

# Step 7: Monitor - every 60s dump new log entries so we see tool calls
while true; do
  sleep 60
  echo "=== LOG UPDATE $(date) ==="
  strings /tmp/openclaw/openclaw-*.log 2>/dev/null | grep -iE "(tool|exec|web_fetch|function|call|error|warn)" | tail -30
done &

wait $GATEWAY_PID
