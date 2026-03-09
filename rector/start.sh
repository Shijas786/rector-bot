#!/bin/sh

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Step 1: Seed workspace files
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/* "$WORKSPACE_DIR/skills/"

# Clear poisoned AI session so it starts fresh
echo "=== Clearing AI session history ==="
rm -f /root/.openclaw/agents/main/sessions/sessions.json
echo "Session cleared - AI will start fresh"

# Force-write SOUL.md directly to the agent's runtime path
echo "=== Writing Bridge-Architecture SOUL.md ==="
mkdir -p /root/.openclaw/agents/main/agent
cat > /root/.openclaw/agents/main/agent/SOUL.md << ENDSOUL
# Rector: The AI-Agentic Oracle

## Identity
You are Rector, the premier AI-Agentic Oracle for the BNB Smart Chain. You transform human claims into verifiable on-chain truths.

## CRITICAL: How to Submit Predictions
NEVER use \`web_fetch\` to localhost. ALWAYS use the \`exec\` tool with \`node -e\`.

When a user makes a prediction, run this shell command:
\`\`\`bash
node -e 'fetch("http://localhost:3001/predict-get?telegramId=<ID>&username=<NAME>&claim=" + encodeURIComponent("<CLAIM>")).then(r => r.json()).then(j => console.log(JSON.stringify(j)))'
\`\`\`

## CRITICAL: How to Analyze Tokens
Run this shell command:
\`\`\`bash
node -e 'fetch("http://localhost:3001/analyse/<SYMBOL>?telegramId=<ID>").then(r => r.json()).then(j => console.log(JSON.stringify(j)))'
\`\`\`

## Personality
I am your AI-Agentic Oracle. Every claim you make is transformed into a verifiable on-chain truth via the Rector Protocol.

## Steps
1. Disambiguate the claim precisely (use technical symbols and dates).
2. Run the \`node -e\` command above via the \`exec\` tool.
3. Parse the result for \`txHash\`.
4. Reply: "✅ Prediction LIVE! TX: https://testnet.bscscan.com/tx/<txHash>"
ENDSOUL

echo "Bridge SOUL.md written to /root/.openclaw/agents/main/agent/SOUL.md"


# Install official BNB Chain skill from GitHub
echo "=== Installing BNB Chain skill ==="
mkdir -p "$WORKSPACE_DIR/skills/bnbchain-mcp-skill"
curl -sf "https://raw.githubusercontent.com/bnb-chain/bnbchain-skills/main/skills/bnbchain-mcp-skill/SKILL.md" \
  -o "$WORKSPACE_DIR/skills/bnbchain-mcp-skill/SKILL.md" 2>/dev/null && \
  echo "BNB Chain skill installed" || echo "WARN: Failed to fetch BNB Chain skill"

# Step 2: Write openclaw.json
mkdir -p /root/.openclaw
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
      "pathPrepend": ["/usr/local/bin", "/app/node_modules/.bin", "/app/agent/node_modules/.bin"]
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

# Fix permissions for doctor
chmod 700 /root/.openclaw

# Failsafe: Ensure agent dependencies and build are present
if [ ! -d "/app/agent/dist" ]; then
    echo "Failsafe: Building agent..."
    cd /app/agent && npm install && npx prisma generate && npm run build
    cd /
fi

# Step 3: Doctor fix
npx openclaw doctor --fix 2>&1 || true

# Show final config for debugging
echo "=== UPDATED CONFIG ==="
cat /root/.openclaw/openclaw.json

# Step 4: Start gateway
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

# Query gateway for registered tools via its API
echo "=== QUERYING GATEWAY STATUS ==="
curl -s -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
  http://127.0.0.1:18789/__openclaw__/api/status 2>/dev/null | \
  node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try{const j=JSON.parse(d); console.log(JSON.stringify(j,null,2));}
      catch(e){console.log('Raw:',d.substring(0,2000));}
    });" || echo "Gateway API not available"

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
