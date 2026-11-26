# CI pipeline — gate map

What every CI gate is, which category it belongs to, what it proves, and whether it blocks a merge. The
single overview of "what the pipeline actually does". The taxonomy and the per-PR CI-Overview comment that
mirrors this map are decided in [ADR-0105](adr/0105-ci-gate-taxonomy-and-transparency.md).

Checks are named `category: gate` so the GitHub PR checklist clusters by category on its own. The five PR
pipelines (`Quality`, `Build & E2E`, `Security`, `Load`, and the advisory `CI Overview`) run in parallel on
every pull request; the nightly ones (`AI eval`, `Law watch`) do not gate PRs.

## Required checks (ruleset `main`)

`main` has no classic branch protection; a repository **ruleset** (`main`, active) requires status checks by
name. The names below are the job `name:` values exactly as they report. On 2026-11-24 the ruleset required the
first twenty (read with `gh api`); the last five are not required yet and must be added by a repository admin
(H2-32). Each of them runs on every pull request, so requiring it cannot leave a PR waiting.

| Check | Workflow | Required today |
|---|---|---|
| `static: validate compose` | `quality.yml` | yes |
| `static: lint (oxlint)` | `quality.yml` | yes |
| `correctness: unit tests (no DB)` | `quality.yml` | yes |
| `correctness: integration (postgres)` | `quality.yml` | yes |
| `static: docs consistency (register + adr)` | `quality.yml` | yes |
| `static: vordrucke (form-field geometry)` | `quality.yml` | yes |
| `SonarCloud Code Analysis` | SonarCloud app (job `quality: sonarqube cloud` uploads) | yes |
| `security: secret scan (gitleaks)` | `security.yml` | yes |
| `security: dockerfile lint (hadolint)` | `security.yml` | yes |
| `security: workflow lint (actionlint)` | `security.yml` | yes |
| `security: iac scan (trivy — terraform, dockerfiles, compose, k8s)` | `security.yml` | yes |
| `security: sast (semgrep — custom NestJS/DSGVO rules)` | `security.yml` | yes |
| `supply-chain: build, SBOM, container scan & bundle gate` | `ci.yml` | yes |
| `e2e: smoke (real /api/auth over HTTP)` | `ci.yml` | yes |
| `e2e: browser gates & a11y (BFSG/WCAG 2.1 AA, headless Chromium)` | `ci.yml` | yes |
| `e2e: scenarios (shard 1/4)` | `ci.yml` | yes |
| `e2e: scenarios (shard 2/4)` | `ci.yml` | yes |
| `e2e: scenarios (shard 3/4)` | `ci.yml` | yes |
| `e2e: scenarios (shard 4/4)` | `ci.yml` | yes |
| `e2e: production compose stack + OWASP ZAP DAST (real Docker build)` | `ci.yml` | yes |
| `e2e: scenario 09b (self-employment switch on)` | `ci.yml` | **add** |
| `security: dependency audit (production deps)` | `security.yml` | **add** |
| `performance: load (many users, seeded accounts, think times)` | `load.yml` | **add** |
| `static: opentofu validate` | `deploy.yml` (every PR since beta P1) | **add** |

The deployment wiring (every production value reaches Cloud Run, every `workflow_run` name exists) is checked
inside `correctness: unit tests (no DB)` (`apps/api/test/config/deployment-wiring.test.ts`), so it needs no
check of its own.

## Categories

### `static` — cheap checks, no build, no DB (ADR-0004 unit tier)
| Gate | Proves | Workflow |
|---|---|---|
| `static: lint (oxlint)` | Style/lint rules hold (ADR-0019) | `quality.yml` |
| `static: validate compose` | The compose files parse and are coherent | `quality.yml` |
| `static: docs consistency (register + adr)` | Requirements register & ADR log resolve (ADR-0021/0025) | `quality.yml` |
| `static: vordrucke (form-field geometry)` | Printout field positions stay within the official forms | `quality.yml` |

### `correctness` — the app's own logic (ADR-0004)
| Gate | Proves | Evidence tier | Workflow |
|---|---|---|---|
| `correctness: unit tests (no DB)` | Pure logic + fake-repo HTTP contract (guards, validation, scoping) | unit | `quality.yml` |
| `correctness: integration (postgres)` | Real-Postgres cascade + the DB-backed acceptance suites (REQ-005/006/009/010), incl. the BOLA/IDOR pentest matrix, session revoke, origin-CSRF, token rotation, absolute session cap | integration / acceptance | `quality.yml` |

