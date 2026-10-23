# ADR-0035 — Foundation-Konsolidierung: Framework-Standard statt Eigenbau, ein Produkt statt Slices

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** NexusHero (Stakeholder) · **Review:** Musti (Lead) — re-review GO (2026-10-23)
- **Introduced by:** roadmap grilling session 2026-10-23 (decisions D3, D4, D6, D9)
- **Builds on** [ADR-0009](0009-better-auth-as-auth-server.md) (better-auth is the auth server),
  [ADR-0011](0011-cors-credentialed-cross-origin.md), [ADR-0012](0012-session-guard-coexistence-and-guest-upgrade.md),
  [ADR-0023](0023-routing-in-the-web-app.md), [ADR-0024](0024-qr-device-authorization-endpoints.md),
  [ADR-0026](0026-local-production-shaped-compose-stack.md) (whose #292 gap the parallel infra
  track closes — see `docs/roadmap-1.0.md`), research ADR-046 (backend NestJS),
  ADR-048 (KI-Architektur), ADR-049 (Deployment k3s/Hetzner).
- **Context tags:** architecture, quality, foundation

## Context

The project carries a disciplined, heavily tested shell (REQ-001–014) that nevertheless shows
three growth defects, named by the stakeholder as "not good enough to show":

1. **Bespoke machinery where the framework already answers.** Verified instances:
   - `apps/api/src/device/session-cookie.ts` reimplements better-auth's signed-cookie wire
     format (HMAC transcription from `better-call` internals) instead of fixing the device
     plugin to call `setSessionCookie` itself.
   - Three hand-rolled DB-backed rate limiters (`device-code-rate-limit.ts`,
     `device-pending-rate-limit.ts`, `verify-password-rate-limit.ts`, shared
     `consumeDbRateLimit` + `RateLimit` table) where `@nestjs/throttler` is the standard.
   - `apps/api/src/config/trusted-proxies.ts` — a bespoke resolver subsystem because
     better-auth's IP parser and Fastify's `trustProxy` round differently; the file's own
     header documents the asymmetry at length instead of a single configuration source.
2. **Slices are not connected into one product:** screens run their own data/session silos;
   no coherent navigation; honest states re-implemented per screen.
3. **Comment volume:** file headers carry 20–40-line decision recaps whose length outweighs
   their signal; the discipline below is why-only going forward, with trimming on touch.

## Decision

A **foundation phase** precedes all new product work, in strict internal order, with a
**closed, enumerable list** — no open-ended "make it prettier" work:

1. **Hygiene:** single lockfile (pnpm), complete `.gitignore`, green gates.
2. **Framework replacement (fixed list):** `@nestjs/throttler` replaces the three limiters
   and the `RateLimit` table; Fastify `trustProxy` replaces the resolver, one configuration
   source consumed by both better-auth and the device endpoints; the better-auth device
   plugin sets its session cookie itself and `session-cookie.ts` is deleted; remaining
   bespoke helpers audited against NestJS standard with ADR-or-documented-keep per item.
3. **Integration:** one navigation, one session/data flow, shared honest-state pattern;
   screens cut to responsible sizes.
4. **Shared tax domain core** (research ADR-048's determinism boundary, ADR-006/-010/-030):
   Steuerjahr/Einkunftsarten model in `packages/core`, deterministic computation core with
   the KI behind a port, interview-engine skeleton (catalogue, ADR-018 state machine),
   Beleg-Posteingang seam (ADR-007/008). Nothing in the core depends on a concrete
   Einkunftsart.
5. **Mantle completion in the foundation:** REQ-007 (TOTP/passkey), REQ-008 (Apple wiring,
   flagged off), REQ-009 (Expo `SecureStore` half) — built on the consolidated auth stack,
   deliberately before product features. This supersedes product ADR-027(b)'s "keine 2FA in
   1.0" on exactly this point; the amendment is recorded in the research ADR log, and its
   enforcement site is ticket 05.

**Comment discipline, repo-wide from now on:** comments explain *why*, never *what*; file
headers trimmed on every touched file (boy-scout rule, no global comment sprint).

## Consequences

- Phase 0.2 touches security-critical paths (auth, cookies, rate limiting); the existing
  acceptance tests are the safety net and must stay green or be changed only with a
  documented reason.
- The domain core is the deepest seam of the whole roadmap: both product tracks (Angestellte,
  Grenzgänger-CH) plug into it, which is what makes parallel tracks viable without producing
  two apps (see `docs/roadmap-1.0.md`, decision D5).
- The foundation is large (hygiene → replacement → integration → core → mantle); WIP limit
  and the internal order are load-bearing. Overload risk was named and accepted by the
  stakeholder (decision D9).
- Enforcement: see ADR-0036 (Definition of Done) — "no bespoke machinery" and "why-only
  comments" are review judgements, not lint rules.

## Decision history

- 2026-10-23: Draft from the roadmap grilling session (decisions D3, D4, D6, D9).
- 2026-10-23: Rev 2 — Musti review findings B1 (ADR-027(b) amendment), B2 (link conventions),
  M6, M8, M9 addressed; re-review GO. Promoted to `docs/adr/`.
