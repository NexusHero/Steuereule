# ADR-0026 — A local, production-shaped Docker Compose stack for the API and web bundle (#76)

**Status:** Accepted · 2026-08-05 · realises #76, the local-testing complement to #246, reuses
ADR-0010a's boot bridge, honours ADR-0003 (seed/synthetic data), ADR-0008/ADR-0012 (secret
resolution), ADR-0011 (CORS), ADR-0021 (controls proven by breaking them).

## Context

The stakeholder wrote his own Docker setup for the API (`:3000`) and web app (`:8080`) because none
existed — `docker-compose.yml` and its `ci`/`e2e` overlays boot only Postgres; there was no
Dockerfile anywhere in the repository for either app. His run showed all four auth-adjacent
surfaces broken at once: no Google button, "Erstmal als Gast umschauen" ending in "Das hat nicht
geklappt.", account creation failing, and no QR code — only a retry affordance.

Kaan's real-stack reproduction (the same harness this ADR's own compose overlay reuses) found all
four are one root cause: the browser genuinely could not reach the API. Every screen hit its own,
correctly-implemented error state. The likely mechanisms are exactly the two `e2e/harness/
README.md` already documents from unrelated prior incidents: `expo export` without `--clear`
silently baking a stale `EXPO_PUBLIC_API_BASE_URL` into the bundle on a second export, and/or
`CORS_ALLOWED_ORIGINS`/`WEB_APP_URL` not matching the origin the browser is actually on. Both are
instances of the same shape — two independently hand-maintained copies of the same fact, free to
drift.

Two related, harder questions are explicitly OUT of this decision's scope:

- **#246** — the real cloud deployment pipeline. Still start-gated on Musti's architecture call
  (mechanism, secrets, staging/prod topology) at the time this ADR was written; #246's own body
  named Fly.io, but the target platform is now confirmed as **k3s on Hetzner + managed EU
  Postgres** (the product ADR log's ADR-049, accepted 2026-07-22, confirmed by the stakeholder
  2026-08-05) — #246's Fly.io framing is stale. This ADR does not touch the real pipeline either
  way; it answers a narrower, already-unblocked question — "can the stakeholder run something
  production-shaped on his own machine today" — not "where does this run in the cloud". Nothing
  in this ADR's own compose stack assumes Fly.io (it is plain `docker-compose`, portable to any
  Docker host); it does not need updating for the platform correction.
- **#75** — `@steuereule/core`'s production packaging (a real compiled/bundled artifact with no
  TS-loader in the boot path). Still start-gated on a stakeholder+Musti architecture decision.

## Decision

**Reuse ADR-0010a's proven boot bridge for a real container, rather than wait for #75.**
`apps/api/Dockerfile` builds the compiled API (`tsc`) and boots it with the SAME
`node --import tsx dist/main.js` bridge CI's own `smoke`/`cross-origin-smoke` jobs already prove
works over real HTTP. This is explicitly NOT #75's eventual answer — the Dockerfile's own header
comment says so — but it is the only boot path this repository has ever proven correct, and the
stakeholder's problem (nothing runs at all) is more urgent than the packaging refinement #75
tracks. Once #75 lands, this Dockerfile's `RUN`/`CMD` lines are what change; nothing about the
compose wiring around it does.

**`apps/mobile-web/Dockerfile` reuses `e2e/cross-origin/static-server.mjs` verbatim** as its
runtime web server, rather than introducing an nginx config or a `serve`/`http-server` dependency
the e2e harness knows nothing about — one static-file-serving implementation, not two that could
drift (one for tests, one for "real" deployment).

**One `.env` file at the repo root is the single source of the two values that broke this: `API_ORIGIN` and `WEB_ORIGIN`.** `docker-compose.prod.yml` flows `API_ORIGIN` into both the API's
own `BETTER_AUTH_URL` and the web image's build-time `EXPO_PUBLIC_API_BASE_URL` (a Docker build
`arg`, since Expo inlines `EXPO_PUBLIC_*` at export time, never re-reads it at runtime), and flows
`WEB_ORIGIN` into both `CORS_ALLOWED_ORIGINS` and `WEB_APP_URL`. Concretely: changing `.env` and
rebuilding is now the ONLY way to change these origins — there is no second file where a stale
value can be left behind, which is precisely the drift Kaan's reproduction points at as the likely
cause of the stakeholder's report.

