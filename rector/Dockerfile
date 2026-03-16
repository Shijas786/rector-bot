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

# Start script
WORKDIR /app/rector
CMD ["./start.sh"]
