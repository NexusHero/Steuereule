# Roadmap Steuereule 1.0

**Status:** Accepted (grilling session 2026-10-23) · **Decider:** NexusHero (stakeholder), grilled and cross-checked by Musti (lead role)

**Where the tickets live:** `.scratch/roadmap-1.0/issues/` (one file per ticket, blocking edges in tracer format). **Where the ADRs live:** `docs/adr/0035` and `0036` (engineering) and `finanzo-funke-design-system/project/research/adr/051` (product) — promoted after Musti's re-review (GO); the review report is at `.scratch/roadmap-1.0/adr-review-findings.md`.

## Goal

Steuereule becomes a **real product** that competes with Taxfix, WISO Steuer, wundertax and Steuerbot
(D1). The functional goal is the **complete 1.0 vision** from the product ADRs
001–042: employees in 5 life situations, Grenzgänger-CH (cross-border commuters to Switzerland), pensioners, capital, rental income (simple),
document inbox, Günstigerprüfung (most-favorable-treatment check), Bescheid check (Bescheid: tax assessment notice), deadline warning mode, owl AI — not a
single slice, but a staged roadmap (D2).

The quality bar (D3): **professional engineering instead of AI bloat.**

1. **No custom build where the framework is the answer** — NestJS standard and established
   libraries first; every deviation needs an ADR.
2. **Slices are one product, not a collection** — one navigation, one session/data flow,
   one shared domain core.
3. **Comments explain why, never what** — file-header comments are trimmed when touched.
4. Measurable enforcement through the **Definition of Done** (see below).

## Three tracks

| Track | Content | Start |
|---|---|---|
| **Code** | Phases 0–3 below | immediately |
| **Infra** | #292: k3s/Hetzner + managed EU Postgres + Redis, CI/CD, observability, backups/DR, arm64 verification (D7) | parallel to phase 0 |
| **ELSTER (external)** | Apply for the vendor certificate — long lead time at the authorities (D8). **Since [ADR-0050](adr/0050-paper-filing-instead-of-elster-in-1-0.md) no longer a 1.0 criterion**: 1.0 files on paper, ELSTER follows as 1.x | ongoing, owner: NexusHero |

## Phases

### Phase 0 — Foundation (code track, strictly sequenced internally: 0.1 → 0.5)

| # | Ticket | Content |
|---|---|---|
| 0.1 | Hygiene | One lockfile (pnpm; `package-lock.json` removed), `.gitignore` complete (`.DS_Store`), gates green, PR checklist (DoD) in the template |
| 0.2 | Framework replacement | Fixed list: `@nestjs/throttler` replaces the three hand-rolled limiters + own `RateLimit` table · Fastify `trustProxy` replaces the `trusted-proxies.ts` resolver · the better-auth device plugin fixes its cookie itself, the `session-cookie.ts` reimplementation goes · review of further custom builds against the NestJS standard |
| 0.3 | Wiring | One navigation as *one* product, a shared session/data flow instead of per-screen silos, unified honest states |
| 0.4 | Domain core | Shared tax domain core: tax year/income types (ADR-006/-010/-030), deterministic calculation core (ADR-048: AI behind a port), interview engine skeleton (catalog, state machine ADR-018, ADR-035/036), document inbox slice (ADR-007/008) |
| 0.5 | Shell completion | REQ-007 (TOTP/passkey), REQ-008 (Apple wiring, flagged off), REQ-009 (Expo SecureStore half) — deliberately in the foundation (D9) |

Comment discipline applies **throughout, effective immediately** (boy scout: trim in every touched file,
no global comment sprint).

### Phase 1 — Two verticals in parallel (on the shared core, D5)

- **Employees:** interview in 5 life situations (ADR-031), LStB (Lohnsteuerbescheinigung, wage tax certificate) data, Sonderausgaben (special expenses) catalog,
  working-days assistant (M4), honest gates (M8), real cockpit data.
- **Grenzgänger-CH:** Lohnausweis (Swiss salary certificate) scan, Quellensteuer (Swiss withholding tax), PK, 3a, KK, allowances (ADR-029),
  CHF handling (ADR-036).
- **Shared:** plausibility check before filing (M2) as a core feature.
- Divergence countermeasure (ADR-0015 lesson): shared core review gate, review remains bottleneck planning.

### Phase 2 — Broadening

Year-round document inbox (M3, ADR-007/008) · Günstigerprüfung joint/separate (M1) ·
Bescheid check PDF + manual (M7) · pensioners (ADR-034), capital (ADR-032), rental income simple
(ADR-033) · deadline/late-filing surcharge warning mode (M6) · year carry-over (ADR-021),
retroactive years (ADR-022) · owl AI mode (ADR-037–041).

