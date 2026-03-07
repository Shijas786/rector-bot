FROM node:22-alpine

WORKDIR /app

# Install git, C++ build tools, and socat
RUN apk add --no-cache git python3 make g++ build-base socat

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

EXPOSE 18789

# Start script
WORKDIR /app/rector
CMD ["./start.sh"]
