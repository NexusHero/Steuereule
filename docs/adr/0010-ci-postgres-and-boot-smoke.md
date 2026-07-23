# ADR-0010 — Postgres in CI: service-container for the test/smoke jobs, compose service for the local/e2e stack

**Status:** Accepted · 2026-07-23 · realises #66/#69, honours ADR-0004 (testing), ADR-0003 (seed),
ADR-0008 (encryption-at-rest), the "milestone yields a testable artifact + compliance tests run in CI
against a real service" retro rule.

## Context

Two DSGVO-critical guarantees — REQ-003 field-encryption at rest and REQ-004 append-only audit log —
are proven **only** by `apps/api/test/profile.integration.test.ts`, which reads raw ciphertext via
`prisma.$queryRaw` to bypass the `prisma-field-encryption` client extension. That test needs a real,
migrated Postgres and runs only behind `pnpm --filter @steuereule/api test:integration`
(`vitest.integration.config.ts`) — a command no pipeline calls today. CI's `test` job runs only the
no-DB `pnpm -r test`; none of the three compose files define a Postgres service (still the idle
`baseline` alpine container). So the compliance claim is asserted by a real test that never runs
anywhere repeatable, and "Done" per the requirements register is not met.

Separately (#69), no CI stage boots the **real** HTTP server — every test uses Fastify `.inject()`,
which never exercises the real adapter/plugin stack. That blind spot hid a missing `@fastify/static`
dependency (crashed `SwaggerModule.setup()` on real boot) and the CORS gap (#57) until a human hit
them by hand.

Two questions had to be settled: **(a)** how Postgres reaches the integration tests in CI, and
**(b)** how the compose stack becomes the "one-command local stack" the PO can bring up.

## Decision

**Separate the two concerns — they have different runtimes.**

1. **CI `test:integration` job → GitHub Actions `services:` container.** The integration tests run as
   a Node/Vitest process *on the runner*, not inside a container. The cheapest, most reliable way to
   give that process a database is a runner-local service container
   (`services: { postgres: { image: postgres:16, ports: [5432], health-cmd: pg_isready } }`), with
   `DATABASE_URL=postgres://…@localhost:5432/…`. The job then: install → `prisma generate` →
   **`prisma migrate deploy`** against the service → `pnpm --filter @steuereule/api test:integration`.
   This is a **new required job** (name: `integration`), CI-blocking exactly like the unit `test` job.
   Chosen over docker-compose-in-CI because there is no container to build for a process that already
   runs natively on the runner — compose-up would add an image build and orchestration for no gain.

2. **CI `smoke` job → same service-container + real boot over HTTP.** Reuse a Postgres service
   container, `migrate deploy`, then boot the **real compiled server** (see ADR-0010a note below on the
   loader), poll for listen, and `curl` a golden-path request: `GET /v1/profile` (returns a 200 default
   DTO for a fresh guest and *does* touch Postgres — proving adapter + plugins + DB wiring in one
   cheap request). Non-2xx / connection-refused fails the build in seconds. Runs after `build`, before
   any future acceptance/e2e tier (ADR-0004 cascade).

3. **`docker-compose.yml` gains a real `postgres` service → the PO's one-command local stack.** The
   base compose file adds `postgres:16` with a named volume and a seed/migrate path, so
   `docker compose up` gives a live database the local API + `test:integration` + `pnpm --filter
   @steuereule/api prisma db seed` (ADR-0003 synthetic fixture) run against. This is the "testable
   artifact" the milestone rule demands. The `ci`/`e2e` overlays layer env onto it. The idle
   `baseline` container is retired from the base file (its only job was to keep `validate-compose`
   honest; a real `postgres` service replaces it).

**Pinning & parity (12-Factor X):** the CI service container and the compose service use the **same
`postgres:16` family**, so dev/CI/prod-shaped parity holds — no silent drift between "passed in CI" and
"runs locally".

**No real PII (ADR-0004 §4.2):** the integration DB is seeded only with synthetic fixtures, identical
to `profile.integration.test.ts`'s existing constants.

### ADR-0010a — the smoke step's loader (tactical, recorded for traceability)

`node dist/main.js` **cannot boot today**: `@steuereule/core`'s `package.json` sets
`"main": "./src/index.ts"` (ships TS source, no build) with extensionless internal imports
(`from './format'`), so the compiled API's `import … from '@steuereule/core'` dies at runtime with
`ERR_MODULE_NOT_FOUND`. The smoke step therefore boots via **`node --import tsx dist/main.js`** — `tsx`
(already an API devDependency) bridges the TS-source + extensionless-import resolution while still
running the **compiled `dist/`** of the API (so a real API dist-wiring regression, the `@fastify/static`
class of bug, is still caught). This is the pragmatic bridge for *this* slice. The **proper** fix —
give `@steuereule/core` a real build (JS output + `exports` map) or bundle the API so `node dist/main.js`
runs loader-free — is a forward-looking monorepo packaging decision that shapes the eventual production
container; it is **escalated to the stakeholder** and tracked as a separate follow-up, not settled here.

## Consequences

- Two new CI jobs (`integration`, `smoke`) become required gates; a regression in encryption-at-rest,
  the audit log, or server boot now fails the build the same way a unit-test regression does. **The gate
  is only truly enforced once branch protection (#71) requires these checks — that is the human
  stakeholder's to set; CI defining the jobs does not by itself block a merge.**
- The compose stack is now a real, bring-up-able artifact (Postgres + seed), not a placeholder.
- The `@steuereule/core` packaging quirk is now load-bearing for production runtime, not just tests —
  it must be fixed before a loader-free production image ships (follow-up, stakeholder-owned choice).
- Slight CI time cost: two jobs spin a Postgres container + run migrations. Kept fast by (a) pinning a
  single small image, (b) `migrate deploy` (not `migrate dev`), (c) `GET /v1/profile` as the one smoke
  request rather than a full e2e run.

## Alternatives considered

- **docker-compose-up in CI for the integration tests** — rejected: adds an image build + orchestration
  around a process that runs natively on the runner; the service container is faster and simpler for the
  same parity. Compose stays the *local/e2e* stack, where a full multi-service bring-up is the point.
- **Testcontainers (programmatic Postgres from the test process)** — viable and keeps DB lifecycle in
  the suite, but adds a Docker-in-test dependency and startup cost per run; the GHA service container is
  the lighter idiom for a single Postgres. Revisit if the integration suite needs bespoke DB topologies.
- **`tsx src/main.ts` for smoke (skip the build)** — rejected: it would boot the *source*, not `dist/`,
  so a `dist`-packaging regression (the exact `@fastify/static` failure mode) could slip through.
- **Keep asserting compliance only in local `test:integration`** — rejected: that is precisely the
  "passed on someone's machine once" gap #66 exists to close.
