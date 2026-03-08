---
name: crypto-price
description: Fetch live crypto price from Binance API
command-dispatch: tool
command-tool: web_fetch
command-arg-mode: raw
---

Fetch the current price of a cryptocurrency from Binance.

Usage: /crypto-price BNBUSDT

The command fetches https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT
