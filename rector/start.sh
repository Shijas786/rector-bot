#!/bin/sh
# Start the core gateway API in the background
npx openclaw gateway --port 18789 --allow-unconfigured &

# Wait for the gateway API to boot
sleep 5

# Connect the Telegram channel listener and keep the container alive
npx openclaw telegram
wait
