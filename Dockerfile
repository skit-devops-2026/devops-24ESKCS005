# Multi-stage / lightweight production Node.js base
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Configure production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Install dependencies using package-lock.json for reproducible builds
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source files
COPY . .

# Set file ownership to non-root user
RUN chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose default application port
EXPOSE 5000

# Production start command
CMD ["npm", "start"]
