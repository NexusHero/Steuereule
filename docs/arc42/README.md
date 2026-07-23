# SteuerEule — Architecture (arc42)

The living architecture document for the SteuerEule engineering build, kept as
docs-as-code alongside the [engineering ADR log](../adr/index.md). It is **as important as
the software**: a stale arc42 is treated the way we treat a failing test, and every
completed task that moves the architecture moves this document (text **and** diagrams) in
the same breath.

This is a **proportionate** arc42 — it covers the views the system actually needs today,
done well and extensible later, rather than a hollow 12-section skeleton. Sections are
added when a change first touches them; the [full arc42 template](../../Documentation/arc42doc/arc42-template.html)
remains the reference for the sections not yet populated.

Decisions live in the ADRs (this document **shows the structure**; the ADRs **justify
it** and are the source of record). Product/design decisions are cross-referenced into the
[product ADR log](../../finanzo-funke-design-system/project/research/adr/) rather than
duplicated.

## Diagrams — how they're maintained

Every diagram is authored as **PlantUML** and the `.puml` **text source is committed**
(diffable, reviewable) next to the doc; the exported **`.svg` is committed too** and the
prose references the SVG so it renders everywhere. Regenerate after any edit:

```sh
# pure-Java layout (the sources set `!pragma layout smetana`), so no Graphviz/dot needed
java -jar plantuml.jar -tsvg docs/arc42/*.puml
```

| View | Source | Rendered |
|------|--------|----------|
| §5 Building block view | [`building-block-view.puml`](./building-block-view.puml) | [`building-block-view.svg`](./building-block-view.svg) |
| §5 Data model (data view) | [`data-model.puml`](./data-model.puml) | [`data-model.svg`](./data-model.svg) |

---

## 5. Building block view

Level-1 whitebox of the running system: the two apps, the shared monorepo packages, the
API's internal modules, and the EU Postgres database. Green blocks were added by
**REQ-001, the Cockpit vertical** (`steuereule#91` backend / `#93` frontend).

![Building block view](./building-block-view.svg)

**Frontend — `apps/mobile-web`** (Expo / React-Native-Web). Screen-by-screen takeover
(ADR-0005, walking skeleton). `CockpitScreen` is the new home screen after Onboarding: the
hero refund-estimate card plus honest loading/empty/error states. It reads through the
generated `@steuereule/api-client` hook and formats the range with `@steuereule/core`.

**Shared packages.**
- `@steuereule/core` — the **deterministic domain**: the single home of the shape
  validators (`isValidSteuerId` / `isValidSteuernummer`) and the Cockpit range rule
  (`cockpitRange`). Imported by **both** frontend and API; there is no second copy of these
  rules (the determinism boundary, ADR-014/048).
- `@steuereule/api-client` — the orval-generated typed client + TanStack Query hooks,
  generated from `apps/api/openapi.json` (ADR-0001); REQ-001 added the Cockpit endpoint's
  generated hook and schemas.
- `@steuereule/ui` / `@steuereule/tokens` — the Funke design system and its design tokens.

**Backend — `apps/api`** (NestJS on Fastify).
- `UserContextGuard` — the **one** place a request's `userId` is established (ADR-0007,
  refined by ADR-0012): a verified session or an HMAC-signed guest cookie, never a
  client-supplied identity. Every authenticated module scopes through it.
- `ProfileModule` — `GET`/`PUT /v1/profile`.
- **`CockpitModule` (new)** — `GET /v1/steuerjahre/{jahr}/cockpit`. Controller (guarded,
  `jahr` bounds-validated) → `CockpitService` → `TaxYearRepository` seam. The service reads
  the raw `TaxYear` inputs and computes the estimate range via `@steuereule/core`'s
  `cockpitRange()` — **the range is never recomputed locally or persisted**.
- `AuditModule` — the append-only `TaxDataAccessLog` (DSGVO Art. 30; the audited surface is
  identifier-class access, not read-of-own-estimate — see §Data model).
- `PrismaModule` — the shared, field-encryption-extended Prisma client (ADR-0008).

**Persistence — Postgres (EU)**, expand-only versioned migrations (ADR-047). Three
independently `userId`-scoped tables (see the data model).

### REQ-001 introduced no new architectural *decision*

The Cockpit vertical is a straight application of already-adopted patterns (the guarded
controller → service → repository-seam shape, the determinism boundary, the
DTO-mirrors-the-frozen-contract discipline, expand-only migrations). It adds **building
blocks** — a module, a screen, a generated hook, a persisted entity — but **no new ADR-level
decision, dependency, or cross-cutting concern**. This document is updated because the
building-block and data views changed; the ADR log is not, because no decision changed.

---

## 5.1 Data model (data view)

The persisted schema (`apps/api/prisma/schema.prisma`). `TaxYear` (green) was added by
REQ-001.

![Data model](./data-model.svg)

- **`userId` is a logical scoping key, not a DB foreign key** (ADR-0007). There is no
  `User` table — identity is the guest-/verified-session seam the `UserContextGuard` owns.
  Every row is read scoped to a single `userId`; there are no cross-user joins.
- **`Profile`** — plain onboarding facts; `steuerId` / `steuernummer` are **field-encrypted
  at rest** (ADR-0008, AES-256-GCM, per-write nonce, `mode=strict`).
- **`TaxDataAccessLog`** — append-only who/what/when trail, no value column (ADR-0008 /
  REQ-004).
- **`TaxYear`** — **raw inputs only** (`baseEstimate` / `openItems` / `openConflicts`),
  unique per `(userId, steuerjahr)`. The refund-estimate range is **never persisted** —
  recomputed per read via `cockpitRange()`, so there is no second place to drift.
  **No `@encrypted` field**: ruled out of ADR-0008 scope in review — it holds no tax
  identifier, only a rounded estimate and two counts. Revisit if assessed amounts or income
  figures ever land on this entity.
