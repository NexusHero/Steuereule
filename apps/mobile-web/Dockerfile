# Production image for @steuereule/mobile-web (#76) — builds the offline/static Expo web
# export and serves it. Reuses the exact recipe `e2e/harness/stack.mjs`'s BOOT mode and
# CI's `cross-origin-smoke` job already use for the SAME bundle (`expo export --platform
# web --clear`, then `e2e/cross-origin/static-server.mjs`) — this Dockerfile is a third
# caller of that one recipe, not a fourth, independently-drifting copy of it.
#
# BUILD CONTEXT IS THE REPO ROOT — @steuereule/mobile-web depends on
# @steuereule/{core,tokens,ui,api-client} (all workspace:*), so `pnpm install
# --frozen-lockfile` needs the whole monorepo present, same reasoning as apps/api/Dockerfile.
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# EXPO_PUBLIC_API_BASE_URL is baked into the JS bundle AT THIS EXPORT STEP — Expo inlines
# EXPO_PUBLIC_* env vars at build time, never re-read at runtime (App.tsx's own comment).
# Passed as a build ARG so docker-compose.prod.yml's single top-level `.env` file is the
# ONE place this value is ever set — never hand-copied into this file or the API's own
# CORS_ALLOWED_ORIGINS separately (that duplication is exactly the class of drift that
# left the stakeholder's own local run pointing the browser at one origin and the API
# trusting another).
ARG EXPO_PUBLIC_API_BASE_URL
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}
# Operator details for the Impressum, the privacy notice and the terms (§ 5 DDG, ADR-0050), inlined the same way
# (WEB-2). Without name, address and e-mail the Impressum says "noch nicht hinterlegt"; deploy.yml refuses to
# build without them, the local stack may leave them empty. Line breaks in the address as \n.
ARG EXPO_PUBLIC_BETREIBER_NAME=""
ARG EXPO_PUBLIC_BETREIBER_ANSCHRIFT=""
ARG EXPO_PUBLIC_BETREIBER_EMAIL=""
ARG EXPO_PUBLIC_BETREIBER_VERTRETEN=""
ARG EXPO_PUBLIC_BETREIBER_USTID=""
ENV EXPO_PUBLIC_BETREIBER_NAME=${EXPO_PUBLIC_BETREIBER_NAME} \
    EXPO_PUBLIC_BETREIBER_ANSCHRIFT=${EXPO_PUBLIC_BETREIBER_ANSCHRIFT} \
    EXPO_PUBLIC_BETREIBER_EMAIL=${EXPO_PUBLIC_BETREIBER_EMAIL} \
    EXPO_PUBLIC_BETREIBER_VERTRETEN=${EXPO_PUBLIC_BETREIBER_VERTRETEN} \
    EXPO_PUBLIC_BETREIBER_USTID=${EXPO_PUBLIC_BETREIBER_USTID}
# Without the API origin the bundle would call http://localhost:3000 and the server would send no CSP.
RUN test -n "$EXPO_PUBLIC_API_BASE_URL" || { echo "build arg EXPO_PUBLIC_API_BASE_URL is required" >&2; exit 1; }

# `--clear` is load-bearing here, not defensive (e2e/harness/README.md's own documented
# environment truth, and Kaan's #239 finding on the stakeholder's own report): Metro's
# bundler cache survives between `expo export` runs on the same filesystem, so a second
# export with a different EXPO_PUBLIC_API_BASE_URL and no `--clear` can silently ship the
# STALE baked-in origin — a failure mode that looks exactly like a CORS/network bug and
# is genuinely indistinguishable from one without reading this comment first. A fresh
# Docker build stage has no prior Metro cache to begin with, so `--clear` is redundant on
# the very first build of a given layer — but it is NOT redundant the moment anyone
# rebuilds this image with a different `EXPO_PUBLIC_API_BASE_URL` build arg while Docker's
# own layer cache still has an older `pnpm install` layer sitting underneath; passing it
# unconditionally is the only way this image can never reproduce that bug.
RUN pnpm --filter @steuereule/mobile-web exec expo export --platform web --clear

# Lean runtime stage — no node_modules, no monorepo, just the static export and the
# already-committed, dependency-free static server (stdlib-only: node:http/fs/path), so
# this container never carries a second, drifting web-server implementation (nginx.conf,
# a `serve`/`http-server` package) the e2e harness knows nothing about.
FROM node:24-bookworm-slim AS runtime
# The same API origin the bundle was built with, now for the Content-Security-Policy (connect-src) of
# the static server: one build arg feeds both, they cannot drift apart.
ARG EXPO_PUBLIC_API_BASE_URL
ENV API_ORIGIN=${EXPO_PUBLIC_API_BASE_URL}
# The static server refuses to start without a CSP under NODE_ENV=production (WEB-21).
ENV NODE_ENV=production
# The server is one stdlib-only file: npm and corepack are not needed, and their bundled dependencies were
# what the container scan reported for this image.
# Debian's security fixes first: the base image can lag a fix, and the container scan blocks on a HIGH as soon
# as its fix is published.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/mobile-web/dist ./dist
COPY --from=build --chown=node:node /repo/e2e/cross-origin/static-server.mjs ./static-server.mjs
USER node
EXPOSE 8080
# --host 0.0.0.0, not the script's own 127.0.0.1 default — this must accept connections
# from outside the container (Docker's own network namespace), not just from itself.
CMD ["node", "static-server.mjs", "--root", "dist", "--port", "8080", "--host", "0.0.0.0"]
