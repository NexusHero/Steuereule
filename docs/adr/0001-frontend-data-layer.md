# ADR-0001 — Frontend data layer: TanStack Query + OpenAPI-generated typed client

**Status:** Accepted · 2026-07-22

## Context

The Expo app (ADR-044) and the marketing site read from the NestJS REST/OpenAPI API (ADR-046). We
need server-state management (caching, loading/error, refetch) and a typed HTTP client that cannot
drift from the API. Hand-written fetch + hand-maintained types duplicate the contract and rot (DRY,
§2.0). The app must never contain demo data (ADR-0003) — it always reads the API.

## Decision

- **TanStack Query (React Query)** owns server state on the client (queries/mutations, cache,
  loading/error, retries). No server data in a global store.
- The HTTP client and its types are **generated from the API's OpenAPI spec** (via `orval`, which can
  also emit typed TanStack Query hooks). The **OpenAPI spec is the single source of truth**; the
  client is regenerated in CI, so client and server types never drift.
- Numbers/currency are formatted through the shared de-DE format helpers (successor of
  `formatEuro`/`formatZahl`), not ad-hoc — one formatting source (design-system rule 10).

## Consequences

- The OpenAPI contract is load-bearing: MSW mocks (ADR-0004) are pinned to it; a contract test guards
  drift; regeneration runs in CI.
- Client-only/form state is out of scope here — a later slice adds React Hook Form + Zod for the
  Interview forms (Tech Radar: Assess).

## Alternatives considered

- **Hand-written fetch + manual types** — rejected: type drift, duplicated contract.
- **tRPC** — rejected: ADR-046 chose REST/OpenAPI (RN + external/auditable consumers); tRPC couples
  client and server build.
- **SWR** — viable but TanStack Query has the richer cache/mutation model we need for the app.
