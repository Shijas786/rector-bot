#!/bin/sh
set -e

# Setup OpenClaw environment
mkdir -p /root/.openclaw/skills
cp -r /app/rector/skills/* /root/.openclaw/skills/ || true

# Write minimal openclaw config from env
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

# Start openclaw gateway (Auto-detects Telegram from config)
npx openclaw gateway --port 18789 --allow-unconfigured
