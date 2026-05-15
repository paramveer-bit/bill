# Use Node.js LTS version
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci

RUN npx prisma generate

# Copy source code
COPY src ./src


# COPY prisma.config.ts ./


# Build the application
RUN npm run build

# Run tsc-alias to replace path aliases with relative paths and fix file extensions for ESM
# RUN npx tsc-alias -p tsconfig.json --extname .js

# Production stage
# FROM node:20-alpine AS production

# # Create non-root user for security
# RUN addgroup -g 1001 -S nodejs
# RUN adduser -S appuser -u 1001

# # Set working directory
# WORKDIR /app

# # Copy package files
# COPY package*.json ./

# # Install only production dependencies
# RUN npm ci --omit=dev && npm cache clean --force

# # Copy Prisma schema from builder stage
# COPY --from=builder /app/prisma ./prisma

# # Copy tsconfig.json from builder stage
# COPY --from=builder /app/tsconfig.json ./tsconfig.json

# # Copy the entire node_modules from builder (includes Prisma client)
# COPY --from=builder /app/node_modules ./node_modules

# # Copy built application from builder stage
# COPY --from=builder /app/dist ./dist

# # Change ownership to non-root user
# RUN chown -R appuser:nodejs /app
# USER appuser

# # Expose the port
# EXPOSE 8000

# Start the application
CMD ["node", "dist/index.js"]