### `security` — supply chain, static analysis and dynamic pentest
| Gate | Proves | Workflow |
|---|---|---|
| `security: secret scan (gitleaks)` | No secrets committed | `security.yml` |
| `security: sast (semgrep)` | Custom NestJS/DSGVO SAST rules (`.semgrep.yml`) | `security.yml` |
| `security: iac scan (trivy)` | No HIGH/CRITICAL IaC misconfig (Terraform, Dockerfiles, compose, k8s) | `security.yml` |
| `security: dependency audit (production deps)` | No high/critical advisory in production dependencies (`pnpm audit --prod`); the few accepted build-tooling paths carry a reason and an expiry date in `scripts/checks/dependency-audit.mjs` | `security.yml` |
| `security: dockerfile lint (hadolint)` | Dockerfiles are clean (non-root, no error-level findings) | `security.yml` |
| `security: workflow lint (actionlint)` | The workflows themselves are valid | `security.yml` |
| `supply-chain: build, SBOM, container scan & bundle gate` | Images build non-root, CycloneDX SBOMs (CRA/BSI TR-03183), Trivy HIGH/CRITICAL container scan, web bundle security + size budget | `ci.yml` |
| DAST — folded into `e2e: production compose stack + OWASP ZAP DAST` | OWASP ZAP Baseline + OpenAPI DAST pentest against the **real production containers** | `ci.yml` |

### `e2e` / acceptance — the real stack end to end
| Gate | Proves | Workflow |
|---|---|---|
| `e2e: smoke (real /api/auth over HTTP)` | better-auth actually mounts on Fastify over a real socket (the `.inject()`-blind class, ADR-0012) | `ci.yml` |
| `e2e: browser gates & a11y (BFSG/WCAG 2.1 AA)` | Key screens pass axe-core WCAG 2.1 AA + theme/keyboard navigation | `ci.yml` |
| `e2e: scenarios (shard 1–4)` | The persona end-to-end scenarios across the app | `ci.yml` |
| `e2e: scenario 09b (self-employment switch on)` | The self-employment vertical with its feature flag on (ADR-0101) | `ci.yml` |
| `e2e: production compose stack + OWASP ZAP DAST` | Guest/registration/login/QR against a real Docker build, plus the ZAP DAST pentest | `ci.yml` |

### `performance`
| Gate | Proves | Workflow |
|---|---|---|
| `performance: load (many users)` | Seeded multi-user load with think times holds up | `load.yml` |

### `quality`
| Gate | Proves | Workflow |
|---|---|---|
| `quality: sonarqube cloud` | SonarQube quality gate (issues, hotspots, coverage on new code) | `quality.yml` |

### Nightly (not a PR gate)
| Gate | Proves | Workflow |
|---|---|---|
| `AI eval (nightly)` | The owl against the real model — amounts vs. core, StBerG, sources, prompt-injection, PII, consistency, TTFT | `ai-eval-nightly.yml` |
| `Law watch (nightly)` | Cited norms still match gesetze-im-internet.de | `law-watch.yml` |

## How the browser gates are split (ADR-0112)

The 46 stack-bound E2E gates are listed in `e2e/gates.json`, each in one group. `Build & E2E` builds the API and
the web bundle once (`e2e: build`), then runs one job per group in parallel, each on a fresh stack
(`e2e: gates — <group>`). A group reports every failing gate, not only the first.

| Group | What it holds |
|---|---|
| `layout` | Responsive layout, banners, dark mode, visual regression |
| `a11y` | BFSG / WCAG 2.1 AA, both themes, keyboard |
| `chat-and-inputs` | Owl chat experience, input aids, smart inputs, dictation, plan in chat |
| `account-and-session` | Cross-origin sign-up, session, device QR, account security |
| `tax-flows` | Household, church tax, real cases, forms, printout, Verlauf, S10 acceptance |
| `navigation-and-states` | Deep links, hub, sheets, deadline banners and failure states, Belege channel |
| `beta-states` | Beta account, partner, payment and mask states |
| `scan-and-uploads` | Self-hosted OCR, scan corpus and flows, uploads |
| `budgets` | Navigation efficiency, load and latency budget |
| `static-ratchet` | E2E coverage ratchet and the gate-list check (no stack) |
| `owl-fake-ki` | Owl mode against the scripted chat model (`AI_FAKE_KI`) |

Adding a gate is one entry in `e2e/gates.json`; the matrix is built from the file, so a gate cannot exist
without running. `node e2e/run-gates.mjs --list` shows the gates, `--group <g>` runs one group against a stack
that is already up.

The two required checks that were one job each keep their names as **aggregate jobs** that wait for the parts and
run `if: always()`, so a ruleset that pins the name never waits for a job that no longer exists:

- `e2e: browser gates & a11y (BFSG/WCAG 2.1 AA, headless Chromium)` = plan + build + every `e2e: gates — <group>`
- `e2e: production compose stack + OWASP ZAP DAST (real Docker build)` = `e2e: production stack smoke` +
  `e2e: OWASP ZAP DAST (real Docker build)`

The set-up shared by the jobs is in `.github/actions/` (`setup-workspace`, `prepare-database`, `install-chromium`,
`boot-prod-stack`); long shell steps live in `e2e/smoke/`, `e2e/prod-deploy/`, `scripts/ci/` and `scripts/deploy/`.

## The accessibility and DAST caveat

The **a11y (BFSG/WCAG)** gates are the `a11y` group of the browser gates and no longer share a stack with
unrelated gates. The **OWASP ZAP DAST** pentest is its own job on the real production containers; the Docker stack
is built twice (smoke and DAST) on purpose (ADR-0112, replacing the choice of ADR-0105).
