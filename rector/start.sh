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
      "pathPrepend": ["/usr/local/bin", "/app/node_modules/.bin"]
    }
  },
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "commands": {
        "native": true,
        "nativeSkills": true
      }
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

# Failsafe: Ensure agent dependencies are present (Railway postinstall should handle this, but play safe)
if [ ! -d "/app/agent/node_modules" ]; then
    echo "Failsafe: Installing agent dependencies..."
    cd /app/agent && npm install && npx prisma generate
    cd /
fi

# Step 3: Doctor fix
npx openclaw doctor --fix 2>&1 || true

# Show what doctor changed
echo "=== DIFF: our config vs doctor output ==="
diff /root/.openclaw/openclaw.json.bak /root/.openclaw/openclaw.json 2>/dev/null || echo "No backup to diff"

echo "=== FINAL tools section ==="
node -e "const c=require('/root/.openclaw/openclaw.json'); console.log(JSON.stringify(c.tools, null, 2));"

# Step 4: Start gateway
npx openclaw gateway run --port 18790 &
GATEWAY_PID=$!
socat TCP-LISTEN:18789,fork,reuseaddr TCP:127.0.0.1:18790 &

echo "Waiting 20s for gateway..."
sleep 20

# Step 5: Pairing
npx openclaw pairing approve telegram CYXPFK84 2>/dev/null || true
echo "Rector live. PID: $GATEWAY_PID"

# Start auto-resolution cron (polls every hour for expired predictions)
echo "=== Starting auto-resolution cron ==="
cd /app/agent && npx tsx src/scripts/cron.ts &
CRON_PID=$!
echo "Cron PID: $CRON_PID"
cd /

# Query gateway for registered tools via its API
echo "=== QUERYING GATEWAY STATUS ==="
curl -s -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
  http://127.0.0.1:18790/__openclaw__/api/status 2>/dev/null | \
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
