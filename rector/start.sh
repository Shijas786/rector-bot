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
  },
  "mcpServers": {
    "binance": {
      "command": "npx",
      "args": ["-y", "@snjyor/binance-mcp@latest"]
    },
    "bnbchain-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@bnb-chain/mcp@latest"
      ],
      "env": {
        "PRIVATE_KEY": "${PRIVATE_KEY}"
      }
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

npx openclaw channels add \
  --channel telegram \
  --token "${TELEGRAM_BOT_TOKEN}" || true

exec npx openclaw gateway --port 18789 --allow-unconfigured
