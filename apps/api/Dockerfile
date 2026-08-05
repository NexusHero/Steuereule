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

# openssl MUST be installed BEFORE `pnpm install`/`prisma generate` below — this is the actual
# defect, not just a nice-to-have ordering (Musti's #274 review, re-opened by the coordinator
# once this fix's own CI run crashed the api container at boot): apps/api/package.json's own
# `postinstall` hook runs `prisma generate` as PART OF `pnpm install --frozen-lockfile`, and this
# repo also runs it explicitly again below. Prisma's query-engine generator probes the ACTUAL
# environment it's running in to pick a binary target under `"native"` (the default, and what
# this schema uses — no `binaryTargets` override). With openssl installed AFTER generate, as
# this file had it in its first version, generate ran in an environment with NO openssl at all,
# could not detect a version, and silently defaulted to `debian-openssl-1.1.x` — while the
# RUNTIME container (after that first version's now-later openssl install) correctly detects
# `debian-openssl-3.0.x`. Two wrong things happened to cancel out: no openssl meant a wrong
# guess at generate time, and that wrong guess happened to match a runtime that ALSO had no
# openssl to detect correctly (both defaulted to the same wrong value) — this file's own first
# version's "OpenSSL warning, never a real failure" was true right up until openssl was actually
# installed and the two sides stopped agreeing by accident. `PrismaClientInitializationError:
# ...could not locate the Query Engine for runtime "debian-openssl-3.0.x"...was generated for
# "debian-openssl-1.1.x"` is the exact, real crash this reordering fixes — confirmed via the
# real `docker compose ... up` in CI's `prod-deploy-smoke` job, not guessed. Adding
# `binaryTargets = ["native", "debian-openssl-3.0.x"]` to schema.prisma (Prisma's own suggested
# fix in that error message) was considered and rejected: it would cure THIS symptom while
# leaving the actual defect (generate and runtime seeing different environments) in place as a
# second, independently-drifting truth to keep in sync by hand — exactly the class of doubled
# maintenance this whole PR exists to remove elsewhere. Fixing the order fixes the cause once;
# `"native"` then resolves correctly on its own, on whatever platform actually builds this image
# (relevant to #274's own still-open arm64 question — Prisma ships distinct engine binaries per
# architecture too, so `"native"` only resolves correctly if generate sees the real target
# environment there as well, which this ordering fix now guarantees for any platform, not just
# amd64 — still unverified ON arm64 specifically, since building for it is blocked in this
# session; see README.md's own note).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Whole monorepo, not a pruned subset — `turbo prune` / a pnpm deploy manifest are real,
# separate image-size follow-up work, out of scope for "make it boot correctly, now".
COPY . .

RUN pnpm install --frozen-lockfile

# Explicit, mirroring CI's own `smoke`/`cross-origin-smoke` steps exactly (belt-and-
# suspenders alongside apps/api/package.json's own `postinstall` hook) — both now run AFTER
# openssl is installed above, so both see the real runtime environment.
RUN pnpm --filter @steuereule/api prisma:generate
RUN pnpm --filter @steuereule/api build

# REQ-011 (Musti's #274 review, F1) — `pdf-renderer.playwright.ts`'s own header comment states
# the requirement plainly: "the API's production image must bundle the Chromium binary", named
# there as a tracked follow-up rather than a blocker only because no production image existed
# yet to bundle it into. This is that image, so the follow-up is due now. Without this,
# `PlaywrightPdfRenderer.onModuleInit()` swallows the launch failure so boot survives, and
# `renderPdf()` retries lazily — the failure is POSTPONED to a real user's first export click
# against this exact image, not avoided. Verbatim the same install CI's own `smoke`/`integration`
# jobs already run. Kept as its OWN step, not combined with the openssl `apt-get` above (an
# earlier version of this file combined them into one `RUN`/one `apt-get`, per Musti's original
# review) — needs `node_modules` already installed (`pnpm --filter ... exec`), so it cannot run
# before `pnpm install`, and openssl now genuinely must.
# TEMPORARY ADR-0021 CONTROL PROOF (F7) -- restored in the very next commit:
# RUN pnpm --filter @steuereule/api exec playwright-core install chromium --with-deps

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /repo/apps/api

# Same bridge CI's own smoke job boots (ADR-0010a). docker-compose.prod.yml's one-shot
# `migrate` service overrides this CMD to run `prisma migrate deploy` instead — same
# image, two roles, no second Dockerfile to keep in sync.
CMD ["node", "--import", "tsx", "dist/main.js"]
