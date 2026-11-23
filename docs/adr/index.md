# Engineering ADR log (arc42)

Architecture decisions for the *engineering* build, in lightweight [MADR](https://adr.github.io/madr/)
(Context → Decision → Consequences [→ Alternatives]). Numbering is 4-digit, sequential and immutable;
a decision that replaces another **supersedes** it (never rewrite history). Governed by
ultimate-dev-process §1.2.

The ADRs **justify** the architecture; [`docs/architecture.md`](../architecture.md) **shows** it
(arc42: context, building blocks, runtime, deployment, concepts, risks). The toolchain and the
boot-ordering invariant are detailed in [`docs/arc42/README.md`](../arc42/README.md).

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
| 0034 | The Veranlagungsartenvergleich returns a bounded comparison, never a bare verdict — and it is not a Günstigerprüfung (#340 F3, #321) | Accepted |
| 0035 | Foundation consolidation: framework standard over bespoke machinery, one product over slices, shared tax domain core, mantle completion in the foundation | Accepted |
| 0036 | Definition of Done: four levels (ticket · REQ · phase · 1.0), posture line, exception process | Accepted |
| 0037 | Income-type / tax-year model in `packages/core` (ADR-006/010/030) | Accepted |
| 0038 | Calculation core with AI port (determinism boundary, ADR-014/048) | Accepted |
| 0039 | Tax-year state machine (ADR-018: follow-up question / handled externally) | Accepted |
| 0040 | Document inbox (ADR-007/008: assignment as a suggestion, conflict visible) | Accepted |
| 0041 | LStB / employees vertical (scan fallback form, catalog admission) | Accepted |
| 0042 | Grenzgänger CH vertical (document-type vocabulary, exchange-rate core, segment-ch) | Accepted |
| 0044 | Pensioner vertical (pension type, statutory tables, Anlage R folding) | Accepted |
| 0045 | Value-first funnel: a guest may pass the minimal gate, Steuer-ID becomes optional, upgrade carries interview answers along | Accepted |
| 0046 | Rental income vertical: multiple properties per Anlage V, linear AfA, sale/furnished gate | Draft |
| 0047 | Deadline / late-filing surcharge warning mode: filing-deadline rule set, 60-day banner, no late status | Draft |
| 0043 | Veranlagungsartenvergleich refinement: Soli/church tax folded in, only remaining uncertainty is the Progressionsvorbehalt | Accepted |
| 0048 | Capital vertical: securities-account classification, capital income form, § 32d Günstigerprüfung (bounded comparison) | Draft |
| 0049 | Year carry-over M1: source `uebernahme`, unconfirmed items count into the range, generic labeling layer | Draft |
| 0050 | 1.0 files on paper: form printout instead of ELSTER, paid per tax year at printout (Stripe), email via Brevo, legal pages | Accepted |
| 0051 | Owl AI mode & strict privacy boundary (ticket 10.9, product ADRs 037–042) | Accepted |
| 0052 | Agent access: the user's own AI assistant fills in the tax return (MCP, OAuth, collected confirmation) | Accepted |
| 0053 | Beta hosting on Google Cloud Run and Cloud SQL (changes product ADR-049 for the beta) | Accepted |
| 0054 | Zusammenveranlagung: one joint tax return, Person A also records for Person B | Accepted |
| 0055 | Zero-Downtime Database Migrations (Expand and Contract Pattern) | Accepted |
| 0056 | Asynchronous PDF generation & job decoupling (fault isolation) | Accepted |
| 0058 | LStB text fallback: allowlist, document check, never green | Accepted |
| 0059 | Separate keystore database for document keys (crypto-shredding down into the backups) | Accepted |
| 0060 | On-device OCR on the web, self-hosted, OCR values never green | Accepted |
| 0061 | Dictation stage 2: speech model from Hugging Face, pinned and verified (deviation from ADR-0060) | Accepted |
| 0062 | Household at account level: create spouse and children once, select per year | Accepted |
| 0063 | Church tax in the estimate: rate, cap, special Kirchgeld, Abgeltungsteuer | Accepted |
| 0064 | Owl chat: answer runs, detached from the connection, with resumption | Accepted |
| 0065 | Address search via our own server (deviation from #451 decisions 7 and 8) | Accepted |
| 0066 | The owl: one field catalog, one value check, honest preview | Accepted |
| 0067 | The owl: tax year as a project, multiple conversations, project notes, context with summary | Accepted |
| 0068 | The owl: skills and question rounds | Accepted |
| 0069 | The owl: advisor stance always, tax knowledge to look up, all tax topics | Accepted |
| 0070 | The owl: savings plan, outlook, Bescheid check and „Unsere Situation“ | Accepted |
| 0071 | The owl: tax years as projects in the sidebar, conversations answer concurrently | Accepted |
| 0072 | Anlage N-Gre: Pensionskasse by Obligatorium/Überobligatorium, NBUV 100 % at the employer, tax-free Krankentaggeld, annual average exchange rate | Accepted |
| 0073 | The owl: drafts for Person B in the Zusammenveranlagung | Accepted |
| 0074 | Reading documents: Swiss Lohnausweis and scanned Lohnsteuerbescheinigung | Accepted |
| 0075 | Swiss letters: Pensionskasse statement and the employer's premium confirmation | Accepted |
| 0076 | Further Werbungskosten, childcare and the employer's share of the premiums | Accepted |
| 0077 | Medical expenses (§ 33) and household-related expenses (§ 35a) switched on | Accepted |
| 0078 | Reading tradesman invoices (§ 35a Abs. 3 EStG) | Accepted |
| 0079 | Changeover year: German and Swiss wages in one year, two commutes | Accepted |
| 0080 | Adding up donation receipts, reading Swiss health-insurance statements | Accepted |
| 0081 | Advance tax payments in the estimate | Accepted |
| 0082 | The owl changes recorded values only on request | Accepted |
| 0083 | Lohnsteuerbescheinigung without readable social security | Accepted |
| 0084 | An empty answer from the model is retried and then named openly | Accepted |
| 0085 | Printout for 2024, overlong entries before payment | Accepted |
| 0086 | Child's health insurance without a chosen exchange rate, care period from the Bescheid | Accepted |
| 0087 | Escalation case: two Grenzgänger with a changeover year, three children, medical expenses | Accepted |
| 0088 | Recording Person B completely, Swiss Kinderzulage per child | Accepted |
| 0089 | The stream: one selection instead of yes/no pages, one page per topic | Accepted |
| 0090 | Findings from the real-case run through the stream (2024/2025) | Accepted |
| 0091 | The owl fills every field: personal data with consent | Accepted |
| 0092 | Document assignment: who does a document belong to? | Accepted |
| 0093 | Required fields and follow-up questions instead of interpretation | Accepted |
| 0094 | The estimate calculates like the Bescheid | Accepted |
| 0095 | Reading documents by position: reading order, 300 dpi, word boxes | Accepted |
| 0096 | Selectable model and thinking depth (Gründlich / Max) | Accepted |
| 0097 | Document lifecycle: every document says what became of it | Accepted |
| 0098 | Tax history: all years at a glance | Accepted |
| 0099 | History: hints, life events and groups | Accepted |
| 0100 | The owl: guard alongside the model, timings per round, form before the question | Accepted |
| 0101 | Self-employed: EÜR, bookkeeping, balance sheet, VAT and trade tax | Accepted |
| 0102 | Ports & Adapters: two architecture tests enforce the boundaries in `apps/api` and in the core | Accepted |

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
