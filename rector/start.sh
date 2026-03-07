#!/bin/sh
set -e
sleep 2

mkdir -p /root/.openclaw
mkdir -p /home/node/.openclaw

rm -f /root/.openclaw/openclaw.json
rm -f /home/node/.openclaw/openclaw.json

cat > /root/.openclaw/openclaw.json << EOF
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" }
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
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

mkdir -p /root/.openclaw/agents/main/agent
cat > /root/.openclaw/agents/main/agent/auth-profiles.json << EOF
{
  "default": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}"
    }
  }
}
EOF

cp /root/.openclaw/openclaw.json /home/node/.openclaw/openclaw.json || true
cp /root/.openclaw/openclaw.json /app/rector/openclaw.json || true

export OPENCLAW_SKIP_ONBOARD=true

# Install MCP plugins into OpenClaw natively
npx openclaw plugins install @bnb-chain/mcp
npx openclaw plugins install @snjyor/binance-mcp@latest

npx openclaw channels add \
  --channel telegram \
  --token "${TELEGRAM_BOT_TOKEN}" || true

# Start openclaw gateway
npx openclaw gateway --port 18789 --allow-unconfigured &
sleep 5
npx openclaw channels login
npx openclaw telegram
wait
