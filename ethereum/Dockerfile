FROM node:20-slim

WORKDIR /app

# Install Python and curl for healthcheck
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY ethereum/package.json ./
COPY ethereum/package-lock.json* ./

# Install Node.js dependencies (for Hardhat compilation)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy Hardhat config and startup script
COPY ethereum/hardhat.config.js ./
COPY ethereum/start-node.sh ./
RUN chmod +x start-node.sh

# Copy contracts
COPY smart-contract/contracts ./contracts

# Compile contracts during build to pre-download the Solidity compiler
RUN npx hardhat compile

# Create empty .env file (env vars are optional - Hardhat node creates accounts automatically)
RUN touch .env

# Expose Hardhat node port
EXPOSE 8545

# Start Hardhat node
CMD ["npm", "run", "node"]

