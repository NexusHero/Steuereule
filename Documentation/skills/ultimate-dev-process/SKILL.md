---
name: ultimate-dev-process
description: Vendor-neutral, stack-agnostic development governance that unifies architecture governance, TDD/testing discipline, implementation style, and commit/PR workflow into one Definition of Done for architects, engineers, and QA.
---
# Ultimate Development Process

Merged from two production processes (ElliotWaveAnalyzer, Résumé/myJob) and hardened with the
gaps neither covered on its own. One process, three roles, one Definition of Done — so an
architect, an engineer, and a QA/test engineer can sit down together and know exactly which of
them owns which gate, and where the seams between their work are.

Applies to humans and AI coding agents alike. An agent follows every section below automatically,
without being asked — the same way a senior engineer would not need reminding to write a test.

---

## Roles

| Role | Owns |
|------|------|
| **Software Architect** | Requirements Register, ADRs, Quality Goals, the Tech Radar, architecture conformance in review |
| **Software Engineer** | Implementation style (SOLID), TDD, the code itself, its unit/pure-logic tests |
| **QA / Test Engineer** | Test strategy shape (the pyramid), test *quality* (not just the coverage %), acceptance/e2e tests, the security checklist |
| **AI coding agent** | All of the above, applied on every change, without being asked |

No role is a gate-keeper of last resort — each gate below is owned by whoever is closest to it,
and checked by the *other* two roles in review (see **Reviewer Protocol**).

---

## 0. Definition of Ready — before work starts

A work item is ready to pick up when it has:

