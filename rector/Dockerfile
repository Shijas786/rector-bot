FROM node:22-bookworm-slim

WORKDIR /app

# Install git, C++ build tools, socat, and curl
RUN apt-get update && apt-get install -y git python3 make g++ socat curl && rm -rf /var/lib/apt/lists/*

# Setup root workspace
COPY package*.json ./
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD=true
RUN npm install openclaw@latest @bnb-chain/mcp@latest

# Copy agent backend and rector config
COPY agent/ /app/agent/
COPY rector/ /app/rector/

# Install Agent dependencies (including MCP and Prisma)
WORKDIR /app/agent
RUN npm install --include=dev
RUN npx prisma generate
RUN npm run build

# Fix for hardcoded path in @bnb-chain/mcp dependency
RUN mkdir -p /home/runner/work/bnbchain-mcp/bnbchain-mcp/node_modules/@bnb-chain/reed-solomon/dist && \
    ln -s /app/agent/node_modules/@bnb-chain/reed-solomon/dist/sub-worker.js /home/runner/work/bnbchain-mcp/bnbchain-mcp/node_modules/@bnb-chain/reed-solomon/dist/sub-worker.js

# Start script
WORKDIR /app/rector
CMD ["./start.sh"]
