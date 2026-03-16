#!/bin/sh
# Rector Core Version: 2.1.2

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Step 1: Seed workspace files
# Force use our corrected SOUL.md everywhere
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/rector-predictor "$WORKSPACE_DIR/skills/"

# Clear ALL agent state to avoid stale sessions/hallucinations
echo "=== Clearing ALL AI Agent State ==="
rm -rf /root/.openclaw/agents/main
mkdir -p /root/.openclaw/agents/main/agent
cp /app/rector/SOUL.md /root/.openclaw/agents/main/agent/SOUL.md
echo "Agent state wiped - AI will start completely fresh"

# SOUL.md is already synced in Step 1
echo "Rector SOUL.md architecture confirmed"


# Skip installing conflicting Skills
echo "=== Skills Cleanup ==="
rm -rf "$WORKSPACE_DIR/skills/bnbchain-mcp-skill"
echo "Conflicting skills removed"

# Failsafe: Ensure agent dependencies and build are present
if [ ! -d "/app/agent/dist" ]; then
    echo "Failsafe: Building agent..."
    cd /app/agent && npm install && npx prisma generate && npm run build
    cd /
fi

# Step 3: Run doctor FIRST to setup system, but we will overwrite its config
echo "=== Running OpenClaw Doctor ==="
npx openclaw doctor --fix 2>&1 || true

# Step 4: Write FINAL openclaw.json (Overwriting whatever doctor did)
echo "=== Writing Final openclaw.json ==="
mkdir -p /root/.openclaw
rm -f /root/.openclaw/mcp.json
cat > "/root/.openclaw/openclaw.json" << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" },
      "workspace": "$WORKSPACE_DIR"
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
      "host": "gateway",
      "security": "full",
      "ask": "off",
      "backgroundMs": 10000,
      "timeoutSec": 60,
      "pathPrepend": ["/usr/local/bin", "/usr/bin", "/bin", "/app/node_modules/.bin"]
    }
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "commands": {
        "native": "auto",
        "nativeSkills": "auto"
      }
    }
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
EOF

# Show final config for debugging
echo "=== FINAL CONFIG ==="
cat /root/.openclaw/openclaw.json

# Step 5: Start gateway
npx openclaw gateway run --port 18789 &
GATEWAY_PID=$!

echo "Waiting 15s for gateway..."
sleep 15

# Start auto-resolution cron
echo "=== Starting auto-resolution cron ==="
cd /app/agent && node dist/scripts/cron.js &

# Step 5: Start HTTP Agent API server (on port PORT)
echo "=== Starting Rector Agent HTTP API ==="
cd /app/agent
# We use exec here so the API process becomes the PID 1 and is seen by Railway as the main service
exec node dist/api.js
