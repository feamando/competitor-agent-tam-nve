# Production-optimized Dockerfile for Competitor Research Agent
# Multi-stage build for smaller production images

# Stage 1: Dependencies installation
FROM node:18-alpine AS deps
LABEL stage=deps

# Install security updates and build dependencies
RUN apk add --no-cache libc6-compat openssl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (production only)
RUN npm ci --only=production --silent && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Build application
FROM node:18-alpine AS builder
LABEL stage=builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build application
RUN npm run build

# Stage 3: Production runtime
FROM node:18-alpine AS runner
LABEL maintainer="Competitor Research Agent Team"
LABEL version="1.0.0"

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Install security updates
RUN apk add --no-cache openssl curl && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy necessary files
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Create reports directory with proper permissions
RUN mkdir -p /app/reports && chown nextjs:nodejs /app/reports

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Memory optimization flags for task 1.1
ENV NODE_OPTIONS="--expose-gc --max-old-space-size=8192"

# Security: Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["node", "server.js"]

# Metadata
LABEL description="Production-ready Competitor Research Agent application"
LABEL environment="production"
LABEL security.scan="enabled" 