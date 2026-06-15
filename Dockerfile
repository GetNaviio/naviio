# syntax=docker/dockerfile:1

# ─── Multi-stage build for Next.js (standalone) on ECS Fargate ─────────────────
# Produces a small, non-root runtime image. Build it on your own machine or CI
# (where Prisma can download its engines and reach npm), then push to ECR.

# 1) Dependencies
FROM node:22-slim AS deps
WORKDIR /app
# openssl is required by Prisma engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# 2) Build
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then build. NEXT_TELEMETRY_DISABLED keeps builds quiet.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# 3) Runtime — only the standalone server + static assets
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output: server.js + minimal node_modules, plus static + public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma needs its generated client + query engine at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

# Container-level healthcheck (ECS/ALB also probe /api/health over HTTP).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
