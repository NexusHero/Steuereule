# ADR-0019 — oxlint replaces ESLint/typescript-eslint as the static-lint gate

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Stakeholder (NexusHero), on Musti's technical refinement
- **Complements** [ADR-0010](0010-ci-postgres-and-boot-smoke.md) (CI is the real gate)
- **Context tags:** tooling, supply chain, CI

## Context

`pnpm lint` has been failing repo-wide. The cause is not configuration:

```
Error: typescript-eslint does not support TS 7.0.
  at .../typescript-eslint@8.65.0/dist/index.js:52:11
```

`typescript-eslint` throws at **module load**, before it reaches a single rule. This repo pins
**TypeScript 7.0.2** — a deliberate Sprint 1 (T1) decision — and typescript-eslint is architecturally
coupled to the TypeScript compiler API, which it does not yet support at 7.x
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).

Worse, the failure was invisible. `.github/workflows/ci.yml`'s `lint` job ran
`echo "TODO — no lintable packages yet; baseline is empty."` while being wired as a real gate via
`needs: [lint, test, integration]`. It therefore **blocked the pipeline while checking nothing**, and
had been passing in about three seconds on every run. A gate with authority and no content is worse
than no gate: it reports safety it never established. This is the same class of defect ADR-0010 was
written to close, in the one job ADR-0010 did not reach.

