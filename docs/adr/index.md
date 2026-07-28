# Engineering ADR log (arc42)

Architecture decisions for the *engineering* build, in lightweight [MADR](https://adr.github.io/madr/)
(Context → Decision → Consequences [→ Alternatives]). Numbering is 4-digit, sequential and immutable;
a decision that replaces another **supersedes** it (never rewrite history). Governed by
ultimate-dev-process §1.2.

The ADRs **justify** the architecture; the [living arc42 document](../arc42/README.md) **shows** it
(building-block and data views, PlantUML sources + exported SVGs). The two are kept in step.

## Two ADR logs — on purpose

- **This log — `docs/adr/NNNN`** (4-digit): engineering/architecture decisions (build tooling,
  data layer, testing, delivery method, infra).
- **Product/design log — `finanzo-funke-design-system/project/research/adr/NNN`** (3-digit): the
  SteuerEule product & design-language decisions (001–050), including the framework choices from the
  architecture grilling (ADR-043…050). This engineering log **cross-references** those rather than
  duplicating them.

| # | Title | Status |
|---|-------|--------|
| 0001 | Frontend data layer: TanStack Query + OpenAPI-generated typed client | Accepted |
| 0002 | i18n layer: i18next / react-i18next, German base locale | Accepted |
| 0003 | Seed/demo data: single synthetic fixture seeded at container start | Accepted |
| 0004 | Testing strategy & tooling (Vitest · jest-expo + RTL · Playwright · MSW) | Accepted |
| 0005 | UI takeover delivered as vertical slices, walking-skeleton first | Accepted |
| 0006 | German base + English as a switchable UI locale (refines 0002) | Accepted |
| 0007 | Authentication: Keycloak IdP + better-auth (OIDC RP), EU-resident | Superseded by 0009 |
| 0008 | Profile persistence: server-side, sensitive fields field-encrypted at rest | Accepted (refined 0009-era) |
| 0009 | better-auth as the auth server (Keycloak dropped); supersedes 0007 | Accepted |
| 0010 | Postgres in CI: service-container for test/smoke jobs, compose service for local/e2e stack | Accepted |
| 0011 | CORS: strict env-driven origin allowlist with credentialed cross-origin | Accepted |
| 0012 | better-auth mounting, guard guest-OR-session coexistence, atomic guest→account upgrade | Accepted |
| 0013 | DSGVO export (JSON + PDF) & account deletion: anonymise-and-retain audit, atomic teardown | Accepted |
| 0014 | Responsive breakpoint strategy (hybrid: tokens + structural hook + future media queries) | Accepted |
| 0015 | Crew reduced from four developers to two (Ogün and Enis retired) | Accepted |
| 0016 | Product Owner and Scrum Master retired; the crew is four roles | Accepted |

See also the [Tech Radar](./tech-radar.md).

## Known inconsistency (tracked, not ignored)

`eslint.config.js` references `ADR-0025` (NestJS) and `k8s/README.md` references `ADR-0056`
(Kubernetes) — 4-digit references inherited from the **myDevTime** lineage that have **no matching
file** in this log yet. Per §1.5 a docs-staleness gate will flag these once wired. Reconcile by either
importing the real decisions under their referenced numbers or correcting the references to the
product-log equivalents (ADR-046 NestJS, ADR-049 k3s/Hetzner). Filed as a follow-up.
