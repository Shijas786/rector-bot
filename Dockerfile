FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install git (required by some npm packages)
RUN apk add --no-cache git

# Install rector CLI globally
RUN npm install -g rector@latest

# Copy the rector configuration into the container
COPY rector/ /app/rector/

# We need to install the BNB Chain MCP tools that the gateway uses
RUN npx --yes @bnb-chain/mcp@latest --help || true

# Expose the gateway port (optional, as Railway handles routing)
EXPOSE 18789

# Start the Rector gateway via npx to prevent PATH resolution collisions
CMD ["npx", "--yes", "rector@latest", "gateway", "--port", "18789"]