**`NODE_ENV=production` — the stack refuses to boot on a guessable default**, exactly as
`apps/api/src/{auth,prisma}/*.ts`'s own `resolve*(env)` functions already enforce for anything
calling itself production. `.env.example` supplies synthetic-but-explicit values for every one of
them (`GUEST_SESSION_SECRET`, `PRISMA_FIELD_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`,
`TRUSTED_PROXIES=none`) — a real ADR-0008/ADR-0012 boot guard is exercised by this stack, not
bypassed by leaving it in dev mode.

**A `migrate` one-shot service, gated on Postgres's healthcheck, gates the `api` service in turn**
(`depends_on: condition: service_completed_successfully`) — `docker compose up --build` alone
brings up a fully migrated, working stack; there is no longer a manual `pnpm --filter
@steuereule/api migrate:deploy` follow-up step to forget, extending ADR-0010's "one-command local
stack" promise from Postgres-only to the whole app.

**Google OAuth gets the SAME dev-only placeholder credentials `better-auth.ts` already ships**,
set explicitly in `.env.example` because `NODE_ENV=production` disables the automatic fallback
(`resolveGoogleClientId` only refuses to *invent* a value under production — it still accepts one
handed to it explicitly, at any `NODE_ENV`). This makes the button render and its plumbing
provable on this local stack; it is not a real Google OAuth handshake (#170, still open).

**Proof lives in CI, against the real compose stack, not against a hand-typed re-derivation of
it.** `ci.yml`'s new `prod-deploy-smoke` job runs `cp .env.example .env` (the identical file the
stakeholder copies locally — never a second, CI-only set of values) then `docker compose -f
docker-compose.yml -f docker-compose.prod.yml up -d --build`, then drives `e2e/prod-deploy/
run.mjs` — a real headless-Chromium pass through the stakeholder's own four flows (guest onboarding
through to Cockpit, registration, login, QR-code rendering) against the published `localhost:3000`/
`localhost:8080` ports. This is a genuinely different claim from `cross-origin-smoke`'s existing
coverage: that job boots the API/web bundle directly on the runner via hand-typed steps; this job
boots the actual Dockerfiles through the actual compose file the stakeholder runs. "Green" now
means the shipped artifact works, not that its ingredients do.

## Consequences

- A new required CI job (`prod-deploy-smoke`) adds real `docker build` time (two images, ~2-4 min
  cold) to the pipeline — accepted, since this is the only tier that proves the artifact a human
  can actually run, and the stakeholder's own report is the cost of not having it.
- `apps/api/Dockerfile` still boots via `tsx` — a known, named compromise (see Context), not
  hidden. `#75`'s eventual resolution is this Dockerfile's own explicit forward-reference.
- `apps/mobile-web/Dockerfile`'s runtime stage carries zero `node_modules` — only the exported
  static bundle and one dependency-free script — keeping the served image small and avoiding a
  second web-server config to keep in sync with the harness's own.
- The `.env`/`.env.example` convention (root-level, matching `apps/api/.env.example`'s existing
  shape) is now load-bearing for two containers' build AND runtime configuration at once, not just
  documentation — a change to `API_ORIGIN`/`WEB_ORIGIN` now requires a full `--build`, not just a
  restart, because `EXPO_PUBLIC_API_BASE_URL` is baked in at image-build time. This is stated
  explicitly in `.env.example`'s own header rather than left for someone to discover by a stale
  rebuild.

## Alternatives considered

- **Wait for #75/#246 before building anything.** Rejected — the stakeholder's own experience is
  that "wait for the architecture decision" produced a hand-rolled, broken setup in the meantime.
  A local, honestly-scoped stack that reuses today's only proven boot path is strictly better than
  no stack, and does not foreclose #75's eventual, cleaner answer.
- **A separate, CI-only set of env values instead of the real `.env.example`.** Rejected — that is
  exactly the "two independently-typed copies of the same fact" shape this ADR exists to close.
  Using the stakeholder's own file in CI is what makes "CI green" mean "the instructions in this
  repo work", not "some other configuration works".
- **nginx (or a `serve`/`http-server` package) for the web image.** Rejected — `e2e/cross-origin/
  static-server.mjs` already does exactly this, is already proven against this exact bundle shape
  in three CI jobs, and needs zero new dependencies or config files to keep in sync.
