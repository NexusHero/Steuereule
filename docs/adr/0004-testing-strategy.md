# ADR-0004 — Testing strategy & tooling

**Status:** Accepted · 2026-07-22

## Context

ultimate-dev-process §3 mandates the test pyramid, TDD/ATDD, ≥90% coverage on core logic, acceptance
tests against the **real deployed artifact** (§3.5), and zero-tolerance for flakiness (§3.6). The
stack spans a pure TS core, a NestJS API, an Expo/RNW app, and a marketing DOM site.

## Decision

| Layer | Tool | Notes |
|-------|------|-------|
| Pure logic (`packages/core`, API services) | **Vitest** | no mocks, exhaustive fixtures, no I/O |
| RN app components (Expo) | **jest-expo + @testing-library/react-native** | states: hover/press/focus/disabled/empty/loading/error |
| API mocking in component/integration tests | **MSW** | handlers pinned to the OpenAPI contract |
| Web E2E / acceptance | **Playwright** | golden path + states at **375 / 768 / 1280** (tech-direktion) |

- **Acceptance runs against the real seeded compose stack** (base + `e2e` overlay, ADR-0003) — the same
  image that ships; only genuinely external third parties are faked at the edge and pinned by a
  contract test.
- **Coverage ≥ 90% on core logic**, CI-blocking; achieved architecturally (pure, dependency-free
  logic), not by shallow tests.
- Deterministic by construction: **injectable clock**, **seeded per-test data**, **no `sleep`** (poll a
  condition). A flaky test is quarantined with a tracked issue, never re-run until green.
- Every `REQ-NNN` maps to ≥1 acceptance test in the traceability matrix (§3.5). Tests are written
  **red before** the implementation (ATDD outer ring around the TDD loop).

## Consequences

- The CI cascade extends `.github/workflows/ci.yml`:
  `validate-compose → lint + typecheck + unit + component → build image → compose-up(e2e) → smoke →
  acceptance/e2e`.
- RN components use Jest (jest-expo) rather than Vitest — RN transforms make jest-expo the reliable
  choice; Vitest stays for framework-agnostic pure logic.

## Alternatives considered

- **Vitest for RN components** — rejected: immature RN transform support; jest-expo is the proven path.
- **Cypress for E2E** — Playwright chosen for multi-viewport + multi-browser and speed.
- **Pact for contracts** — heavier; an OpenAPI-schema-validated MSW contract test covers our single
  first-party API for now (revisit if external contracts grow).
