# How this team works — SteuerEule engineering charter

SteuerEule is built by a small, role-based crew that runs a disciplined, shift-left delivery process.
This page is the single front door to *how we work*: the team, the pipeline, the gates, the
ceremonies, and the standing conventions. Each section points to the detailed source of record — this
charter summarises and indexes; it does not replace the ADRs, the role definitions, or the pipeline
doc.

## The team

Six roles, each a defined persona with a model, tools, and boundaries (source of record:
[`.claude/agents/`](../../.claude/agents/)).

| Role | Persona | Owns |
|------|---------|------|
| Lead / Architect | **Musti** | Technical grilling, **local code review**, architecture & ADRs, the living arc42, the Clean-Code bar, **plus risk tiers, the WIP limit, capacity and findings→tickets** (ADR-0016) |
| Frontend dev | **Kaan** | UI slices (Expo/RN-Web, the Funke design system, i18n, honest states) |
| Backend dev | **Robin** | API / data / the deterministic core (NestJS, Fastify, Prisma, EU/DSGVO) |
| DevOps / Quality-Platform | **Salih** | The frictionless preview, CI gates + their **realism** (every escaped bug / stakeholder complaint → permanent check), the stakeholder↔pipeline ping-pong, test-to-requirement traceability |

Musti reviews and architects but leaves the feature implementation to the two developers (Kaan,
Robin). **ADR-0016 retired the Product Owner and Scrum Master seats**: requirements and acceptance
now sit with the **stakeholder**, working from the Requirements Register
(`docs/requirements/register.md`) and the product/design ADRs. Escalation for requirement questions:
**devs read the register → ask the stakeholder**; for architecture/future-shaping calls Musti **asks
the stakeholder** via the `ask-matt` flow and records the outcome as an ADR.

## The delivery pipeline — quality before the PR

Full flow with diagram: [`delivery-pipeline.md`](./delivery-pipeline.md). In short, the work happens
**in the open, on the draft pull request** (ADR-0017):

1. **Refinement** — Musti drafts the block (REQ, one Given–When–Then, ADR check, out-of-scope, which
   existing product claim this might make untrue, risk tier); the **stakeholder rules on it**. No dev
   starts without one.
2. Devs implement **tests-first** until their own gate is green.
3. **The dev opens a draft PR** — the workbench, deliberately public. CI starts here.
4. **Musti reviews on the draft and comments as Musti**, posting his record *even when he finds
   nothing*. Advances on **no unresolved findings**, not on "no comments". He runs **before** Salih —
   his review costs about a third of a real-stack run.
5. **Salih tests, risk-tiered** — not at all on T3, on T2 when a user can see a difference, in full on
   T1. On a pass he posts his record and **flips the PR to ready** — that flip is the signal that both
   gates are through.
6. The stakeholder reviews the **non-draft** queue and merges.

A PR reaching the stakeholder is already reviewed and tested — their pass is an *audit*, not a
discovery.

## The gates

- **Two green lights before the PR:** Musti's local review **and** Salih's local test. A dev opening a
  PR is promising both.
- **Depth follows a risk tier — T1 critical / T2 standard / T3 trivial.** Musti tags each slice at
  readiness (ADR-0016); the tier sets how deep the gates go, so an auth flow gets the full pass
  and a static splash screen doesn't (`delivery-pipeline.md` § Risk tiers). Honesty, tests-first, and
  vertical-never-mock hold at every tier.
- **WIP limit — at most two slices in the review+test queue.** Build is two-wide; review and test are
  single-lane. When the queue is full, a freed dev helps *land* what's queued rather than start a third
  branch. Landing finished work is throughput; a growing pile isn't.
- **CI must be the *real* gate.** Two green lights are only as strong as CI, so: the
  compliance-critical tests (encryption-at-rest, the audit log) **run in CI against a real service**,
  a **real boot/smoke** step proves the server actually starts, and **GitHub branch protection**
  enforces required checks + review (no merge on pending/red, no bypass). Until branch protection is
  on, an `APPROVE` is a personal promise, not an enforced invariant.
- **Every milestone yields a valid, testable artifact** the stakeholder can exercise (a one-command
  seeded stack / preview) — not green tests alone.
- **Every bug is fixed now, ticketed for the record — nothing parked for later:** a real defect is
  fixed the moment it's found (before the PR if a local gate caught it, on the PR if CI/review did); a
  trivial-but-real nit (a wrong comment, dead reference) is resolved *in the review loop*. Musti files
  a ticket for every finding as the **record** of the fix — opened *and closed* inside the slice, never
  a deferral. Only future **feature scope** is planned forward; a known bug never is.

## Ceremonies

- **Planning** — the stakeholder and Musti pick and refine the committed items; cross-track contracts
  are frozen so both devs can start in parallel.
- **Milestone acceptance** — when a milestone lands, the **stakeholder** inspects the *running product*
  on Salih's preview against the Requirements Register, and what they find becomes concrete tickets.
  With the PO seat retired (ADR-0016) this pass is the only thing standing between "tests are green"
  and "it does what we promised" — if it is skipped, nothing else catches requirement drift.
- **Retrospective** — at the end of each iteration/milestone, blameless feedback from everyone. Musti
  synthesises it, turns each improvement into an owned action item, **plays it back to the whole team**
  (each participant hears their commitment), and **drives it to done** — verifying on the next slices
  that the critique was actually applied, not just filed.

## Standing conventions

- **Vertical, never mock** (ADR-0003/0005) — a slice runs end-to-end on real seeded data; no mock data
  in shipped code; no real PII (synthetic fixtures only).
- **Commit hygiene** (`ultimate-dev-process` §5.2) — work ends committed and pushed to its own branch;
  never commit over another worker's in-flight tree.
- **Attribution** — commit messages and PR titles/bodies carry **no AI-assistant attribution**;
  everything is authored as **NexusHero <suhay.sevinc@gmail.com>**. (This applies only to commits/PRs;
  the rest of the repo, incl. this `.claude/`-adjacent tooling, is unrestricted.)
- **Language** — the development process is **English**; the product/app language is **German**
  (de base + en switchable, ADR-0006); tax terms stay German in both locales.
- **Reuse over reinvention** — reach for the existing component/util/pattern first; a new
  framework/major dependency is a forward-looking decision Musti escalates to the stakeholder, not a
  casual add.
- **Speaking code** — comments explain *why*, not *what*; a comment-dense diff is a smell.
- **Living architecture docs** — the arc42 is as important as the software; diagrams are **PlantUML**
  (text source committed) exported to **SVG** and referenced from the docs; Musti checks "is the arc42
  updated?" on every completed task.

## Sources of record

- Roles & personas — [`.claude/agents/`](../../.claude/agents/)
- Delivery flow — [`delivery-pipeline.md`](./delivery-pipeline.md)
- Engineering decisions — [`docs/adr/`](../adr/) (and the product/design ADRs referenced there)
- Requirements — [`docs/requirements/register.md`](../requirements/register.md)
- The governing development process — the `ultimate-dev-process` skill
