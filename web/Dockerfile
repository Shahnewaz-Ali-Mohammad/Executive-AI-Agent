# -----------------------------------------------------------------------------
# Production image for the Executive Agent web app.
#   docker compose --profile app up -d --build
# -----------------------------------------------------------------------------

# 1. Install dependencies (cached unless package*.json changes)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the standalone Next.js server (no secrets needed at build time)
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Small runtime image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Database migrations and the script that applies them on start-up.
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=app:app /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=build --chown=app:app /app/node_modules/postgres ./node_modules/postgres

RUN mkdir -p /app/storage && chown app:app /app/storage
USER app
EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
