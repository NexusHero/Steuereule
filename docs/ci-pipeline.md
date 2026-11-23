# CI pipeline — gate map

What every CI gate is, which category it belongs to, what it proves, and whether it blocks a merge. The
single overview of "what the pipeline actually does". The taxonomy and the per-PR CI-Overview comment that
mirrors this map are decided in [ADR-0105](adr/0105-ci-gate-taxonomy-and-transparency.md).

Checks are named `category: gate` so the GitHub PR checklist clusters by category on its own. The five PR
pipelines (`Quality`, `Build & E2E`, `Security`, `Load`, and the advisory `CI Overview`) run in parallel on
every pull request; the nightly ones (`AI eval`, `Law watch`) do not gate PRs.

## ⚠️ Nothing is a required check yet

`main`'s branch protection currently sets **no `required_status_checks`** — only "conversations resolved" and
admin enforcement. So every gate below is **advisory**: a red check does **not** block a merge today. Making
the critical gates *required* is tracked in **#71** (branch protection) and is the stakeholder's to set. Until
then this map (and the CI-Overview comment) is how a reviewer sees what passed; the green pipeline is a
convention, not an enforced invariant.

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
