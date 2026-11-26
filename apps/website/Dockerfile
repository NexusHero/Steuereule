# Marketing site (SITE-1): `apps/website/build.ts` writes a self-contained static `dist/`, served by the same
# static server as the web app, so it sends the same security headers and CSP. Links into the app point at
# WEBSITE_APP_ORIGIN (https://www.<domain>); the site itself runs on the bare domain (infra/README.md).
FROM node:25-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @steuereule/website...
ARG WEBSITE_APP_ORIGIN
RUN test -n "$WEBSITE_APP_ORIGIN" || { echo "build arg WEBSITE_APP_ORIGIN is required" >&2; exit 1; }
RUN WEBSITE_APP_ORIGIN="$WEBSITE_APP_ORIGIN" pnpm --filter @steuereule/website build

FROM node:25-bookworm-slim AS runtime
# The static server refuses to start in production without an API origin, because the CSP is built from it.
ARG API_ORIGIN
ENV API_ORIGIN=${API_ORIGIN}
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/website/dist ./dist
COPY --from=build --chown=node:node /repo/e2e/cross-origin/static-server.mjs ./static-server.mjs
USER node
EXPOSE 8080
CMD ["node", "static-server.mjs", "--root", "dist", "--port", "8080", "--host", "0.0.0.0"]
