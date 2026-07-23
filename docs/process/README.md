# How this team works — SteuerEule engineering charter

SteuerEule is built by a small, role-based crew that runs a disciplined, shift-left delivery process.
This page is the single front door to *how we work*: the team, the pipeline, the gates, the
ceremonies, and the standing conventions. Each section points to the detailed source of record — this
charter summarises and indexes; it does not replace the ADRs, the role definitions, or the pipeline
doc.

## The team

Eight roles, each a defined persona with a model, tools, and boundaries (source of record:
[`.claude/agents/`](../../.claude/agents/)).

| Role | Persona | Owns |
|------|---------|------|
| Scrum Master | **Suhay** | Backlog & readiness, ticket state, ceremonies, findings→tickets, capacity (with Musti), driving retro critique to *done* |
| Product Owner | **Matthias** | Requirements Register & acceptance criteria, milestone product-acceptance (the **User Report**), outward presentation |
| Lead / Architect | **Musti** | Technical grilling, **local code review**, architecture & ADRs, the living arc42, the Clean-Code bar |
| Frontend dev | **Kaan** | UI slices (Expo/RN-Web, the Funke design system, i18n, honest states) |
| Frontend dev | **Ogün** | UI slices — second frontend track; exceptionally strong TypeScript; asks his senior early |
| Backend dev | **Robin** | API / data / the deterministic core (NestJS, Fastify, Prisma, EU/DSGVO) |
| Backend dev (full-stack) | **Enis** | API / data — second backend track; senior (ex-Apple), can also take frontend slices; helps the mid-level devs |
| Tester & DevOps | **Salih** | Real-stack testing, the runnable artifact, CI/CD health, test-to-requirement traceability |

Suhay and Matthias consult, grill, and refine; they do not touch code. Musti reviews and architects
but leaves the feature implementation to the four developers (Kaan, Ogün, Robin, Enis). Escalation for
requirement questions:
**devs → Matthias → human**; for architecture/future-shaping calls Musti **asks the stakeholder** via
the `ask-matt` flow and records the outcome as an ADR.

## The delivery pipeline — quality before the PR

Full flow with diagram: [`delivery-pipeline.md`](./delivery-pipeline.md). In short, quality shifts
**left of the pull request**:

1. **Suhay** pulls a ready, grilled ticket; **Matthias** holds the requirements, **Musti** grills the
   technical design (and writes the ADR). Suhay + Musti split the work so the **four devs (Kaan, Ogün,
   Robin, Enis) run in parallel** across their tracks — no dev idle.
2. Devs implement **tests-first**, gate green.
3. **Musti reviews the diff locally**, line by line, off GitHub, and iterates with the dev.
4. **Salih tests locally** against the real seeded stack (boot proof + flows + acceptance tests).
5. **Only then does the dev open the PR** — a *release candidate*, carrying an **evidence block**
   (Musti's review summary + Salih's test report).
6. CI is green; **Musti lands a concise `APPROVE`** as the durable record.
7. **The stakeholder** does the final human pass on GitHub and merges.

A PR reaching the stakeholder is already reviewed and tested — their pass is an *audit*, not a
discovery.

## The gates

- **Two green lights before the PR:** Musti's local review **and** Salih's local test. A dev opening a
  PR is promising both.
- **CI must be the *real* gate.** Two green lights are only as strong as CI, so: the
  compliance-critical tests (encryption-at-rest, the audit log) **run in CI against a real service**,
  a **real boot/smoke** step proves the server actually starts, and **GitHub branch protection**
  enforces required checks + review (no merge on pending/red, no bypass). Until branch protection is
  on, an `APPROVE` is a personal promise, not an enforced invariant.
- **Every milestone yields a valid, testable artifact** the PO can exercise (a one-command seeded
  stack / preview) — not green tests alone.
- **Every bug is fixed now, ticketed for the record — nothing parked for later:** a real defect is
  fixed the moment it's found (before the PR if a local gate caught it, on the PR if CI/review did); a
  trivial-but-real nit (a wrong comment, dead reference) is resolved *in the review loop*. Suhay files
  a ticket for every finding as the **record** of the fix — opened *and closed* inside the slice, never
  a deferral. Only future **feature scope** is planned forward; a known bug never is.

## Ceremonies

- **Planning** — Suhay pulls & refines the committed items; cross-track contracts are frozen so both
  devs can start in parallel.
- **Milestone acceptance** — when a milestone lands, Suhay tells Matthias, who inspects the *running
  product* hard and writes an **intensive User Report** (product/user-acceptance, not code review);
  Matthias + Suhay grill it into concrete tickets.
- **Retrospective** — at the end of each iteration/milestone, blameless feedback from everyone. Suhay
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
  (text source committed) exported to **SVG** and referenced from the docs; Suhay checks "is the arc42
  updated?" on every completed task.

## Sources of record

- Roles & personas — [`.claude/agents/`](../../.claude/agents/)
- Delivery flow — [`delivery-pipeline.md`](./delivery-pipeline.md)
- Engineering decisions — [`docs/adr/`](../adr/) (and the product/design ADRs referenced there)
- Requirements — [`docs/requirements/register.md`](../requirements/register.md)
- The governing development process — the `ultimate-dev-process` skill
