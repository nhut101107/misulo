FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy app source code
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
