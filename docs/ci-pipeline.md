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

## The accessibility and DAST caveat

Two high-value gates ride **inside** a host job rather than being their own check, because they need that
job's expensive real-stack setup: the **a11y (BFSG/WCAG)** steps run inside `e2e: browser gates & a11y`, and
the **OWASP ZAP DAST** pentest runs inside `e2e: production compose stack + OWASP ZAP DAST`. Their names now
say so, and the CI-Overview comment lists them under their category, but splitting them into standalone checks
would mean standing the stack up twice — deliberately not done (ADR-0105).
