# ADR-0105 — CI gate taxonomy, `category: gate` naming, and a transparency rollup

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** engineering.
- **Builds on** [ADR-0004](0004-testing-strategy.md) (unit/integration/acceptance tiers),
  [ADR-0010](0010-ci-postgres-and-boot-smoke.md) (CI Postgres + boot smoke),
  [ADR-0019](0019-oxlint-replaces-eslint.md), [ADR-0021](0021-controls-are-proven-by-breaking-them.md),
  [ADR-0025](0025-the-register-owner-can-write-the-register.md) (Requirements Register),
  [ADR-0036](0036-definition-of-done.md) (Definition of Done).
- **Context tags:** ci, process, transparency

## Context

The pipeline is rich — five PR workflows (`Quality`, `Build & E2E`, `Security`, `Load`) plus nightly AI
evals and law-watch, together ~20 checks covering lint, unit, real-Postgres integration, the BOLA/IDOR
pentest matrix, an OWASP ZAP DAST pentest, WCAG 2.1 AA accessibility, SBOM/container/IaC/secret/SAST scans,
a load test and SonarQube. But it was hard to *read*: the PR check list was an unsorted jumble of
differently-styled names, and several checks each bundled many invisible sub-gates (one "DevSecOps Static"
check was five tools; the ZAP DAST and the a11y gates were unnamed steps buried inside other jobs). A
reviewer could not answer "what does CI actually test, and what blocks a merge?" at a glance.

Two facts surfaced while mapping it, and are recorded because they matter more than the cosmetics:

1. **`main` configures no required status checks.** Branch protection enforces only "conversations resolved"
   and admin enforcement — so every gate is *advisory* and none blocks a merge today. The green pipeline is a
   convention, not an enforced invariant. Making the critical gates required is **#71**, still the
   stakeholder's to set.
2. The richest security signals (ZAP DAST, the BOLA/IDOR matrix, the a11y gates) were the least visible.

## Decision

1. **A category taxonomy.** Every check is named `category: gate`, with categories `static`, `correctness`,
   `security`, `supply-chain`, `e2e`, `performance`, `quality` (and `overview`). GitHub sorts the check list
   alphabetically, so the categories cluster on their own — no tooling needed.
2. **Split the bundled static-security job** (`security.yml`) into one check per tool — secret scan
   (Gitleaks), SAST (Semgrep), IaC (Trivy), Dockerfile lint (Hadolint), workflow lint (Actionlint) — so a
   failure names the tool instead of hiding in one bundle.
3. **An advisory `CI Overview` rollup** (`ci-overview.yml`, on `workflow_run` completed): once the four PR
   pipelines finish, it posts/updates one PR comment grouping every check by category with what each proves.
   It never blocks a merge and is written to never fail a check (any rendering error exits 0).
4. **A gate map** (`docs/ci-pipeline.md`) is the single written source of truth: every gate, its category,
   what it proves, its evidence tier (ADR-0004) and its required/advisory status — and it states fact (1)
   plainly rather than letting a reader assume the pipeline is enforced.
5. **Traceability**: the map ties the DB-backed security gates to their register requirements
   (REQ-005/006/009/010, ADR-0025) and the tiers to ADR-0004, so "what proves which requirement" is legible.

## Consequences

- No gate logic changes — only names, the split, and the added advisory rollup + doc. Because `main` pins no
  required check names, renaming cannot strand branch protection (and when #71 lands, the required list
  should be set from the new names).
- The ZAP DAST and a11y gates stay inside their host jobs (they need that job's real-stack setup; splitting
  would stand the stack up twice). Their names and the overview now surface them; the map notes the caveat.
- The overview comment and `docs/ci-pipeline.md` must be kept in step with the workflows — the map lists the
  gates, the workflows own them; a new gate means a new row.
