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
| 0017 | Draft-first PRs with a public review, mandatory refinement, risk-tiered testing | Accepted |
| 0018 | Suhay (Scrum Master) reinstated; backlog, refinement and readiness leave the lead | Accepted |
| 0019 | oxlint replaces ESLint/typescript-eslint as the static-lint gate | Accepted |
| 0020 | A draft PR opening triggers the review; nobody gates it | Accepted |
| 0021 | A control is proven by breaking it, not by watching it pass | Accepted |
| 0022 | A push to a PR with open findings triggers the re-read | Accepted |
| 0023 | Routing in the web app: `@react-navigation/native` with a `linking` config | Accepted |
| 0024 | QR device authorization: our `/v1/device/*` endpoints in front of better-auth's plugin | Accepted |
| 0025 | The Requirements Register's owner can write it; the evidence is checked by CI | Accepted |
| 0026 | A local, production-shaped Docker Compose stack for the API and web bundle (#76) | Accepted |
| 0027 | better-auth's session freshness gate is disabled (`session.freshAge: 0`) — exhaustive consumer list, accepted loss on `/unlink-account` | Accepted |
| 0028 | Check the effect, not the mechanism: the pre-Prisma environment snapshot, and the boot ordering invariant it rests on (#284) | Accepted |
| 0029 | Periodic cleanup runs as a piggybacked batch sweep, not a scheduler — settles the mechanism ADR-0024 left open (#294, #238) | Accepted |
| 0030 | System-initiated deletion: the first erasure path no user confirms — unverified accounts after 30 days (#294) | Accepted |
| 0031 | Nine questions, two segments: the interview stays three, the other six arrive as the catalog's first entry (#318, #11) | Accepted |
| 0032 | Nothing on screen promises what the slice does not deliver — settles D1, D3 and the Vormerken button as one rule (#11, #321) | Accepted |
| 0033 | The interview's question graph lives in `packages/core`, and the server validates against it (#318 task 0) | Accepted |

See also the [Tech Radar](./tech-radar.md).

## Closed inconsistencies (kept as record)

`k8s/README.md` used to carry a dangling reference to a 4-digit Kubernetes-decision number with no
matching file in this log — inherited from the **myDevTime** lineage. **Closed by deletion**: `k8s/`
was inherited scaffolding that nothing in this workspace, CI, or the compose stack referenced or ran,
removed in #260. There is nothing left in this log to reconcile against it. (This closes the dangling
reference only — it makes no claim about the deployment target itself; see the
[Tech Radar](./tech-radar.md).)

The companion `eslint.config.js` → `ADR-0025` (NestJS) dangling reference is **closed**: ADR-0019
deleted that file when oxlint replaced ESLint. **Note the number is now genuinely taken** — the
`ADR-0025` in this log is the Requirements Register decision above, unrelated to that inherited NestJS
reference. The two are only a numeric coincidence, recorded here so nobody reads this paragraph as a
description of the real 0025.
