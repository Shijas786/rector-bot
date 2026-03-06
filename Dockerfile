FROM node:22-alpine

WORKDIR /app

# Install git and C++ build tools required by native node modules like node-llama-cpp
RUN apk add --no-cache git python3 make g++ build-base

# Create a package.json and set flags to skip the unnecessary C++ Local-LLM compilation for Alpine
RUN npm init -y
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD=true
RUN npm install openclaw@latest
RUN npm install @bnb-chain/mcp@latest

COPY rector/ /app/rector/

EXPOSE 18789

# Switch path so openclaw.json is naturally detected
WORKDIR /app/rector

# Start the openclaw gateway using the local rector/ config folder
CMD ["npx", "openclaw", "gateway", "--port", "18789", "--allow-unconfigured"]
