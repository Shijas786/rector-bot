FROM node:22-alpine

WORKDIR /app

# Install git required by MCP node modules
RUN apk add --no-cache git

# Create a package.json and install openclaw locally
RUN npm init -y
RUN npm install openclaw@latest
RUN npm install @bnb-chain/mcp@latest

COPY rector/ /app/rector/

EXPOSE 18789

# Switch path so openclaw.json is naturally detected
WORKDIR /app/rector

# Start the openclaw gateway using the local rector/ config folder
CMD ["npx", "openclaw", "gateway", "--port", "18789"]
