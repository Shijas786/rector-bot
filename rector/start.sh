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

# Step 5: Start HTTP Agent API server (on port 3001)
echo "=== Starting Rector Agent HTTP API ==="
cd /app/agent && node dist/api.js &
API_PID=$!
echo "Agent API PID: $API_PID"
cd /

# Wait for API server to be ready
sleep 5
node -e "require('http').get('http://localhost:3001/health', r => { console.log('Agent API is UP! status=' + r.statusCode); }).on('error', e => { console.log('WARNING: Agent API not responding:', e.message); });" 2>/dev/null || true

# Start auto-resolution cron
echo "Rector live. PID: $GATEWAY_PID"
# (polls every hour for expired predictions)
echo "=== Starting auto-resolution cron ==="
cd /app/agent && node dist/scripts/cron.js &
CRON_PID=$!
echo "Cron PID: $CRON_PID"
cd /

# Step 6: Diagnostic Bridge Test
echo "=== 🚨 LOUD DIAGNOSTIC CHECK 🚨 ==="
which node || echo "ERROR: node not found"
node -v || echo "ERROR: node -v failed"
which curl || echo "ERROR: curl not found"
echo "--- Testing Bridge Connectivity ---"
node -e "
  const http = require('http');
  const req = http.get('http://localhost:3001/health', res => {
    console.log('✅ BRIDGE SUCCESS: API responded with ' + res.statusCode);
    process.exit(0);
  });
  req.on('error', e => {
    console.log('❌ BRIDGE FAILURE: ' + e.message);
    process.exit(1);
  });
  setTimeout(() => { console.log('❌ BRIDGE TIMEOUT'); process.exit(1); }, 5000);
" || echo "Diagnostic test failed"

# Verify SOUL.md content
echo "=== ACTIVE SOUL.md DUMP ==="
cat /root/.openclaw/agents/main/agent/SOUL.md

# Step 6: Parse the JSONL log and dump ALL message content
echo "=== FULL GATEWAY LOG (parsed) ==="
node -e "
const fs = require('fs');
const files = fs.readdirSync('/tmp/openclaw/').filter(f => f.endsWith('.log'));
files.forEach(f => {
  const lines = fs.readFileSync('/tmp/openclaw/' + f, 'utf8').split('\n').filter(l => l.trim());
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      // Extract the actual message from numbered keys
      const msgs = [];
      for (let i = 0; i < 10; i++) {
        if (j[String(i)] !== undefined) msgs.push(String(j[String(i)]).trim());
      }
      const msg = msgs.filter(m => m).join(' | ');
      if (msg) console.log('[' + (j._meta?.logLevelName || '?') + '] ' + msg);
    } catch(e) {}
  });
});
" 2>&1 | tail -100

# Step 7: Monitor log for new entries every 30s  
while true; do
  sleep 30
  LOGFILE=$(ls -t /tmp/openclaw/openclaw-*.log 2>/dev/null | head -1)
  if [ -n "$LOGFILE" ]; then
    echo "=== LOG $(date) ==="
    node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('$LOGFILE', 'utf8').split('\n').filter(l => l.trim());
    // Show last 30 entries
    lines.slice(-30).forEach(l => {
      try {
        const j = JSON.parse(l);
        const msgs = [];
        for (let i = 0; i < 10; i++) {
          if (j[String(i)] !== undefined) msgs.push(String(j[String(i)]).substring(0, 500));
        }
        const msg = msgs.filter(m => m.trim()).join(' | ');
        if (msg) console.log('[' + (j._meta?.logLevelName || '?') + '] ' + msg);
      } catch(e) {}
    });
    " 2>&1
  fi
done &

wait $GATEWAY_PID
