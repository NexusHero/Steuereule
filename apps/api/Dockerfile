# Production image for @steuereule/api, two stages: `build` compiles with every dependency, `runtime`
# carries production dependencies only (ADR-0109). Build context is the repository root: this is a pnpm
# workspace and @steuereule/api depends on @steuereule/core (workspace:*).
#
# BOOT: `node --import tsx dist/main.js` is the only boot path proven over real HTTP (ADR-0010a, CI smoke).
# packages/core ships TypeScript source (#75, unresolved), so `tsx` is a production dependency of apps/api
# and the workspace layout (/repo/apps/api, /repo/packages/core, node_modules symlinks) is kept as is.
#
# The same image has a second role: docker-compose.prod.yml and the Cloud Run migrate job override CMD with
# `cd /repo/apps/api && node scripts/migrate-deploy.mjs` (prisma CLI + schema + migrations are in the image).

FROM node:24-bookworm-slim AS base
RUN corepack enable
# openssl must be installed BEFORE `prisma generate`: Prisma picks the query-engine binary target from the
# openssl it finds, and a generate without it picks debian-openssl-1.1.x while the runtime finds 3.0.x.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# -- build: all dependencies, compile ------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
# `e2e` is a workspace member; the frozen lockfile needs its manifest.
COPY e2e ./e2e
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @steuereule/api prisma:generate \
  && pnpm --filter @steuereule/api build
# The workspace manifests alone (same paths), for the production install below.
RUN mkdir /manifests \
  && find apps packages e2e -maxdepth 2 -name package.json -not -path '*/node_modules/*' -exec cp --parents {} /manifests \;

# -- runtime: production dependencies only -------------------------------------------------------
FROM base AS runtime
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=build /manifests ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# Scripts are off here and run on purpose below: apps/api's postinstall needs sources that are not copied yet.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@steuereule/api..."

# Only what the app reads at runtime. Everything is owned by root: `node` can read but not write the code.
COPY packages/core ./packages/core
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/assets ./apps/api/assets
COPY apps/api/scripts/migrate-deploy.mjs ./apps/api/scripts/migrate-deploy.mjs
COPY --from=build /repo/apps/api/dist ./apps/api/dist

# Install scripts of the dependencies that need them (engine binaries), then both Prisma clients (main +
# keystore, generated into node_modules). Fails the build when the schema engine is missing, instead of the
# migrate job failing on a read-only filesystem later.
RUN pnpm rebuild @prisma/engines @prisma/client prisma esbuild \
  && pnpm --filter @steuereule/api prisma:generate \
  && test -n "$(find /repo/node_modules/.pnpm -name 'schema-engine-*' -print -quit)"

# Chromium for the PDF export (REQ-011). Root-owned like the code.
RUN pnpm --filter @steuereule/api exec playwright-core install chromium --with-deps

# Static check that the production tree has everything the app imports (a devDependency used at runtime
# fails here, not at the first request). Imports only; nothing connects to a database.
RUN cd apps/api && node --import tsx --input-type=module -e "await import('@steuereule/core'); await import('@prisma-keystore/client'); await import('@fastify/cors'); await import('./dist/app.module.js')"

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /repo/apps/api
USER node
CMD ["node", "--import", "tsx", "dist/main.js"]
