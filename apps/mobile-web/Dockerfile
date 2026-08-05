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
WORKDIR /app
COPY --from=build /repo/apps/mobile-web/dist ./dist
COPY --from=build /repo/e2e/cross-origin/static-server.mjs ./static-server.mjs
EXPOSE 8080
# --host 0.0.0.0, not the script's own 127.0.0.1 default — this must accept connections
# from outside the container (Docker's own network namespace), not just from itself.
CMD ["node", "static-server.mjs", "--root", "dist", "--port", "8080", "--host", "0.0.0.0"]
