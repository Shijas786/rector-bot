#!/bin/sh
set -e

# Ensure config dir exists
mkdir -p /root/.openclaw
mkdir -p /home/node/.openclaw

# Write config from env vars
cat > /root/.openclaw/openclaw.json << EOF
{
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open"
    }
  },
  "gateway": {
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "mcpServers": {
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

# Copy config for node user as well, just in case
cp /root/.openclaw/openclaw.json /home/node/.openclaw/openclaw.json || true
cp /root/.openclaw/openclaw.json /app/rector/openclaw.json || true

# Skip onboarding
export OPENCLAW_SKIP_ONBOARD=true

# Add telegram channel non-interactively
npx openclaw channels add \
  --channel telegram \
  --token "${TELEGRAM_BOT_TOKEN}" || true

# Start gateway
exec npx openclaw gateway --port 18789
