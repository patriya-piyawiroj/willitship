FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start Next.js dev server (for development)
# For production, use: npm run build && npm start
CMD ["npm", "run", "dev"]

