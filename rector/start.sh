#!/bin/sh

# Skip interactive onboarding (stateless Railway mode)
export OPENCLAW_SKIP_ONBOARD=true

# Add telegram channel non-interactively using Railway's env token
npx openclaw channels add \
  --channel telegram \
  --token $OPENCLAW_TELEGRAM_TOKEN

# Start gateway and latch process
npx openclaw gateway --port 18789
