# ADR-0003 — Seed/demo data: single synthetic fixture seeded at container start

**Status:** Accepted · 2026-07-22

## Context

We need demo/mock data to run and test the app **without hardcoding it in application code** (§2.3,
§2.5) and **without any real PII in non-production** (§4.2). The design system already models the
right shape: `demo-daten.js` (`window.FunkeDemo`) is one source per number with derived values
computed. In the real architecture (Expo → NestJS → Prisma/Postgres, ADR-044/046/047) that data
belongs in the database, not the frontend.

## Decision

- The app **never contains demo data**; it always reads the API.
- The database is populated by a **Prisma seed script run at container start** — a 12-Factor XII
  release-phase admin task, wired into `docker compose up` and the CI/E2E overlays.
- The seed reads **one synthetic fixture file** (the successor of `demo-daten.js`): a single source per
  number, with **derived values (deltas, sums, averages) computed in the seed**, never
  double-maintained. Personas are synthetic; **no real PII, ever, in non-production**.
- Component tests use **MSW** mocks pinned to the same OpenAPI contract (ADR-0004); the fixture and the
  mock trace to one contract so they cannot silently diverge.
- Production seeding is separate and disabled by default (this fixture is for dev/CI/E2E only).

## Consequences

- `docker compose up` yields a runnable, populated app — the "inject mock data at Docker start, not in
  code" requirement, satisfied at the data layer.
- The fixture is versioned as the single source of truth for demo numbers; changing a demo value is a
  fixture edit, not a code change.

## Alternatives considered

- **Hardcoded literals in components** — rejected: forbidden by §2.3/§2.5.
- **Frontend demo-mode reading a bundled JSON** — rejected: diverges from the real API architecture and
  breaks "acceptance tests against the real artifact" (§3.5).
- **Randomised in-code factories** — rejected: non-deterministic, fights §3.6 (deterministic, seeded
  data).
