#!/bin/sh

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"


# Step 1: Seed the workspace with the real SOUL.md and AGENTS.md
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector Core Logic
When a user wants to make a prediction, use the `exec` tool to run the predict script in /app/agent.
When a user asks for analysis of a token, use the `exec` tool to run the analyse script in /app/agent.
Refer to the rector-predictor skill for exact commands.
EOF

# Copy skills into the workspace
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/* "$WORKSPACE_DIR/skills/"

echo "Workspace initialized at $WORKSPACE_DIR"
ls -la "$WORKSPACE_DIR"
echo "--- Skills directory ---"
find "$WORKSPACE_DIR/skills" -type f 2>/dev/null || echo "No skills found!"
echo "--- SOUL.md content ---"
head -5 "$WORKSPACE_DIR/SOUL.md"
echo "--- openclaw.json ---"

# Step 2: Write openclaw.json to the correct location
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

echo "openclaw.json written to /root/.openclaw/openclaw.json"
cat /root/.openclaw/openclaw.json

# Step 3: Start openclaw gateway on localhost:18790 and forward to 0.0.0.0:18789
echo "Starting OpenClaw Gateway on localhost:18790..."
npx openclaw gateway --port 18790 &
GATEWAY_PID=$!

echo "Starting socat port forwarder (0.0.0.0:18789 -> 127.0.0.1:18790)..."
socat TCP-LISTEN:18789,fork,reuseaddr TCP:127.0.0.1:18790 &

# Wait for gateway to initialize
echo "Waiting 15s for gateway to initialize..."
sleep 15

# Step 4: Auto-approve the Telegram pairing
echo "Verifying Telegram pairing..."
npx openclaw pairing approve telegram CYXPFK84 || echo "Pairing verification skipped or failed"

# Step 5: Keep the process alive by waiting on the gateway
echo "Rector is now monitoring for messages. Gateway PID: $GATEWAY_PID"
wait $GATEWAY_PID
