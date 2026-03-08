#!/bin/sh

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Step 1: Seed the workspace with ALL custom files
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector Core Logic
When a user wants to make a prediction, use the `exec` tool to run the predict script in /app/agent.
When a user asks for analysis of a token, use the `exec` tool to run the analyse script in /app/agent.
Refer to the rector-predictor skill for exact commands.
EOF

# Override TOOLS.md — this is critical, it tells the LLM what tools are available
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

# Override IDENTITY.md
cat > "$WORKSPACE_DIR/IDENTITY.md" << 'EOF'
# Rector Oracle
You are Rector, a crypto prediction oracle on BNB Smart Chain.
You have access to exec and web_fetch tools. Always use them.
EOF

# Override BOOTSTRAP.md
cat > "$WORKSPACE_DIR/BOOTSTRAP.md" << 'EOF'
# Bootstrap
Load and follow the rector-predictor skill in skills/rector-predictor/SKILL.md.
Always use exec and web_fetch tools to fetch live data. Never guess.
EOF

# Copy skills into the workspace
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/* "$WORKSPACE_DIR/skills/"

echo "=== Workspace files ==="
ls -la "$WORKSPACE_DIR"
echo "=== Skills ==="
find "$WORKSPACE_DIR/skills" -name "SKILL.md" 2>/dev/null

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

# Step 3: Run doctor --fix FIRST so it doesn't overwrite our config during gateway start
echo "=== Running openclaw doctor --fix ==="
npx openclaw doctor --fix 2>&1 || echo "Doctor exited with code $?"

# Dump the FINAL config after doctor to see what it actually looks like
echo "=== FINAL openclaw.json (after doctor) ==="
cat /root/.openclaw/openclaw.json

# Step 4: Start openclaw gateway
echo "=== Starting OpenClaw Gateway ==="
npx openclaw gateway --port 18790 &
GATEWAY_PID=$!

echo "Starting socat port forwarder (0.0.0.0:18789 -> 127.0.0.1:18790)..."
socat TCP-LISTEN:18789,fork,reuseaddr TCP:127.0.0.1:18790 &

# Wait for gateway to initialize
echo "Waiting 20s for gateway to initialize..."
sleep 20

# Step 5: Auto-approve the Telegram pairing
echo "Verifying Telegram pairing..."
npx openclaw pairing approve telegram CYXPFK84 || echo "Pairing verification skipped"

# Step 6: Dump the gateway log to see tool registration
echo "=== Gateway log (last 50 lines) ==="
cat /tmp/openclaw/openclaw-*.log 2>/dev/null | tail -50 || echo "No gateway log found"

echo "Rector is now monitoring for messages. Gateway PID: $GATEWAY_PID"

# Step 7: Tail gateway log continuously so we can see tool calls in Railway logs
tail -f /tmp/openclaw/openclaw-*.log 2>/dev/null &

wait $GATEWAY_PID