Tracked as [#113](https://github.com/NexusHero/Steuereule/issues/113), deliberately gated on a
stakeholder escalation because it turns on adopting a new tool.

## Decision

**Adopt `oxlint` as the repo's static-lint gate. Remove ESLint, typescript-eslint, `@eslint/js` and
`globals` entirely.**

oxlint carries **its own parser** and does not hang off the TypeScript compiler API, so it works
against TS 7 today. Type-aware rules are not enabled in this decision (see §4).

### 1. The premise was verified, not assumed

A decision to adopt a tool that "should work" is worth nothing until someone has watched it work on
*this* codebase. Before designing anything, oxlint 1.76.0 was run against the real tree:

- **215 `.ts`/`.tsx` + 15 `.js`/`.mjs` files parsed, zero parse errors**, in 0.11s for the whole repo.
- Because a linter that fails to parse a file can silently contribute **zero** findings — and would
  look identical to a clean pass — the three risky constructs were **mutation-proved**. A violation
  was appended at end-of-file to a real file of each kind; a finding reported at EOF proves the whole
  file above it parsed:

| Construct at risk | File used as the probe | Result |
|---|---|---|
| NestJS decorators (`@Injectable`, `@Controller`) | `apps/api/src/auth/user-context.guard.ts` | EOF violation flagged — full parse |
| ESM `.js`-extension imports | `apps/api/src/prisma/encrypted-prisma.provider.ts` | EOF violation flagged — full parse |
| RN-Web `.tsx` (≈500 lines) | `apps/mobile-web/src/screens/DatenschutzScreen.tsx` | EOF violation flagged at line 495 — full parse |

### 2. The ruleset earns its place, rule by rule

The findings must not choose the ruleset — otherwise the gate is a rationalisation of whatever the
tool happened to emit. The categories were therefore argued first, and only then was the result fixed.

**Category sensitivity, measured on this repo:**

| Categories enabled | Findings |
|---|---|
| `correctness` only | 12 |
| `correctness` + `suspicious` | 51 |
| + `pedantic` | 272 |
| + `style` | 4,242 |
| `restriction` | 1,373 |

**`correctness` alone is too thin.** It omits `no-shadow`, which is the single most valuable rule this
repo actually needs (§2.1), and `no-extraneous-class`.

**`pedantic` and above are a different project.** 272+ findings is a codebase-wide restyling, not a
gate. They also encode opinions (naming, ordering, preferred idioms) this team has not agreed to; a
gate should enforce what we believe, not what a tool's default happens to be.

**`correctness` + `suspicious` is the honest middle** — but four of its rules do **not** earn their
place here, and are switched off explicitly rather than absorbed:

| Rule | Findings | Ruling |
|---|---|---|
| `unicorn/no-array-sort` | **26** | **Off.** The rule exists because `Array#sort()` mutates in place. Every one of the 26 hits sorts a **demonstrably fresh** array — `Object.keys(x).sort()`, `xs.map(...).sort()`, `[...new Set(xs)].sort()`, or a literal `['a','b'].sort()`. The hazard it guards against is absent from all 26. A 100% false-positive rate is not a gate, it is training people to ignore the linter — and 26 mechanical edits to satisfy it would have bought exactly zero safety. |
| `unicorn/no-invalid-fetch-options` | 2 | **Off.** Both are false positives: `body` resolves to `undefined` for the GET callers, which is legal. The rule cannot see that `method` is a runtime parameter. Keeping it would force a rewrite of `e2e/cross-origin/run.mjs` — *the cross-origin gate itself* — for no safety gain. Letting a linter reshape a critical gate to satisfy a false positive is the tail wagging the dog. |
| `unicorn/consistent-function-scoping` | 2 | **Off.** It flags a helper defined inside the test that uses it, asking for it to be hoisted. Locality is a legitimate — often better — choice. This is an organisational opinion, not a defect class. |
| `eslint/no-underscore-dangle` | 1 | **Off.** `__getValue` on a test double is a deliberate, conventional marker for a test-only escape hatch. Pure naming opinion. |

**Rules that do earn their place:**

- **`eslint/no-shadow` (9).** The strongest justification in the set. Seven hits are the destructured
  `{ url, method, body }` inside `page.evaluate(...)` in `e2e/cross-origin/run.mjs` and
  `e2e/google-auth/google-login.mjs`. That callback is **serialised and executed in the browser** — it
  captures *nothing* from the enclosing Node scope. A reader who believes those names refer to the
  outer ones is wrong in a way that is invisible and, if someone ever deleted the argument-passing to
  "simplify", silently broken. This is precisely the confusion `no-shadow` exists to prevent, sitting
  on a serialisation boundary in CI-critical code.
- **`eslint/no-unused-vars` (3).** Verified additive: `tsconfig.base.json` enables `strict`,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` but **not** `noUnusedLocals` or
  `noUnusedParameters`. `tsc` does not catch these; this rule is not duplicating the typecheck.
- **`eslint/no-unsafe-optional-chaining` (1).** Genuine correctness — `(a?.b).c` throws at runtime.
- **`typescript/no-extraneous-class` (7 → 0).** Kept, with the decorator carve-out below.

**Result: 13 findings, all genuine, none requiring design judgement.** The stakeholder ruled that all
13 are fixed inside the slice rather than suppressed — a baseline of accepted-but-unfixed findings
would be the same decoy this ADR exists to delete.

### 3. Config carve-outs carried across from `eslint.config.js`

The old config encoded two pieces of hard-won knowledge; neither is lost:

- **NestJS modules are legitimately empty.** The old config disabled `no-extraneous-class` for all of
  `apps/api`. oxlint expresses this better: `{"allowWithDecorator": true}` keeps the rule live for
  genuinely extraneous classes while exempting decorated ones. **Verified: clears all 7, repo-wide.**
- **Test files may use non-null assertions.** This is **moot** under the chosen ruleset:
  `typescript/no-non-null-assertion` lives in `restriction`, which is not enabled. Recorded here
  deliberately rather than silently dropped — but *not* written into the config, because an override
  disabling an already-disabled rule is dead config that would mislead the next reader.
- **A suppression needs a justification.** The old `ban-ts-comment` rule
  (`ts-expect-error: allow-with-description`) encodes an honesty norm this project actually lives by,
  so its survival was checked rather than assumed. **oxlint has `typescript/ban-ts-comment` with the
  same option**, but it sits in `pedantic`, so it is **enabled explicitly as a single rule** — it
  would otherwise have evaporated silently. Mutation-proved live: a bare `// @ts-expect-error` is
  flagged, and one carrying a description passes.

### 4. Type-aware linting is **deferred and re-openable — not surrendered**

The escalation was framed as trading type-aware rules away permanently. **That framing is wrong, and
correcting it matters more than the decision it accompanied**, because a false constraint written into
this log would stop a future reader from ever re-checking.

oxlint ships `--type-aware`, backed by a separate `oxlint-tsgolint` package. Critically, tsgolint is
built on **typescript-go — the engine that *is* TypeScript 7**. It does not consume the repo's
`typescript` package or the TS 5/6 compiler API, which is exactly why typescript-eslint breaks here
and this does not. Verified:

- Mutation-proved on a scratch project: `typescript/no-floating-promises` and
  `typescript/await-thenable` both fired correctly.
- Run against real `apps/api/src` **at TS 7** — worked, surfacing `restrict-template-expressions` in
  `apps/api/src/cors/apply-raw-cors-headers.ts:26`.

It is **not** adopted in this ADR because it is a genuinely separate cost decision: an extra
dependency, a materially slower run, and its own CI budget — none of which should ride along
unargued on a slice whose job is to make the existing gate real. Strict `tsc` continues to carry the
type load. Re-opening this is a follow-up with its own evidence, not a new investigation.

### 5. The `--config` trap, and why the config file lives where it does

`.oxlintrc.json` sits at the **repo root and is auto-discovered**. It must never be passed via
`--config`, because in oxlint 1.76.0 **`ignorePatterns` is silently inert when the config is supplied
that way** — measured directly: `finanzo-funke-design-system/**` was in the ignore list and still
produced 276 findings via `--config`, and 0 when auto-discovered.

This is called out because it is the same defect class as the placeholder CI job: a mechanism that
appears to control behaviour and does not. Anyone changing how lint is invoked must **prove the ignore
list still takes effect**, not assume it.

### 6. Scope of this ADR

Deliberately **not** included, and owned by others on the same branch:

- **Wiring and proving the CI `lint` job — Salih.** `.github/workflows/ci.yml` is left untouched here
  so his mutation proof runs against the job as it actually is. The gate is real only when a
  deliberate violation is pushed and the **CI** job is watched to fail (and `build`/`smoke` to skip) —
  a local red is not the proof, per ADR-0010.
- **The 13 code fixes — Kaan (`apps/mobile-web`, `packages/ui`) and Robin (`e2e`).**

## Consequences

**Positive**

- `pnpm lint` runs again, for the first time in the project's life, and **fails correctly** (exit 1)
  on real findings.
- **The supply chain shrinks substantially: 63 packages removed, 2 installed** (`oxlint` plus one
  platform binding; the other 18 bindings are lockfile-only `optionalDependencies`). **Net −61
  installed packages.** oxlint has no transitive JS dependencies. This is the strongest argument for
  the change — stronger than the TS 7 compatibility that forced the question.
- The whole-repo run is **0.11s**, so the gate is cheap enough to sit early in the pipeline and in a
  pre-commit hook later without anyone resenting it.
- The TS 7 pin is no longer hostage to a linter's release schedule.

**Negative / accepted**

- **Type-aware rules are not running today** (§4) — deferred, with a proven path back.
- **A native binary replaces a JS toolchain.** Less inspectable in `node_modules`, and it introduces a
  per-platform binding. Accepted against a 63-package reduction in transitive surface.
- **A new vendor.** oxc is younger and less battle-tested than ESLint. Mitigated by the fact that the
  lint gate is advisory-by-nature and the compliance-critical guarantees rest on tests against real
  Postgres (ADR-0010), not on lint.
- **Rule parity is not exact.** Four `suspicious` rules were switched off with reasons (§2), and
  future oxlint releases may move rules between categories — which would change the gate silently. A
  version bump therefore deserves a re-run of the finding count, not a blind merge.

## The dependency ruling, recorded so the precedent is usable

Musti's standing rule is that a new framework/library/dependency is a stakeholder decision, and that
the trigger is **new capability**, not an existing edge becoming explicit (as ruled for
`@fastify/cors`). Applied honestly here:

**This is not new capability.** Linting already existed in the tree — `eslint`, `@eslint/js`,
`typescript-eslint` and `globals` were all present devDependencies with a root config and a `lint`
script. This is a **vendor swap for an existing, currently-broken capability**, and by the
`@fastify/cors` standard alone it would have been a weaker trigger.

**It was escalated anyway, correctly, for a different reason: new vendor and new supply-chain
surface.** A Rust-authored native binary from a maintainer we have no history with is a strategic call
even when the capability it replaces is already present.

**The precedent, stated for reuse: escalate on _new capability_ OR _new vendor/supply-chain surface_.**
Either is sufficient. The earlier `@fastify/cors` ruling named the first; this one adds the second.

## Alternatives considered

- **Wait for typescript-eslint to support TS 7.** Rejected: no committed date, and it leaves the repo
  with a fake gate in the meantime. The pipeline has already shipped without static lint for the
  project's entire life; extending that indefinitely on someone else's release schedule is not a plan.
- **Drop back to TypeScript 5.x.** Rejected, and worth being explicit about because it inverts the
  dependency order: the TS 7 pin is a deliberate T1 decision, and the linter is a *tool serving* the
  codebase. Downgrading the language to satisfy a tool is the wrong way round. **The correct lesson
  for a future reader hitting a similar conflict is "decouple from the compiler API", not "unpin
  TypeScript."**
- **Delete the `lint` job and stop pretending.** Honest, and better than the status quo, but it gives
  up a real gate this codebase can cheaply have.
- **Keep ESLint alongside oxlint.** Rejected. ESLint cannot execute at all at TS 7, so a retained
  config is a decoy, not a fallback — and two linters behind one `lint` script is precisely the drift
  source this project has been removing.
- **Biome.** A credible alternative with a similar architecture. Not evaluated in depth once the
  stakeholder ruled on oxlint; recorded so the next reader knows it was not overlooked.
