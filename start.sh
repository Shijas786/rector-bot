#!/bin/sh
npx openclaw gateway --port 18789 --allow-unconfigured &
sleep 5
npx openclaw channels login
npx openclaw telegram
wait
