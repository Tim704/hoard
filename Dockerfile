# ─────────────────────────────────────────────────────────────────────────────
#  HOARD — multi-stage Dockerfile
#
#  Target platform: linux/arm64 (Raspberry Pi). The base image is a Debian
#  "bookworm-slim" Node 20 image; we install OpenSSL because Prisma's query
#  engine links against it at runtime. We deliberately do NOT use Next.js
#  standalone output — the runner copies the full node_modules + .next + prisma
#  so `prisma db push` and `next start` work the same as in local dev.
#
#  On a Pi these stages build and run natively as arm64; no emulation needed.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps — install node_modules (cached on package files) ───────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# OpenSSL is required by Prisma's engine; install it before `npm ci` so the
# postinstall `prisma generate` finds the libraries it expects.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy only what's needed to resolve dependencies. The prisma schema is copied
# because the `postinstall` hook runs `prisma generate`.
COPY package.json package-lock.json* prisma ./

# Prefer the reproducible lockfile install; fall back to a plain install if the
# lockfile is absent or out of sync.
RUN npm ci || npm install

# ── Stage 2: builder — generate the Prisma client and build Next ─────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

# Bring in the already-installed dependencies, then the full source tree.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Regenerate the Prisma client (arm64 engine via schema binaryTargets) and build.
RUN npx prisma generate && npm run build

# ── Stage 3: runner — minimal production image ───────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the build artifacts and everything `next start` / `prisma db push` need.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma

# Entrypoint syncs the schema (db push) then launches the server.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Strip any CR (in case the script was edited on Windows) so the /bin/sh shebang
# resolves, then make it executable.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
