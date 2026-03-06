FROM node:18-alpine

WORKDIR /app

# Install git required by MCP node modules
RUN apk add --no-cache git

# Create a package.json and install rector locally to avoid global binary path issues
RUN npm init -y
RUN npm install rector@latest
RUN npm install @bnb-chain/mcp@latest

COPY rector/ /app/rector/

EXPOSE 18789

# Start utilizing the local node_modules binary
CMD ["npx", "rector", "gateway", "--port", "18789"]
