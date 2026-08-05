# Production image for @steuereule/api (#76 — "true single-command docker compose up",
# the stakeholder's own local reproduction that #76/#246 named but never built).
#
# BUILD CONTEXT IS THE REPO ROOT, not apps/api/ — this is a pnpm workspace and
# @steuereule/api depends on @steuereule/core (workspace:*), so `pnpm install
# --frozen-lockfile` needs the whole monorepo's manifests to resolve. docker-compose.prod.yml
# sets `build.context: .` accordingly; don't try to build this Dockerfile with
# `apps/api` as context, it will fail resolving the workspace dependency.
#
# BOOT MECHANISM — reused, not reinvented, and NOT a resolution of #75:
# `packages/core/package.json` ships TypeScript source directly (`main: ./src/index.ts`,
# no compiled JS, no `exports` map) — `node dist/main.js` alone dies with
# ERR_MODULE_NOT_FOUND trying to resolve it. ADR-0010a's own bridge (`node --import tsx
# dist/main.js`) is the ONLY boot path this repo has ever proven working over real HTTP —
# CI's `smoke` and `cross-origin-smoke` jobs already boot exactly this way. This image
# reuses that SAME proven bridge rather than inventing a second, unproven one for
# production specifically. It still boots the *compiled* `dist/` (a real `tsc` build,
# not raw `src/`), so a real dist-wiring regression is still caught — see ADR-0010a's own
# reasoning for why that distinction matters.
#
# This is deliberately NOT #75's eventual answer (a real compiled/bundled
# @steuereule/core with no TS-loader in the boot path — an architecture decision
# reserved for Musti + the stakeholder, ADR-0010a's own "escalated, not settled here").
# Read this Dockerfile as "the same smoke-tier bridge, now also serving a container",
# not as #75 resolved.
FROM node:24-bookworm-slim

RUN corepack enable

WORKDIR /repo

# Whole monorepo, not a pruned subset — `turbo prune` / a pnpm deploy manifest are real,
# separate image-size follow-up work, out of scope for "make it boot correctly, now".
COPY . .

RUN pnpm install --frozen-lockfile

# Explicit, mirroring CI's own `smoke`/`cross-origin-smoke` steps exactly (belt-and-
# suspenders alongside apps/api/package.json's own `postinstall` hook).
RUN pnpm --filter @steuereule/api prisma:generate
RUN pnpm --filter @steuereule/api build

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /repo/apps/api

# Same bridge CI's own smoke job boots (ADR-0010a). docker-compose.prod.yml's one-shot
# `migrate` service overrides this CMD to run `prisma migrate deploy` instead — same
# image, two roles, no second Dockerfile to keep in sync.
CMD ["node", "--import", "tsx", "dist/main.js"]