### Phase 3 — Go-live readiness 1.0

Ready-to-file package (PDF export, Bescheid preparation) · marketing website (M9, separate, ADR-044) ·
final DSGVO (GDPR) audit before the first real account · **#170: real Google credentials — real
OAuth handshake instead of placeholders** · REQ-010 closes with the #292 network property ·
pre-go-live load test · **form printout on official Vordruck templates (Vordruck: official tax form), paid per tax year
at printout** ([ADR-0050](adr/0050-paper-filing-instead-of-elster-in-1-0.md)) · legal pages reviewed by
a lawyer. ELSTER transmission is no longer a 1.0 criterion; it follows as 1.x when the certificate arrives.

## Definition of Done — four levels (D13–D20)

**Introduced by [ADR-0036](adr/0036-definition-of-done.md) (engineering). Enforcement:
PR checklist + review tick; exceptions visible + approved + justified + with a catch-up ticket.**

### 1. DoD ticket/slice
- TDD red→green; `typecheck` + `oxlint` green; review gate passed (draft PR → Musti).
- Acceptance test at the tier the REQ requires (Musti ruling PR #249).
- **No custom build** without an ADR; framework/library standard first.
- **Comments why-only**; touched files trimmed.
- **Security/performance posture line in the PR:** axis touched? Test/measurement linked —
  or a justified "n/a". The reviewer ticks off the line (D16).
- ADR added for an architecture decision; register maintained when a REQ is touched.

### 2. DoD REQ (register status "Done")
- Acceptance test exists at the required tier · green on `main` in CI ·
  register line cites the test location · review passed · ADR where needed (D14).
- No demo/sign-off per REQ — the 1.0 level does that.

### 3. DoD phase
- All tickets meet the ticket DoD; all blocking edges resolved.
- The phase is **demoable on the real environment** (from phase 1; foundation: gates green +
  local prod-shape stack, because the real environment is the parallel infra track).
- Roadmap status column updated; progress.db context set to `erledigt` (D17).

### 4. DoD 1.0 (product, "showable")
1. ADR-001–042 scope implemented — or individual items deliberately "gated" (only by NexusHero
   decision, visible in the register).
2. **One complete stakeholder run-through without manual intervention** — guest → registration →
   interview → calculation → ready to file → export — on the real URL. Performed by
   NexusHero **and** at least one external test user, recorded as evidence (D18).
3. Deployed on k3s/Hetzner with backups/DR; REQ-010 closed; shell REQs 007/008/009 green.
4. Final DSGVO audit before the first real account.
5. Pre-go-live load test passed.
6. No "AI smell": custom-build list from phase 0.2 replaced, comment discipline repo-wide.
7. ~~ELSTER transmission activated~~ → **paper route** ([ADR-0050](adr/0050-paper-filing-instead-of-elster-in-1-0.md)):
   form printout per BMF letter of 12.08.2022, unlock paid per tax year,
   legal pages reviewed by a lawyer. ELSTER follows as 1.x.

**Exceptions (D20):** Musti approves DoD deviations; visible in the PR **and** the register with a reason
and a catch-up ticket; NexusHero keeps a veto. There are no exceptions to the 1.0 core criteria (2 and 3) —
there, only a go-live postponement.

## Process (unchanged, D11)

Every phase runs through the existing crew flow: `to-spec` → `to-tickets` (tracer slices with
blocking edges; the phase tickets here are cut finely at phase start) → `implement`
(TDD) → `code-review`. Decisions D1–D21 are recorded as ADRs (ADR-0035/0036
in `docs/adr/`, ADR-051 in the research log), including amendments where existing ADRs are touched
(ADR-0015 lesson for D5, ADR-0026 (#292 gap, closed by the infra track),
product ADR-027(b) for REQ-007 — supersession on the 2FA point, enforcement in ticket 05).
The register gets new REQs for the product features as soon as the phases cut them.

## Time frame (D12)

No calendar dates. Relative phases with effort in crew slices; the only external pacemaker
is the ELSTER application (running from now on). If a target date emerges, the plan is readjusted backwards
from the date — explicitly as a decision, not gradually.

## Agent staffing (D21)

**4 pro roles at once** — more is not faster because of the blocking graph:

| Role (crew persona) | Task |
|---|---|
| Author track A (full-stack) | P0 chain (sequential) → P1 employees → P2/P3 shares |
| Author track B (full-stack) | from P1: Grenzgänger-CH in parallel |
| Reviewer (Musti) | **dedicated, never authors** — every draft PR re-read in a fresh context (ADR-0022) |
| Infra/DevOps (Salih) | Track 06 (#292) from start to finish |

NexusHero orchestrates and handles the ELSTER application (external, not an agent job).

Rationale: P0 is a strict chain (one active code thread; only infra in parallel) · P1 is the
peak with 2 verticals + infra + reviewer = 4 · review remains the bottleneck (ADR-0015: N authors,
1 reviewer ⇒ backlog with more authors) · three authors on the shared core = merge conflicts ·
no coordination seat (ADR-0016: tickets and ADRs are the coordination).

**Scaling exception:** In P2, 3 authors may run temporarily if pensioners/capital/rental income
are cut as real parallel sub-tracks — only as long as the review queue stays empty
(formula: authors ≤ review throughput − 1). All roles run on Pro; the reviewer needs
at least author quality, because he is the bottleneck.

## Status sync 2026-10-23 (origin/main 8c9a150)

The roadmap was revalidated against `origin/main` (71 commits of progress; details:
`.scratch/roadmap-1.0/gap-analyse-2026-10-23.md`). Decisions D1–D23 unchanged; three
state corrections:

1. **0.4 (domain core) rescoped:** The interview question graph already exists in
   `packages/core` (ADR-0031/0033, REQ-015 Done — minimal gate segment 1; segment 2/catalog
   in progress, #341). The foundation does not rebuild the engine but builds on it; its core deliverable
   is the rest (document slice ADR-007/008, deterministic calculation core, AI port).
2. **Infra track started:** #338 delivered liveness/readiness health endpoints for k3s/Hetzner.
   Track 06 slice 1 uses these endpoints for the readiness probe; sub-ticket 06.1 acknowledges
   #338 as a completed part.
3. **Veranlagungsartenvergleich (comparison of assessment types) exists** (ADR-0034, bounded comparison, explicitly *not* a
   Günstigerprüfung) — phase 1 builds on it; M1 remains phase 2.
4. **ADR numbers:** our engineering ADRs now carry **0035** (foundation consolidation)
   and **0036** (Definition of Done) — 0028/0029 were taken remotely.

## Risks (honest)

- **The foundation is large** (D9) → the internal order 0.1 → 0.5 is mandatory, the WIP limit applies.
- **Parallel verticals** (D5) → divergence risk at the core; countermeasure: shared
  core review gate; review capacity is the bottleneck (ADR-0015).
- **ELSTER certificate** → external timeline; since ADR-0050 no longer on the 1.0 path.
- **Vordruck templates** (ADR-0050) → to be obtained and updated per tax year; whether a filled-in
  portal PDF counts as an official Vordruck must be clarified before the first sale.
- **The 1.0 scope is very large** → if capacity breaks, pensioners/capital/rental income stay
  honestly "gated" — the decision stays with NexusHero, visible in the register.
- **DoD proliferation** → four levels carry administration; the REQ level is the semantic
  definition of the register status and not a second set of books (D13).

## Decision log

| # | Decision |
|---|---|
| D1 | Real product, competing with Taxfix/WISO/wundertax |
| D2 | Full 1.0 scope (ADR 001–042) as a staged roadmap |
| D3 | Quality bar: no custom builds, connected slices, why-only comments |
| D4 | Foundation consolidation first, with a fixed list |
| D5 | Employees and Grenzgänger-CH in parallel in two tracks |
| D6 | The foundation contains the shared tax domain core |
| D7 | Infrastructure (#292) as a third track from the foundation on |
| D8 | Apply for the ELSTER certificate immediately; 1.0 ships "ready to file" — **amended by ADR-0050**: 1.0 files on paper, ELSTER follows as 1.x |
| D9 | Shell REQs 007/008/009 in the foundation |
| D10 | Plan form: roadmap doc in the repo + GitHub tickets + progress.db |
| D11 | Crew process unchanged; the plan yields new ADRs |
| D12 | No fixed dates; the ELSTER application is the only external anchor |
| D13 | DoD on four levels (ticket, REQ, phase, 1.0) |
| D14 | REQ DoD = tier + artifact + traceability |
| D15 | Ticket DoD incl. a performance/security criterion per ticket |
| D16 | Perf/security criterion = mandatory posture line in the PR |
| D17 | Phase DoD = tickets done + demoable on the real environment + maintained status |
| D18 | 1.0 DoD = 6 criteria + stakeholder run-through (NexusHero + external, recorded) |
| D19 | DoD enforcement = PR checklist + review tick + ADR + docs/process |
| D20 | Exceptions: visible + approved (Musti) + justified + catch-up ticket |
| D21 | Agent staffing: 4 pro roles at once; P2 exception with review queue rule |