- a stable id (`REQ-NNN` or equivalent) and a one-paragraph acceptance criterion,
- the quality attribute(s) it affects named (correctness / security / performance / …), and
- a rough test approach (what kind of test will prove it's done — not the test code itself).

If it crosses a trust boundary (auth, money, PII, a new external integration) it is flagged for a
security pass **before** implementation starts, not discovered in review.

Work without an id is fine for spikes/experiments; it does not enter the Requirements Register and
does not get an ADR — but it also does not merge to the main line as a delivered feature.

### 0.1 Every new feature gets grilled first — no exceptions

Before a line of implementation is written, **every new feature** runs through the
[`grill-with-docs`](../engineering/grill-with-docs/SKILL.md) skill (`/grilling`). This is not
optional and there is no pardon for skipping it: a relentless interview that sharpens the plan,
surfaces the unstated assumptions, and produces the ADR(s) and glossary entries as a by-product —
feeding §1 (Architecture Governance) directly. A feature that arrives at implementation without
having been grilled is sent back, the same way code without a test is sent back.

The only work exempt is what §0 already exempts from the Requirements Register: throwaway
spikes/experiments that will not merge as a delivered feature.

---

## 1. Architecture Governance

Architecture documentation is part of the change, not a follow-up. A PR that changes architecture
without the matching documentation is **not done** — exactly like a PR with a failing test.

### 1.1 Requirements Register

Every feature starts from a requirement with a stable id (`REQ-NNN`), tracked in a **living
Requirements Register**. A ticket/issue — on the **SteuereuleBoard** GitHub Project — is where the
requirement is *discussed*; the Register is where it is *tracked* as the source of truth. Each row
carries: id, short statement, current status, and a link back to its issue.

### 1.2 ADRs — one decision, one file, never edited after acceptance

Any of the following **requires an ADR**, in the **same PR**:

- adding, removing, or swapping a technology/library/external service,
- introducing or changing a cross-layer boundary, an abstraction, or a major algorithm,
- any decision a future maintainer would ask *"why was it done this way?"* about.

Routine dependency bumps and plain bug fixes don't need one.

Format is lightweight [MADR](https://adr.github.io/madr/): **Context → Decision → Consequences**
(+ **Alternatives considered** when the choice was close), plus a status. Numbering is sequential
and immutable. A decision that replaces another **supersedes** it — mark the old one
`Superseded by ADR-NNN` — never rewrite history.

### 1.3 Sequence diagrams for fulfilled requirements

When a requirement is fulfilled, add or update a sequence diagram (Mermaid or PlantUML — pick one
per project and stay consistent) in the Runtime View showing the actual call flow across the real
building blocks. It documents reality: it must match the code shipping in the same PR. Link it to
its `REQ-NNN`.

### 1.4 Tech Radar — so the ADR log doesn't become the only way to see the shape of the stack

Once a project accumulates a couple dozen ADRs, "what's our stance on X" stops being answerable by
skimming. Keep a short **Tech Radar** table (Adopt / Trial / Assess / Hold) next to the ADR index —
one line per technology, linking back to the ADR that decided it. This is a index, not a process:
it costs one line per ADR and pays for itself the first time someone asks "can I use gRPC here."

### 1.5 Docs staleness is a CI gate, not a review nitpick

Manual review catches stale docs unreliably. Add a deterministic, dependency-free check (no LLM,
no network) to CI that fails the build on structural drift:

- a diagram source (`.puml`/`.mmd`) with no rendered output, or an orphaned render with no source,
- a relative Markdown link that points at a file that doesn't exist,
- an `ADR-NNNN` reference with no matching ADR file.

This is cheap, deterministic, and catches the exact rot manual review misses under deadline
pressure.

---

## 2. Implementation Style

### 2.0 First principles — the lenses every change is read through

SOLID (2.1) governs *structure*; these govern *judgement*. They are reviewed with the same weight
as the tests — a PR that violates one is a finding, not a stylistic quibble.

- **KISS — keep it simple.** The simplest design that satisfies the requirement wins. Cleverness
  that a reviewer has to decode is a cost, not a feature. If two solutions work, ship the one with
  fewer moving parts.
- **YAGNI — build for today's requirement, not an imagined tomorrow.** No speculative abstraction,
  no "we might need it later" hook. Extensibility comes from clean seams (OCP/DIP), not from
  pre-built machinery nothing uses yet. Dead configurability is debt.
- **DRY — one source of truth per fact.** A rule, a constant, a validation lives in exactly one
  place. But DRY is about *knowledge*, not keystrokes: don't couple two things that merely look
  alike today (that's how DRY turns into the wrong abstraction — prefer a little duplication over
  the wrong shared abstraction).
- **Principle of least astonishment.** Code behaves the way its name and its neighbours promise.
  No surprising side effects, no function that does more than it says.
- **Composition over inheritance.** Reach for inheritance only for genuine is-a substitutability;
  otherwise compose. Deep hierarchies are a smell.
- **Fail fast, fail loud.** Validate at the boundary and reject bad input immediately with a clear
  error; never limp on with a half-valid state. Errors are handled or propagated — never swallowed
  (see perspective 3, §6).

### 2.0.1 Twelve-Factor — the baseline for anything that runs as a service

Any deployable process follows the [Twelve-Factor App](https://12factor.net/) methodology. The
factors that most often get violated, and that a reviewer checks explicitly:

- **Explicitly declared, isolated dependencies** (factor II) — every dependency is declared and
  pinned in a lockfile; nothing relies on a system-wide package that "happens to be there". This is
  also the hook for supply-chain scanning (§4.3).
- **Config in the environment** (factor III) — reinforces §2.3: config comes from the environment,
  never baked into the build; the same artifact runs in every environment.
- **Backing services as attached resources** (factor IV) — a database, queue, cache, or third-party
  API is addressed by a URL/credential in config and is swappable without a code change (ties to
  §2.2's adapter isolation).
- **Strict separation of build, release, run** (factor V) — a release is an immutable
  build + config; you never mutate code in a running environment.
- **Stateless processes** (factor VI) — no sticky in-process state; anything durable lives in a
  backing service. Enables horizontal scale (factor VIII) and disposability.
- **Disposability** (factor IX) — fast startup, graceful shutdown on `SIGTERM`, robust against
  sudden death; reinforces the rollback answer §8 demands.
- **Dev/prod parity** (factor X) — keep environments as close as possible; the local gate (§5's
  `./test.sh`) runs what CI runs.
- **Logs as event streams** (factor XI) — the app writes structured events to stdout and never
  manages log files or routing itself (ties to §8's structured-logging rule).
- **Admin processes as one-off tasks** (factor XII) — migrations and scripts ship in the same
  release and run in an identical environment, never hand-run against prod.

### 2.1 SOLID is a quality gate, not an aspiration

Reviewed on every PR, weighted the same as the tests. The two violations to watch hardest:

- **No god classes (SRP).** If a class fetches *and* calculates *and* orchestrates *and*
  persists, split it. If you cannot state its single reason to change in one sentence, it's wrong.
  Business logic lives in small, pure, dependency-free classes; orchestration/glue stays thin.
- **Depend on interfaces, not concretes, across a boundary (DIP).** Consumers depend on
  abstractions; infrastructure implementations (a specific SDK, a specific DB driver) never leak
  into domain/application code. New behavior is a new implementation + one wiring line — existing
  classes are not modified (OCP).

A PR that introduces a god class, or a concrete dependency where an interface should stand, is
**not done** — same as a PR with a failing test.

### 2.2 Isolate volatile third-party surface

Any SDK/library that changes fast, or that you might swap later (an LLM SDK, a payment provider, a
charting library) is wrapped behind one narrow interface, with its types confined to a single
adapter file. Nothing upstream of that file ever imports the vendor's types.

### 2.3 Config over hardcoding

API keys, model/version names, endpoints, feature toggles — all configuration, never literals in
source. A vendor deprecating a model version or rotating an endpoint should be a config change, not
a deploy.

### 2.4 Language-appropriate strictness, always on

Whatever the stack's strict mode is (nullable reference types, TypeScript `strict`, a linter's
strictest preset) — it's on project-wide, with no blanket suppressions. A suppression needs a
comment explaining why, not just `// eslint-disable`.

### 2.5 Code in English, copy in the product language

Two different rules that get conflated. **Code** — identifiers, comments, commit messages, ADRs,
tests — is English (§3.2, §5), so the codebase reads consistently for any engineer. **User-facing
copy** is in the product's language — for Steuereule that is **German** — and every user-visible
string goes through the **i18n layer**, never a hardcoded literal in a component. This keeps
domain/tax terminology consistent (tie it to the glossary from §0.1's grilling) and leaves the door
open to further locales without a rewrite. A hardcoded user-facing string is a finding, same as a
hardcoded config value (§2.3).

---

## 3. Testing Behavior

### 3.1 TDD: Red → Green → Refactor

Tests are written **before** the implementation. New behavior arrives with the test that specifies
it, in the same commit/PR — never code first, tests bolted on after (or never).

### 3.2 Naming and structure

```
Subject_StateUnderTest_ExpectedBehaviour
```

Examples: `CalculateRsi_AllGains_RsiApproachesOneHundred`,
`ValidateAsync_InvalidLabel_ThrowsArgumentException`.

Bodies follow **Arrange–Act–Assert** with a blank line between each phase. Never abbreviate a shown
test with `// ...` — show the whole thing.

### 3.3 The pyramid, and what each layer is for

| Level | What it tests | Rule |
|-------|---------------|------|
| **Pure-logic / unit** | Deterministic cores — rule checkers, calculators, parsers, evaluators | No mocks needed — exhaustive fixtures, no I/O |
| **Service / orchestration** | Delegation, provider selection, input validation | Mock the ports (interfaces), not the concretes |
| **Acceptance / integration** | The real API against a real datastore | Only genuinely external systems (LLM, third-party API) are faked |
| **Component / e2e** | UI against the real DOM/browser | Cover the golden path + empty/loading/error states |

**Never call a real external system (network, LLM, paid API) from a unit test.** Use seeded,
deterministic fixtures — one shared fixture module, not ad-hoc arrays scattered across test files.

### 3.4 Coverage is architectural, not brute-forced

Target **≥ 90% line coverage on core/business logic**, enforced as a CI-blocking gate — not an
aspiration in a doc nobody reads. The way to hit it: keep business logic in pure, dependency-free
classes so it is trivially and exhaustively testable; orchestration/glue stays thin and needs fewer
tests. Shallow tests that chase the percentage without exercising real behavior don't count, and a
reviewer should say so.

### 3.5 Acceptance tests run against the *real artifact* — and trace back to a requirement

Coverage proves the logic; it does not prove the **shipped app** does what the task asked. That is
what the acceptance tier is for, and for Continuous Delivery it carries two non-negotiable rules:

- **Test the artifact you will release, not a stand-in.** Acceptance/E2E tests run against a freshly
  deployed instance of the *same immutable container image* that would go to production
  (12-Factor V: build = release = run), brought up in a throwaway environment with **real backing
  services** behind it (real DB, real queue, real cache — as containers). Only genuinely external
  third parties (paid APIs, LLM) are faked, at the network edge, and that boundary is pinned by a
  **contract test** so the fake can't silently drift from reality. In this repo the environment is
  the compose stack + its `e2e` overlay (see Appendix).
- **Every `REQ-NNN` maps to at least one acceptance test**, recorded in the
  **requirements-traceability matrix**. The test is written as an executable spec (Given–When–Then)
  whose title mirrors the task's acceptance criterion — the test *is* the living definition of
  "the app fulfils its purpose". A requirement with no green acceptance test against the real
  artifact is **not delivered**, regardless of how green the unit suite is. The acceptance test for
  a new requirement is written (red) *before* the implementation — the outer ring around the TDD
  loop of §3.1 (ATDD).

### 3.6 A flaky test is a release blocker, not an annoyance

Continuous Delivery dies the moment the team stops trusting a red build. So the tester's discipline
is zero-tolerance for non-determinism:

- A flaky test is **quarantined immediately *and* gets its own issue with a fix deadline** (§6 Issue
  Discipline) — never silently re-run until it passes. A green-on-retry suite is a broken gate.
- Tests are deterministic by construction: **injectable clock** (no reliance on wall-time/DST),
  **seeded, per-test-isolated data** (no shared mutable state — which is also what lets the suite
  run in parallel), and **no `sleep`** — wait by polling a condition, never a fixed delay.
- Test data comes from **one shared fixture/seed module**, not ad-hoc arrays scattered across files
  (reinforces §3.3).

---

## 4. Security & NFR Gate

### 4.1 Application security checklist

Keep a short, concrete checklist (adapt the specifics to the stack, keep the shape):

- **AuthN/AuthZ** — every business endpoint requires auth explicitly; public endpoints are
  explicitly marked public, not accidentally open.
- **Rate limiting** — every endpoint has an explicit policy; tighter limits on anything that calls
  a paid/LLM API or handles login.
- **Input validation** — every write endpoint validates; free-form strings that reach an external
  system go through an allowlist; numeric ranges are explicitly bounded.
- **CORS** — no wildcard origins; explicit allowlist.
- **Secrets** — never in source or committed config; read from environment/secret manager; local
  override files are gitignored.
- **Headers** — security headers and HSTS on in non-dev environments; a CSP that names only known
  external domains.
- **Logging** — no PII/secrets in log lines; security-relevant events (auth failures, rate-limit
  hits) are logged at a level that alerts.

**Lightweight threat-model trigger:** any change that adds a new external integration or a new
trust boundary gets a security-checklist pass *before* merge — not as an afterthought once
something breaks in production.

### 4.2 Data protection & privacy (DSGVO)

Steuereule handles tax data — the most sensitive class of personal data, under strict legal
retention rules. Privacy is a first-class gate, not a footnote to §4.1:

- **Data minimisation** — collect and persist only what a `REQ-NNN` actually needs; a field with no
  requirement behind it does not get stored.
- **Lawful basis & purpose** — every category of personal data has a documented reason it is held;
  data collected for one purpose is not silently reused for another.
- **Retention & deletion** — each data category has an explicit retention period (tax records carry
  a *legally mandated* long retention — that is a requirement, not a default) and a deletion/erasure
  path. "We keep everything forever" is a finding.
- **No real PII in non-production** — test, CI, and E2E datastores (§3.5) are seeded with synthetic
  or irreversibly anonymised data, never a copy of production. This is the hard constraint on
  "acceptance tests against a real datastore".
- **Encryption** — personal data encrypted in transit (TLS) and at rest; the strongest handling for
  tax identifiers and financial figures.
- **Subject rights & processors** — an export/erasure request has a path to fulfil it; every
  third-party that touches personal data (hosting, error tracking, analytics) is a documented
  processor, and nothing ships PII to a service that isn't one.

A change that introduces a new personal-data field, a new retention behaviour, or a new processor
gets this checklist applied *before* merge — same trigger as the threat model.

### 4.3 Supply-chain security

The app's own code is only part of the attack surface; its dependencies are the rest.

- **Locked & reproducible** — a committed lockfile pins every transitive dependency (12-Factor II);
  builds are reproducible, `--frozen-lockfile` in CI.
- **Automated dependency scanning** — an SCA/audit step (`pnpm audit`, Dependabot/Renovate) runs in
  CI; a known high/critical CVE in a shipped dependency blocks the build until patched or explicitly
  risk-accepted with a tracked issue (§6).
- **Update hygiene** — dependency bumps arrive as small, reviewable PRs, not a once-a-year big-bang;
  routine bumps don't need an ADR (§1.2), a *major*/breaking upgrade or a new dependency does.
- **License compliance** — a new dependency's license is checked against an allowlist; a
  copyleft/unknown license is a review stop, not a silent add.
- **Provenance** — prefer well-maintained, widely-used packages; a fresh, low-adoption dependency in
  a security-sensitive path is a decision worth an ADR.

### 4.4 Performance & NFR budgets

§4 is the *NFR* gate, not only the security gate — so the non-functional targets are named, not
left implicit for §9's "SLO watch" to assume:

- **Explicit budgets** — the latency-sensitive paths carry a stated budget (e.g. API p95 under a
  target, a page's interaction-ready time, a bundle-size ceiling). A budget that isn't written down
  can't be regressed against.
- **Regression as a gate** — the budgets are asserted in the pipeline where it's cheap (a bundle-size
  check, a smoke-level latency assertion); a change that blows a budget is a finding, not a surprise
  found in production.
- **Load-shaped testing for critical paths** — anything that must survive a filing-deadline spike
  (the tax-domain reality) gets a load/stress check before it's trusted at that scale.
- **These budgets are the SLOs §9 watches** — the same numbers armed here are what progressive
  delivery rolls back against.

---

## 5. Commit & Branching

Conventional Commits, in English:

```
type(scope): short summary in imperative mood
```

Types: `feat` · `fix` · `docs` · `test` · `refactor` · `chore` · `ci` · `build` · `perf` ·
`style` · `revert`.

Branches: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `ci/` + short description.

**Automate the enforcement, don't rely on memory.** Install local git hooks:

- `pre-commit` runs the full local gate (format + lint + tests) — the same thing CI runs.
- `commit-msg` rejects a commit whose subject doesn't match Conventional Commits.

Provide **one script** that *is* the local gate and *is* what CI runs — `./test.sh` or equivalent —
so "did you run the checks" is never a review question.

### 5.1 Versioning & changelog — the payoff for disciplined commits

Conventional Commits aren't bookkeeping for its own sake; they are the input to automated release
metadata. Because they carry intent, versioning and the changelog are *derived*, not hand-written:

- **Semantic Versioning**, computed from the commits since the last release — `fix:` → patch,
  `feat:` → minor, a `!` / `BREAKING CHANGE:` footer → major. Nobody bumps a version by hand.
- **The changelog is generated** from those commit subjects (e.g. `changesets` /
  `semantic-release`), so every release states what changed without anyone curating a list from
  memory. A user-facing change with a commit subject too vague to appear meaningfully in the
  changelog is a commit-message finding.
- **A release is a tag on `main`** produced by the pipeline (§9), tying the version, the changelog
  entry, and the immutable artifact together — so any deployed build is traceable back to its exact
  commits.

---

## 6. Pull Request Workflow

- **`main` is protected. Merge only via PR — no direct pushes.**
- **One logical change per PR.** Larger changes get an issue first to discuss the approach.
- **Every task has a tracked issue; every PR links it** (`Closes #123`). This is what keeps the
  history traceable after the fact — a PR with no linked issue is missing context a reviewer has
  no other way to recover.
- All CI checks green, all review threads resolved, branch up to date with base — all three,
  before merge.

### Issue Discipline — nothing found gets silently dropped

Every task, story, and bug fix gets its issue before work starts (§0) — no issue, no delivered
feature, regardless of how small the change feels.

This extends to anything surfaced *along the way*. If work on one task turns up an unrelated
defect, risk, missing test, or piece of debt, it does not get silently folded into the current PR
(scope creep) and it does not get silently ignored either. File an issue for it on the spot, then
pick one of two honest paths:

- **Fix it now**, in its own commit or a small follow-up PR that links the new issue — reasonable
  when it's small and separable from the current change.
- **Defer it**, leaving the issue open and prioritized — never closed as "not now" without a
  one-line reason recorded on the issue itself.

What never happens: a defect noticed and left with no trace, or quietly patched with no issue link
so a future reader has no way to know it was ever a known risk.

### Reviewer Protocol — the gap most process docs leave implicit

The PR template checklist is the *author's* self-check. The reviewer's job is a distinct pass, not
a re-read of the same checklist:

1. **Architecture conformance** — does this match the ADRs and the Requirements Register, or does
   it quietly introduce a new pattern that needs its own ADR?
2. **Test quality, not test quantity** — do the tests assert behavior, or just execute lines? Would
   they fail if the logic were subtly wrong? A green coverage number with weak assertions is a
   finding, not a pass.
3. **Security checklist** — applied by the reviewer independently, not trusted from the author's
   checkbox, for anything touching a trust boundary.
4. **Docs currency** — does the changed behavior show up in the docs a future reader would consult?

### The eight review perspectives — the standing review lens

The four passes above are the *shape* of a review. **Who** performs them — and the specific class
of failure each is hunting — is fixed by eight standing perspectives. Every non-trivial change is
reviewed through all eight; on a small change one reviewer wears several hats, but no perspective
is skipped by default. These are the same eight the periodic codebase audit fans out (see
[`docs/audit/`](../../docs/audit/)), promoted from a point-in-time exercise to the everyday lens —
so a review is not "one person's read" but a checklist of eight distinct failure modes.

| # | Perspective | The question this lens asks |
|---|-------------|-----------------------------|
| 1 | **Requirements Engineer** | Does the change match its `REQ-NNN` and the register's stated status? Are the register **and** the traceability matrix updated in *this* PR? Is any delivered scope left undocumented, or any status overstated? |
| 2 | **Architect** | Does it conform to the ADRs and the module boundaries, or smuggle in a new pattern that needs its own ADR? Is the deterministic core kept pure (ADR-0005)? Are volatile vendors confined to one adapter (§2.2)? No god classes; dependencies through interfaces, not concretes (SOLID)? |
| 3 | **Software Developer** | Is the code correct at the edges — null/empty/boundary/overflow, timezone/DST, integer-money? Is it readable and idiomatic to its neighbours? Are error paths handled, not swallowed? |
| 4 | **DevOps Engineer** | Does it deploy and roll back safely — migrations under a lock, replicas, secrets, health/readiness, non-root containers? Is anything that can fail in production observable (§8)? |
| 5 | **Tester** | Do the tests assert *behaviour*, and would they fail if the logic were subtly wrong? Are the concurrency, negative-isolation, and error-mapping paths covered — not just the happy path? Is there an **acceptance-tier test** exercising the requirement end-to-end against the real system (§7)? |
| 6 | **UX Designer** | Does the UI honour the UX vision and the design system? Is user-facing copy in the product language (German) and routed through i18n — no hardcoded strings (§2.5)? Honest empty/loading/error states, no fabricated numbers, touch targets and motion within spec? |
| 7 | **Customer / User** | Does the feature actually do what it claims from the user's seat — no silently-discarded input, no dead affordance, no false confirmation, no data loss on the real render target? |
| 8 | **Security & Correctness** | Every trust boundary checked: authz, workspace isolation by construction, idempotency/replay, no self-mint / self-grant, no PII in logs, deterministic numbers correct to the last minor unit? |

**Adversarial verification — the rule that keeps the review honest.** A finding is not reported
because it *looks* wrong; it is reported because a second, skeptical pass tried to **disprove** it
and failed. Every candidate separates **FAKT** (proven from the code, cited `file:line`) from
**RISIKO** (a real but conditional failure) from **MEINUNG** (taste); only FAKT/RISIKO that
survive the disprove-pass reach the author, each carrying its `file:line` evidence. No false
alarms, no vibes — a claim without a citation is not a finding.

---

## 7. Definition of Done — the master checklist

A change is done, and its PR mergeable, only when **all** hold:

- [ ] Build succeeds; strict/lint checks pass with zero suppressions added without justification
- [ ] All tests green, none skipped; new behavior has a test written before the implementation
- [ ] Line coverage on core logic stays **≥ 90%**, achieved architecturally, not by shallow tests
- [ ] **Every delivered requirement carries an acceptance-tier test** — the requirement exercised
      end-to-end against the **real deployed artifact** (the same container image that would ship,
      in a throwaway environment with real backing services — §3.5), or a browser E2E for a
      user-facing golden path; a client render test for a client-only requirement — named in the
      requirements-traceability matrix. A requirement reaching Done/Verified without one is not done
- [ ] **The change is releasable by the pipeline unattended** (§9): every merge to `main` is
      deployable, the pipeline is the only path to production, and the rollback path is automated
      and itself tested. No test is flaky/quarantined without a tracked issue (§3.6)
- [ ] **SOLID holds**: no god classes, dependencies through interfaces across boundaries
- [ ] Every new endpoint/entry point is exercised by a test **and** documented (OpenAPI/equivalent)
- [ ] No secrets, API keys, or PII committed
- [ ] Security checklist applied if the change crosses a trust boundary (§4.1); **data-protection
      checklist applied if it touches personal data** — minimisation, retention, no real PII in
      test/CI datastores (§4.2)
- [ ] Any new/updated dependency passes the audit + license check; lockfile committed (§4.3)
- [ ] Stated performance/NFR budgets not regressed (§4.4)
- [ ] Any schema change is **forward-only and expand/contract** — the currently-running version
      survives it (§9.1); user-facing copy goes through i18n in the product language (§2.5)
- [ ] **Architecture Governance**, if architecturally relevant: ADR added/updated · Requirements
      Register updated · sequence diagram added/updated for a fulfilled requirement · affected
      docs sections corrected — all in the same PR
- [ ] Commit messages are Conventional Commits; branch follows the naming convention
- [ ] PR links its issue; one logical change; all CI green; review threads resolved
- [ ] Anything found along the way that's out of scope has its own issue — not silently fixed
      inline, not silently skipped
- [ ] `git status` clean — no file the change depends on is left untracked

---

## 8. Observability & Rollback

For anything architecturally relevant, answer *before* merging: **how will we know, in production,
if this breaks?** — a log line, a metric, or an alert. Not every PR needs new dashboards; every PR
that changes a cross-cutting concern or a user-facing critical path needs an answer to this
question, not silence.

- Structured logging for anything architecturally significant; never log PII or secrets.
- Prefer changes that degrade gracefully (a failed optional enrichment shows a clear "unavailable"
  state) over ones that take the whole request down.
- If a change is risky enough to want a fast rollback path, say so in the PR description — that's
  a fact for the reviewer and the on-call, not an implementation detail to bury in the diff.

### 8.1 When it breaks anyway — incident response & postmortem

All the gates above lower the odds; they don't reach zero. So the process names what happens *after*
a production incident, and closes the loop back into itself:

- **Runbook first** — a cross-cutting or user-facing critical path ships with a one-paragraph
  runbook: the symptom to watch (the metric/alert from §8), the first mitigation (usually the §9
  rollback or a feature-flag kill-switch), and who to page. A path with no runbook is a §8 gap.
- **Mitigate before diagnose** — the first move is to stop user harm (roll back / flip the flag),
  not to root-cause live. CD's tested rollback (§9) is what makes this cheap.
- **Blameless postmortem** for any user-facing incident — what happened, timeline, contributing
  causes, and the *systemic* fix. The question is "what let this reach production", not "who wrote
  it".
- **The loop closes into the backlog** — every postmortem action item becomes a tracked issue
  (§6 Issue Discipline); a common one is the missing test or gate that would have caught it, fed
  back into §3/§4. An incident with no follow-up issue is an incident the process didn't learn from.

---

## 9. Continuous Delivery Pipeline

The whole process converges here: **every merge to `main` is, by construction, releasable.** The
pipeline is the release decision, not a person — so the tests of §3 are not a safety net *beside*
delivery, they *are* the gate that makes delivery safe. The pipeline is one script (§5) run as a
staged cascade; a red stage stops the line.

**Stage cascade** — each stage is cheaper feedback before the more expensive one runs:

```
validate → lint + unit + integration → build image → deploy(ephemeral) → smoke → acceptance/e2e
   └──────────────── merge to main ────────────────┘
        → deploy(prod, canary/blue-green) → prod smoke + SLO watch → auto-rollback on breach
```

- **One immutable artifact flows through all stages.** The image built once (12-Factor V) is the
  image smoke-tested, acceptance-tested, and — after merge — promoted to production. Nothing is
  rebuilt per environment; environments differ only by injected config (§2.3, 12-Factor III).
- **Ephemeral environment per change.** The pipeline stands up a throwaway stack (this repo:
  `docker compose` base + `ci`/`e2e` overlays — see Appendix), runs §3.5's acceptance tier against
  it, and tears it down. This is where "tried on the real app, end-to-end" actually happens.
- **Post-deploy smoke first, always.** Before the full E2E suite (and again in production after
  promotion) a tiny smoke test proves the deployed instance is alive and serves a golden-path
  request — a broken deploy fails in seconds, not after a ten-minute suite.
- **Decouple deploy from release with feature flags.** Unfinished work can be merged and deployed
  dark behind a flag; this is what lets small PRs (§6) flow continuously instead of piling up on
  long-lived branches. Exposure to users is a config flip, not a deploy.
- **Progressive delivery to production** — canary or blue/green, watched against SLOs / the error
  budget, with **automated rollback on breach**. This is the production-side other half of §8: the
  same observability that answers "how will we know if it breaks" is what arms the rollback.
- **The rollback path is itself tested**, not assumed. A rollback nobody has exercised is a hope.

### 9.1 Zero-downtime schema changes — the enabler CD stands or falls on

App rollback (above) is easy; the database is where unattended delivery actually breaks. A schema
change that the *previous* app version can't run makes rollback impossible and forces a maintenance
window — the opposite of CD. So schema evolution follows **expand/contract**:

1. **Expand** — add the new column/table/index in a backward-compatible migration; the old code
   keeps working against it. New columns are nullable or defaulted; nothing is renamed or dropped
   in place.
2. **Migrate & deploy** — ship code that writes both old and new shape (or reads new, falls back to
   old); backfill data as a separate, resumable step.
3. **Contract** — only once every running instance uses the new shape, a *later* release removes the
   old column/table.

Rules that keep this safe: migrations are **forward-only and idempotent** (never an in-place
edit-and-hope), run as a **release-phase admin task** (12-Factor XII) **before** the new code takes
traffic, take an explicit **lock** but keep it short (perspective 4, §6), and every migration is
paired in review with the question *"can the currently-running version survive this?"* — if no, it
must be split into expand/contract steps. A destructive migration bundled with the feature that
needs the new shape is a finding.

### 9.2 Feature-flag lifecycle — flags are debt with an expiry date

Flags (above) decouple deploy from release, but a flag that outlives its rollout becomes dead
branching that hides which path actually runs in production.

- Every flag is **created with an owner and a removal trigger** ("delete once REQ-NNN is fully
  rolled out" / a date), tracked as an issue (§6).
- A **fully rolled-out or abandoned flag, plus its now-dead branch, is deleted** — flag removal is a
  normal follow-up PR, not optional cleanup.
- **Long-lived operational kill-switches** (the §8.1 incident lever) are the deliberate exception —
  marked as such so they aren't mistaken for stale rollout flags.
- A stale flag with no owner or removal trigger is a finding, same as any other untracked debt.

A change that cannot ride this pipeline unattended to production is not Continuous Delivery — it is
a manual release with extra steps, and the gap is a finding (perspective 4, §6).

---

## 10. AI Agent Guidance

This skill is vendor-neutral and stack-agnostic on purpose. A project should pair it with:

- a **stack appendix** (below) filling in the actual commands, and
- an optional **vendor-specific overlay** (e.g. a `<project>-claude` skill) for model defaults,
  thinking-effort settings, and terse-style preferences — the same split ElliotWaveAnalyzer uses
  between its vendor-neutral `elliottwave-agents` skill and the `elliottwave-claude` overlay.

An agent applies Sections 0–9 automatically, on every change, without being asked — the same way it
would not need reminding to write a test.

---

## 11. Closing the loop — run the review

The Reviewer Protocol and the eight perspectives (§6) describe the *shape* of a review; the
[`code-review`](../engineering/code-review/SKILL.md) skill is how it is actually run. Before a PR is
marked Done (§7), review the diff with `code-review` — it runs the Standards axis (does the code
follow this repo's documented standards?) and the Spec axis (does it match what the originating
issue/PRD asked for?) as parallel sub-agents and reports them side by side.

So the process bookends every feature with a skill: it opens with
[`grill-with-docs`](../engineering/grill-with-docs/SKILL.md) (§0.1) to sharpen the plan and
produce the docs, and it closes with [`code-review`](../engineering/code-review/SKILL.md) to verify
the result against both the standards and the spec.

---

## Appendix: Stack Adaptation

Stack: pnpm-workspace TypeScript monorepo (ADR-0003/0014). Node ≥ 22, pnpm ≥ 10.
Run `pnpm install` once (it wires the git hooks via `core.hooksPath`).

| Gate | Command |
|------|---------|
| Full local gate (mirrors CI) | `./test.sh` (or `pnpm gate`) |
| Build | `pnpm build` (`pnpm -r build`) |
| Lint / format check | `pnpm lint` · `pnpm format:check` (fix: `pnpm format`) |
| Unit / pure-logic tests | `pnpm test` (`vitest run`) · watch: `pnpm test:watch` |
| Integration / acceptance tests | _added with the backend skeleton (#3); same `vitest run`_ |
| Coverage report | `pnpm coverage` — ≥ 90% gate on `packages/domain` |
| Type check | `pnpm typecheck` (`pnpm -r typecheck`, `tsc --noEmit`) |
| Docs staleness | `pnpm check:docs` (dead links · dangling ADR refs · orphan diagrams) |

### Delivery: containers & pipeline

The release artifact is a container image; the ephemeral test environment (§3.5, §9) is a Docker
Compose stack with per-context overlays. `main`-branch CI lives in `.github/workflows/ci.yml` and
runs the cascade `validate-compose → lint + test → build → smoke`.

| Purpose | Command |
|---------|---------|
| Bring up the baseline stack | `docker compose up -d` · tear down: `docker compose down -v` |
| CI environment (base + CI overlay) | `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d` |
| E2E / acceptance environment (base + E2E overlay) | `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d` |
| Validate all compose combinations parse | `docker compose -f docker-compose.yml [-f <overlay>] config` |

The compose files are currently a single idle baseline container — honest placeholders that define
the pipeline *shape*; real service images, the acceptance suite, and the prod-promotion stage grow
into this skeleton as the app packages land. Update this table and §9 as they do.
