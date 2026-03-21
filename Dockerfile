# =============================================================================
# Disumprevies — Multi-stage Dockerfile
#
# Stage base:   node:20-slim + openssl (libssl.so.3) + corepack/pnpm
# Stage deps:   Install all workspace dependencies
# Stage build:  Compile TypeScript and generate Prisma client
# Stage runner: Minimal production image (inherits base so openssl is present)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage base — shared foundation with openssl installed
# ---------------------------------------------------------------------------
FROM node:20-slim AS base

# Install openssl so libssl.so.3 is available for Prisma engine binaries.
# curl is needed by the HEALTHCHECK instruction below.
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Activate pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# ---------------------------------------------------------------------------
# Stage deps — install all dependencies (dev included for tsc + prisma)
# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/premium/package.json ./packages/premium/package.json

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage build — compile TypeScript and generate Prisma client
# openssl is inherited from base via deps, so the correct debian-openssl-3.0.x
# engine binary is generated here.
# ---------------------------------------------------------------------------
FROM deps AS build

COPY . .

# Generate Prisma client (writes engine binary to node_modules/.prisma/client/)
RUN pnpm prisma:generate

# Build core and premium packages
RUN pnpm build


# ---------------------------------------------------------------------------
# Stage runner — minimal production image
# Inherits from base (not node:20-slim) so openssl / libssl.so.3 is present
# ---------------------------------------------------------------------------
FROM base AS runner

WORKDIR /app

# Copy workspace manifests (needed by Node.js module resolution)
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json    ./packages/core/package.json
COPY packages/premium/package.json ./packages/premium/package.json

# Copy runtime node_modules (includes Prisma runtime client code)
COPY --from=deps /app/node_modules               ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/premium/node_modules ./packages/premium/node_modules

# Copy compiled TypeScript output
COPY --from=build /app/packages/core/dist    ./packages/core/dist
COPY --from=build /app/packages/premium/dist ./packages/premium/dist

# Copy Prisma schema (needed by prisma migrate deploy at startup)
COPY --from=build /app/packages/core/prisma ./packages/core/prisma

# Copy the generated Prisma engine binary (.prisma/client/) from build stage.
# This contains the debian-openssl-3.0.x libquery_engine binary that was
# generated during `prisma generate`. Without this copy the engine binary
# produced in the build stage is lost when we switch to the runner stage.
COPY --from=build /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma

# Copy locale files (loaded at runtime by the i18n module)
COPY locales ./locales

# Copy entrypoint script and make it executable
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# ---------------------------------------------------------------------------
# Security: run as non-root user
# ---------------------------------------------------------------------------
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home botuser \
 && mkdir -p /home/botuser/.npm \
 && chown -R botuser:nodejs /home/botuser \
 && chown -R botuser:nodejs /app
USER botuser

# ---------------------------------------------------------------------------
# Health check: verify the bot's HTTP health endpoint every 30 seconds.
# Requires 3 consecutive failures before the container is marked unhealthy.
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# ---------------------------------------------------------------------------
# Entrypoint: run pending DB migrations then start the bot
# ---------------------------------------------------------------------------
ENTRYPOINT ["sh", "entrypoint.sh"]
