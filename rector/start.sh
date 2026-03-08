#!/bin/sh

# Setup workspace
export WORKSPACE_DIR="/root/.openclaw/workspace"
mkdir -p "$WORKSPACE_DIR"

# Step 1: Seed workspace files
cp /app/rector/SOUL.md "$WORKSPACE_DIR/SOUL.md"

cat > "$WORKSPACE_DIR/AGENTS.md" << 'EOF'
# Rector Core Logic

When a user makes a prediction:
→ POST http://localhost:3001/predict with {telegramId, username, claimText}

When a user asks for token analysis:
→ GET http://localhost:3001/analyse/<SYMBOL>?telegramId=<ID>

For BSC on-chain operations (balance, transfer, tx lookup):
→ Use the bnbchain-mcp MCP tools (read the bnbchain-mcp-skill for details)

Refer to the rector-predictor skill and bnbchain-mcp-skill for exact usage.
EOF


cat > "$WORKSPACE_DIR/TOOLS.md" << 'EOF'
# Available Tools

You have the following tools available. USE THEM — do not give generic text responses.

## web_fetch (PRIMARY TOOL)
Fetch content from any URL. Use this for EVERYTHING — prices AND predictions.

### For Crypto Prices:
- `web_fetch` → `https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT`

### For Token Analysis:
- `web_fetch` → `http://localhost:3001/analyse/BNB?telegramId=<USER_ID>`

### For Predictions:
- `web_fetch` POST → `http://localhost:3001/predict`
- Body: `{"telegramId": "<ID>", "username": "<NAME>", "claimText": "<CLAIM>"}`

## CRITICAL RULES
- NEVER use exec. ALWAYS use web_fetch.
- When asked about crypto prices, use the Binance API via web_fetch.
- When asked for analysis, call http://localhost:3001/analyse/<SYMBOL>?telegramId=<ID>
- When a user makes a prediction, POST to http://localhost:3001/predict with the claim.
- NEVER say "I can't access real-time data". You CAN — use web_fetch.
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

# Copy local skills
mkdir -p "$WORKSPACE_DIR/skills"
cp -r /app/rector/skills/* "$WORKSPACE_DIR/skills/"

# Install official BNB Chain skill from GitHub
echo "=== Installing BNB Chain skill ==="
mkdir -p "$WORKSPACE_DIR/skills/bnbchain-mcp-skill"
curl -sf "https://raw.githubusercontent.com/bnb-chain/bnbchain-skills/main/skills/bnbchain-mcp-skill/SKILL.md" \
  -o "$WORKSPACE_DIR/skills/bnbchain-mcp-skill/SKILL.md" 2>/dev/null && \
  echo "BNB Chain skill installed" || echo "WARN: Failed to fetch BNB Chain skill"

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
