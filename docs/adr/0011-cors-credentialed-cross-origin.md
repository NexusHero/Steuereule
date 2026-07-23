# ADR-0011 — CORS: strict env-driven origin allowlist with credentialed cross-origin

**Status:** Accepted · 2026-07-23 · realises #57 (REQ-012 live vertical-join), makes concrete the
"strict CORS allowlist" hardening item already committed in ADR-0007, honours ADR-0007's cookie session
seam and ADR-0008/0003 ("vertical, never mock — no mock transport either").

## Context

The Expo web app and the NestJS+Fastify API run on **separate origins** in local dev and in the
deployed demo. `apps/api/src/main.ts` never calls `app.enableCors(...)`, so a real browser
`GET`/`PUT /v1/profile` fails the preflight/CORS check — invisible to unit/component tests, which use
MSW and `.inject()` and never cross a real network boundary. The guest session is an **httpOnly
cookie** (ADR-0007), so the browser must send **credentialed** cross-origin requests; browsers reject
`Access-Control-Allow-Credentials: true` paired with a wildcard `*` origin. Without CORS the Slice-1
onboarding vertical cannot be demonstrated live end-to-end.

## Decision

- **Enable CORS in `apps/api/src/main.ts`** via
  `app.enableCors({ origin, credentials: true, methods })`.
- **`credentials: true`** — required because the session travels in the httpOnly cookie (ADR-0007);
  the web client's fetch must set `credentials: 'include'` correspondingly.
- **`methods` is given explicitly** — `['GET', 'HEAD', 'POST', 'PUT']`, matching the REST surface the
  API actually serves (`GET`/`PUT /v1/profile`; the better-auth mount is GET/POST). `@fastify/cors`
  defaults to `GET,HEAD,POST` when `methods` is omitted, which silently excludes `PUT` from
  `Access-Control-Allow-Methods` and fails the browser preflight for a credentialed cross-origin `PUT`
  — this broke `PUT /v1/profile` (Onboarding save, the guest→account upgrade journey, the Profil
  screen) until caught by a live cross-origin re-test and fixed here. `PATCH`/`DELETE` are **not**
  granted until a slice introduces such an endpoint (least-privilege). There is a single
  allowed-methods list, not a second policy per route/mount.
- **Origin is a strict allowlist, never `*`.** `origin` is resolved from **config/env** (12-Factor
  III), following the existing `resolve*(env)` convention (`resolveGuestSessionSecret`,
  `resolveFieldEncryptionKey`) — a single `resolveCorsOrigins(env)` that parses a comma-separated
  `CORS_ALLOWED_ORIGINS` into an exact-match set. The response echoes **only the matched allow-listed
  origin** into `Access-Control-Allow-Origin` (never `*`, never a reflected arbitrary origin); an
  origin not on the list is not granted access. No hardcoded literal in `main.ts`.
- **Local default vs. deployed:** the local Expo web dev origin and the deployed web origin are supplied
  through `CORS_ALLOWED_ORIGINS` per environment (compose/`.env` for local, secrets for deploy). An
  empty/unset allowlist grants no cross-origin access (fail-closed), never a permissive fallback.
- **Interaction with the cookie's `SameSite`.** `UserContextGuard` currently sets the session cookie
  with `secure: NODE_ENV==='production'`. For a *cross-origin* credentialed flow in the deployed demo,
  the cookie must be `SameSite=None; Secure` to be sent cross-site; `SameSite=Lax`/`strict` will drop it
  cross-origin. This coupling is called out for Robin: the CORS allowlist and the cookie `SameSite`/
  `Secure` attributes are **one decision** — getting CORS headers right but leaving `SameSite=strict`
  still breaks the live credentialed call. (ADR-0007 named `SameSite=strict` for the *same-origin* web
  session; the cross-origin demo split forces `None`+`Secure` — record any change here against 0007.)

## Consequences

- The Slice-1 onboarding vertical is demonstrable live in a real browser, closing the gap between
  "unit-green" and "actually usable end-to-end."
- A disallowed origin is refused — credentials are only ever granted to known origins (security).
- The allowlist is environment configuration, so no code change is needed to add the deployed origin.
- A CORS misconfiguration is now covered by an acceptance test against the **running** server (allowed
  origin succeeds, disallowed origin refused) — not `.inject()`, which bypasses CORS entirely.

## Alternatives considered

- **`origin: '*'`** — rejected: incompatible with `credentials: true`, and leaks the API to any origin.
- **Reflect any `Origin` header** — rejected: that is `*` with extra steps; defeats the allowlist.
- **Hardcode the origins in `main.ts`** — rejected: violates 12-Factor config; the deployed origin
  differs from local and must not require a code change.
- **A `@nestjs/config` module** — deferred: the codebase's established idiom is small `resolve*(env)`
  functions; introducing a config framework for one variable is unwarranted scope now.
