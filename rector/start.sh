#!/bin/sh
set -e
# Wait for volume to finish mounting to avoid overwriting dynamically generated configs later
sleep 2

# Ensure config dir exists
mkdir -p /root/.openclaw
mkdir -p /home/node/.openclaw

# Force delete old config first
rm -f /root/.openclaw/openclaw.json
rm -f /home/node/.openclaw/openclaw.json

# Write openclaw config from env vars
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

# Write mcp config from env vars
cat > /root/.openclaw/mcp.json << EOF
{
  "servers": {
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

# Write OpenAI API key
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

# Confirm files exist
echo "=== openclaw.json ==="
cat /root/.openclaw/openclaw.json

echo "=== auth-profiles.json ==="
cat /root/.openclaw/agents/main/agent/auth-profiles.json

echo "API KEY SET: ${OPENAI_API_KEY:0:10}..."

# Copy config for node user as well, just in case
cp /root/.openclaw/openclaw.json /home/node/.openclaw/openclaw.json || true
cp /root/.openclaw/openclaw.json /app/rector/openclaw.json || true
cp /root/.openclaw/mcp.json /home/node/.openclaw/mcp.json || true
cp /root/.openclaw/mcp.json /app/rector/mcp.json || true

# Skip onboarding
export OPENCLAW_SKIP_ONBOARD=true

# Add telegram channel non-interactively
npx openclaw channels add \
  --channel telegram \
  --token "${TELEGRAM_BOT_TOKEN}" || true

# Start gateway
exec npx openclaw gateway --port 18789 --allow-unconfigured
