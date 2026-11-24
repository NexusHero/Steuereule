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
# Everything pnpm does for the production tree happens here; the final image carries neither pnpm nor npm.
FROM base AS prod
COPY --from=build /manifests ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# Scripts are off here and run on purpose below: apps/api's postinstall needs sources that are not copied yet.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@steuereule/api..."

# Only what the app reads at runtime. The backfills the migrate role runs are TypeScript and import from
# src/, so the sources go along (read by tsx, like packages/core).
COPY packages/core ./packages/core
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/assets ./apps/api/assets
COPY apps/api/src ./apps/api/src
COPY apps/api/scripts/migrate-deploy.mjs apps/api/scripts/backfill-profile-name-encryption.ts apps/api/scripts/backfill-identity.ts ./apps/api/scripts/
COPY --from=build /repo/apps/api/dist ./apps/api/dist

# Install scripts of the dependencies that need them (engine binaries), then both Prisma clients (main +
# keystore, generated into node_modules). Fails the build when the schema engine is missing, instead of the
# migrate job failing on a read-only filesystem later.
RUN pnpm rebuild @prisma/engines @prisma/client prisma esbuild \
  && pnpm --filter @steuereule/api prisma:generate \
  && test -n "$(find /repo/node_modules/.pnpm -name 'schema-engine-*' -print -quit)"

# better-auth and others name vitest and typescript as optional peers, and pnpm resolves those to the
# workspace's dev dependencies, so a `--prod` install still brings the test runner, its bundler and the
# compiler. Nothing imports them at runtime (the import check below proves the app loads without them).
RUN cd node_modules/.pnpm \
  && rm -rf vitest@* @vitest+* vite@* vite-node@* tinypool@* typescript@* @typescript+* esbuild@0.21.* @esbuild+*@0.21.*

# Static check that the production tree has everything the app imports (a devDependency used at runtime
# fails here, not at the first request). Imports only; nothing connects to a database.
RUN cd apps/api && node --import tsx --input-type=module -e "await import('@steuereule/core'); await import('@prisma-keystore/client'); await import('@fastify/cors'); await import('./dist/app.module.js'); await import('./src/auth/identity-backfill.prisma.js')"

FROM node:24-bookworm-slim AS runtime
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /repo
# Root-owned: `node` can read but not write the code.
COPY --from=prod /repo /repo

# openssl for the Prisma engines, Chromium with its system libraries for the PDF export (REQ-011), started
# with plain node. npm and corepack leave the image: nothing here installs packages, and their bundled
# dependencies were most of what the container scan reported.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && node apps/api/node_modules/playwright-core/cli.js install chromium --with-deps \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.cache /root/.npm

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /repo/apps/api
USER node
CMD ["node", "--import", "tsx", "dist/main.js"]
