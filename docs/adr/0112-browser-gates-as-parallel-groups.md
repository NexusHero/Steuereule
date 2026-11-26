# ADR-0112 — The browser gates run as parallel groups from one gate list

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** engineering.
- **Builds on** [ADR-0105](0105-ci-gate-taxonomy-and-transparency.md) (check names, required checks, the
  host-job caveat), [ADR-0004](0004-testing-strategy.md), [ADR-0021](0021-controls-are-proven-by-breaking-them.md).
  **Replaces in part** the "accessibility and DAST caveat" of ADR-0105: its reason (standing the stack up twice)
  is accepted here as a price worth paying.
- **Context tags:** ci, process, e2e

## Context

`e2e: browser gates & a11y` was one job of 69 steps. It booted one API and one static web server and ran 46 E2E
gates one after the other, then restarted the API once with the fake chat model. Its last run took 41 minutes.
Three things followed from that shape:

1. The first red gate stopped the job, so every gate behind it did not run. A failure said "something is red",
   not "these three things are red".
2. All gates shared one API process and one database, so they shared rate-limit buckets and state. The scenario
   logs show the pacing this forced ("waiting … for a full quiet window").
3. A gate was added by editing the workflow in several places; nothing checked that a script on disk was
   wired into CI at all.

Other jobs repeated the same set-up block (pnpm, Node, install, Prisma, migrations, Chromium) and carried
39- to 56-line `run:` blocks inline (DSGVO export smoke, PDF export smoke, ZAP) and a 152-line deploy job.

## Decision

1. **One gate list.** `e2e/gates.json` names every stack-bound E2E gate, its group and its commands.
   `e2e/run-gates.mjs --group <g>` runs one group and reports every failure of it, not only the first.
   `--matrix` prints the CI matrix, `--check` validates the list. `e2e/run-gates.test.mjs` (itself a gate of the
   static group) fails on a gate without a known group, a group without a gate, a script that does not exist, a
   matrix that misses a group, or a gate count that changed without this file changing with it.
2. **Build once, run in groups.** `e2e-plan` reads the list, `e2e-build` builds the API and the web bundle once
   and uploads them, and `e2e-gates` runs one job per group in parallel, each on a fresh stack (own API process,
   own database). The group that needs the fake chat model boots the API with `AI_FAKE_KI=1`. The group with no
   stack (the coverage ratchet and the list check) starts none.
3. **Required check names stay.** The ruleset `main` pins check names, and a renamed job would wait for ever. The
   old names remain as aggregate jobs that `needs` the new ones and run `if: always()`:
   `e2e: browser gates & a11y (BFSG/WCAG 2.1 AA, headless Chromium)` (plan, build and every group) and
   `e2e: production compose stack + OWASP ZAP DAST (real Docker build)` (both halves below). They report red
   when a part is red and never stay pending.
4. **The production stack job is split** into `e2e: production stack smoke` and `e2e: OWASP ZAP DAST`. Each
   boots the real Docker stack through one shared action; the Docker build therefore runs twice. This reverses the
   choice of ADR-0105 on purpose: one red half no longer hides the other.
5. **Shared set-up lives in composite actions** (`.github/actions/`): `setup-workspace`, `prepare-database`,
   `install-chromium`, `boot-prod-stack`. Long inline shell moved to scripts: `e2e/smoke/dsgvo-export.sh`,
   `e2e/prod-deploy/pdf-export-smoke.sh`, `scripts/ci/zap-dast.sh` and `scripts/deploy/*.sh` (eight steps of the
   deploy job). A script keeps the lines of its step in the same order, plus `set -e` where the step relied on
   the Actions default shell.

## Consequences

- **No test was dropped.** The 46 gate steps (49 commands) of the former job are the 46 gates of the list
  (command for command, with their `env`); the list check is the 47th. The group count is checked by the test
  of point 1. The extraction of the 11 scripts was compared against the original steps line by line.
- A pull request now uses more runner minutes (a fresh install and boot per group, a second Docker build) and
  less wall-clock time (the longest group instead of the sum).
- Gates no longer share a process, so an order dependence between two gates would now show as a failure.
  That is intended; such a dependence is a defect of the gate.
- The new per-group checks (`e2e: gates — <group>`) are not in the ruleset; the aggregate job is the required
  one. Adding a group needs no ruleset change.
- The deploy scripts do not run on a pull request. Their safety rests on `actionlint`, `shellcheck` and the
  line-by-line comparison above; the first deploy after the merge is their first run.
