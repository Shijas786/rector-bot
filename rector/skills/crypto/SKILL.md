# Crypto Price Skill

When the user asks about any cryptocurrency price, prediction, or market data:

1. Use the fetch tool to call: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
   - Replace BTCUSDT with the relevant pair (BNBUSDT, ETHUSDT, etc.)
2. Parse and return the live price from the response
3. For predictions, combine the live price with your analysis

Always fetch live data before answering price questions. Never guess prices from training data.
