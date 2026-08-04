# ADR-0021 — A control is proven by breaking it, not by watching it pass

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Stakeholder (NexusHero)
- **Builds on** [ADR-0010](0010-ci-postgres-and-boot-smoke.md) — *Postgres in CI: service-container for
  the test/smoke jobs* — whose context section is the earliest statement of this problem in the log: a
  compliance guarantee "asserted by a real test that never runs anywhere repeatable", and a CI with no
  stage that boots the real server, which hid both a missing dependency and the first CORS gap. Also
  builds on [ADR-0019](0019-oxlint-replaces-eslint.md) (static lint). Extends the evidence block
  defined in `docs/process/delivery-pipeline.md`.
- **Context tags:** quality, delivery method

## Context

This project keeps hitting **one defect class**, not many. In a single working day it appeared at
least nine times, in nine different subsystems, and every instance had the same shape:

> **A mechanism that appears to control behaviour, and doesn't.**

| Instance | Looked like | Actually was | Where |
|---|---|---|---|
| `Content-Disposition` | a header the client reads | not CORS-exposed; unreadable in a browser | #152, F3 |
| CI `lint` job | a gate, wired via `needs:` | `echo "TODO"`, green in 3s | #113 |
| CI `build` job (`ci.yml:148`) | a gate | the same `echo "TODO"` shape | found reviewing this ADR |
| `turbo.json` `"lint": {}` | a task | no package implements it | ADR-0019 |
| `ignorePatterns` under `--config` **pointing outside the scan root** | an ignore list | silently inert; even `**/sub/**` does not rescue it | ADR-0019 |
| `oxlint` **at warning severity** | a check | reports findings, exits 0 | ADR-0019 |
| `Button`/`Chip` `style` prop | public API, 12 call sites | destructured, never applied | #173, #176 |
| `prisma db seed` | a seed run | no-op, missing `prisma.seed` config | #111 |
| `smoke` CI job | caught the CORS gap | sent no `Origin` header | #107 |
| `?? screen.getByText(...)` | a tolerated alternative | unreachable; `getByText` throws | #153, F5 |

Two properties unite them, and both matter for the fix:

1. **The thing was declared but not connected.** Nothing was misconfigured or miscomputed; the wiring
   was simply absent, and absence produces no error.
2. **The check that should have caught it passed either way.** `curl` reads a non-exposed header
   happily. A test that imports the config it asserts proves `x ∈ x`. A job that runs `echo` reports
   success truthfully. In each case the observer could not distinguish "working" from "absent".

The second property is why these survive review. They are not subtle in hindsight — they are
*invisible to the instrument*, and the instrument reporting green is exactly what stops anyone
looking further.

**Two rows carry conditions, and how those conditions were found is itself the argument.** Reviewing
this ADR, Musti's first three attempts to reproduce the `ignorePatterns` row **contradicted it** — a
co-located config honours the ignore list correctly, and he was close to reporting the row as wrong.
Only when he tried the shape this repo actually runs, `--config` pointing outside the scan root, did
the file that should have been ignored get silently linted; even `**/sub/**` did not rescue it. The
`oxlint` row is likewise severity-dependent: it exits 0 at warning severity, and the reason it exits 1
here is that `correctness`/`suspicious` are configured as errors.

Watching it pass three times taught him nothing. Only breaking it **in the shape it actually runs**
found the gap — which is this ADR's own thesis, re-derived by someone trying to disprove its table.

Three of the nine were caught by luck or by a person happening to look twice. One — the `style` prop —
was caught by ADR-0019's linter **on its first run**, which is evidence that part of this class is
mechanically detectable and worth saying out loud.

## Decision

**A control is not established until it has been observed to fail.**

A **control** is anything whose purpose is to constrain, block, or guarantee: a CI job, a linter or
tool configuration, an ignore/allow list, a security header, an authorization check, a rate limit, a
regression test guarding a specific defect, a seed or migration step something else depends on.

**A pull request that adds or changes a control carries one line in its evidence block naming what was
broken and what failed as a result.**

```
- Control proof: removed `exposedHeaders` → `Cross-origin browser smoke` failed with
  "response.headers.get('content-disposition') was null"; restored → pass.
```

Without that line the control is **unproven**, and the reviewer treats it as absent. Passing is not
evidence; passing is the state the broken version was also in.

Two supporting rules, both already practised and neither new:

- **The proof runs where the control runs.** A CI gate is proven by a **red CI run**, not a red local
  run — ADR-0010 made the same point about tests that exist but run nowhere repeatable. A
  browser-enforced behaviour is proven in a **browser**, not in `curl` or Node `fetch`, neither of
  which enforces CORS at all.
- **A check states its expectation independently of what it checks.** A test that iterates the same
  array the implementation produces asserts nothing and passes for any value, including empty. Where
  the choice is duplication or tautology, take the duplication.

**Scope — the test is observable, not a judgement call.**

> **If deleting it would leave the existing suite green, it needs proving.**

Ordinary feature code is out: delete it and the suite goes red, because its tests are already the
proof. Demanding a mutation for every function would be ceremony.

This test replaces the first draft's, which defined a control by category ("constrain, block,
guarantee") and then tested it with "would the change still be correct without it". Those two
disagreed, and the review found the disagreement **using this ADR's own table against it**: the
`Button` `style` prop is not a control by the category definition, so the rule would not have caught
an instance the ADR itself cites. The replacement keys on the *instrument* rather than on a ruling
about correctness, which is the thesis of the whole document.

It also settles the ambiguous case the review predicted. `isValidSteuerId` is a control by category
and feature code by the correctness test — and correctly **in scope** by this one, since deleting it
leaves the suite green.

## Consequences

**Positive**

- The cheapest possible discipline against the most expensive class of bug here. Five of the nine
  instances would have been caught by one deliberate break each, taking minutes.
- It converts an existing informal habit into something checkable. The good runs already do this —
  a deliberately-dropped `exposedHeaders`, a removed `'DELETE'`, a planted lint violation, a stripped
  preflight trigger. What was missing is that skipping it left no trace.
- It gives the reviewer a specific question to ask instead of a general suspicion, which is the
  difference between a rule that is applied and one that is admired.

**Negative / accepted**

- **It costs time on every control-touching PR**, and the cost is real even when the control turns out
  fine. Accepted: the alternative is the table above.
- **Some controls are awkward to break** — a rate limit, a migration, anything with slow or stateful
  setup. Where a genuine break is impractical, the evidence line says so and states what was done
  instead. An honest "could not break this, here is why" is acceptable; silence is not.
- **A mutation proof proves the control fires, not that it fires on everything.** Planting one lint
  violation proves the linter reads files; it does not prove the ignore list is correct. The proof
  should target the property most likely to be silently absent — which is a judgement call, and this
  ADR does not pretend to remove it.

**Deliberately not decided here**

Whether to pursue the *static* half of this — lint rules or type-level constructions that make
"declared but not connected" unrepresentable. ADR-0019's linter already covers one instance of it
(unused-but-public props). Extending that is a separate cost decision and should not ride along
unargued.

## Alternatives considered

- **Rely on review to catch it.** What we were doing. Rejected on the evidence: these nine passed
  review precisely because the instrument said green, and a reviewer reading a diff cannot see that a
  passing check would also pass when broken.
- **Require a failing test for every change (mutation testing as a gate).** Rejected as
  disproportionate — it is the same idea applied to all code rather than to controls, and the cost
  scales with the codebase while the benefit concentrates in a small part of it.
- **Encode it as a checklist item in the process doc only.** Rejected for the reason ADR-0020 records:
  a load-bearing rule with no decision record behind it drifts, and the next reader cannot tell a
  decision from an edit.
- **Do nothing and accept the class as a cost of speed.** Defensible if the instances were cheap. They
  were not: two shipped to `main` (the CORS filename regression, the inert `style` prop), and one of
  those was found only because a merge conflict forced someone to look at the same line again.

## Amendment — 2026-08-04 (#258, #252, #239): break by deletion, and the exception that outlives its cause

Per the log's immutability rule (`docs/adr/index.md:5` — "never rewrite history"), the Decision above
stands unedited. This appends two rules that its own week of practice exposed. Both were learned from
controls that had a passing break-proof and a hole anyway.

### 1. Break by **deletion**, not only by corruption

The Decision says a control must be observed to fail. It does not say *how* to make it fail, and in
practice we almost always **corrupt a value** — change `expiresIn`, rename a key, write a wrong tier.
That tests only half of what a check does.

Most checks have two branches:

| Branch | Question | Broken by |
|---|---|---|
| **validity** | is the value it found acceptable? | corrupting the value |
| **existence** | is there a value there at all? | **deleting** it |

A check written as *"if a value is present, validate it"* is **vacuously satisfied by absence**. A
corruption proof goes red and certifies the control — while the missing case walks straight through.

**Measured, on this repo, the same day this was written.** `register-check`'s check 4 validates the
evidence tier in the register's `State` column. I proved it by corrupting one:

```
tier -> "green (bogus)"  -> FAIL: register.md:237/:238 tier "bogus" is not one of the declared tiers
restored                 -> PASS
```

Red on demand, restored clean — a textbook proof under the Decision above. But the sub-check only runs
once `state.match(/green\s*\(...\)/)` matches, so a `State` cell with **no tier at all** is skipped
silently. That is exactly how the defect arrived: a fix replaced two tier cells wholesale, both rows
lost their tier, `register-check` stayed green, and only re-reading the cells by hand caught it (#258
records the gap; #249 carried the regression).

**Rule.** A control proof breaks the subject by **removing** it wherever removal is meaningful — the
line, the marker, the citation, the list entry, the caller — and not only by making it wrong. Where
both are meaningful, both lines go in the evidence block:

```
- Control proof (validity): tier -> `green (bogus)` -> red; restored -> pass.
- Control proof (existence): tier removed entirely -> red; restored -> pass.
```

**Reviewer's test, one question:** *can this check pass on empty input?* If yes, the existence branch
is unproven and the control is unestablished, however green the corruption proof was.

This is the operational half of a more general shape: most of our escapes this week were **existence
claims checked as validity claims** — a missing tier, a missing caller, a missing route in a disabled
list, a missing marker, an unparseable date treated as an age. The fix is never a better pattern; it
is the reversed quantifier. Deletion is how you find out which kind you have.

### 2. An exception that outlives its cause is not caution — it is a blind spot

A suppression — `adr-check-ignore`, an `ignorePatterns` entry, a skipped test, an allowlist entry —
is written against a *specific* cause. When that cause is removed, the suppression does not become
harmless. **It silently removes the check's reach over whatever it still covers**, and it reads to the
next person as deliberate care.

**Measured (#252).** Two `adr-check-ignore` markers in `docs/adr/index.md` suppressed findings about
prose describing dangling ADR references. Both causes were later removed by other work: one token was
deleted outright (#260), the other's ADR came into existence (#251). The markers were then dropped.
Planting a genuinely broken reference in that file afterwards:

```
as-is                                    -> adr-check: PASS
a reference to a non-existent 4-digit
ADR number planted in index.md           -> FAIL: index.md:63 references <that number>,
                                                  which has no docs/adr/<that number>-*.md file
restored                                 -> PASS
```

(The planted number is described rather than written out. `adr-check` matches `/ADR-(\d{4})\b/`
across the whole tree, so spelling it here would make this very document fail the gate it is
describing — the same reason #260 deleted an offending token instead of masking the sentence
around it, per rule 2 above. Removing the cause beats suppressing the symptom, including here.)

Keeping the markers would have masked precisely that. **The cautious-looking option was the unsafe
one.**

**Rule.** A suppression carries, in the same place, the **cause** it exists for. When that cause is
resolved, the suppression is **deleted in the same change** — not left "just in case". A suppression
whose cause cannot be stated is already a finding. And prefer removing the *cause* to suppressing the
*symptom*: #260 deleted the offending token rather than masking the sentence, which is why #252 needed
no marker at all.

**Reviewer's test:** for every suppression a diff adds or keeps — *what would go red without it, and
is that still true?* If nobody can answer, it is not protecting anything.

### 3. An instrument that perturbs what it measures proves nothing

The Decision already says a check must state its expectation independently of what it checks. Its twin,
found three separate times in one day, is that the **measuring apparatus must not alter the thing under
measurement, or the run after it**.

Three independent instances, 2026-08-04:

| Instance | How the instrument corrupted the measurement |
|---|---|
| #239 F3 (frontend) | Spying on `clearTimeout` changed the object identity `vitest` checks when restoring, so `vi.useRealTimers()` silently failed and **every later test in the file ran on a fake clock** |
| #239 T1 harness | A position-based row selection revoked the wrong session, and a leftover ghost session skewed the next assertion — both in the harness, not the product |
| #261 (docs) | A regenerated SVG compared only against itself: "identical twice" with no baseline says the renderer is deterministic, not that the output was ever right |

**Rule.** Prefer the framework's own reported state over reaching into its internals — `vi.getTimerCount()`
over a global spy on a timer primitive. Where an instrument must be invasive, its blast radius is
established explicitly: assert the environment is restored, or scope it so the next measurement cannot
inherit it. And an instrument gets a **known-state calibration** — a reading where the answer is known
good and one where it is known bad — before its readings are used as evidence.

**Reviewer's test:** *would this instrument report the same thing if the subject were absent, and does
it leave the next run in the state it found?*

Corollary, from all three: **audit the instrument before attributing the reading to the product.** Every
instance above was found by the person operating the instrument, against their own work, before anything
was filed against the code under test. That is the expensive habit worth keeping.

### Consequences

- Evidence blocks get one extra line where the existence branch is meaningful. Cheap; it is one more
  edit and one more run of a check that already exists.
- Some existing controls are, by this amendment, **unproven** — their proofs corrupted and never
  deleted. They are not retroactively broken; they are retroactively *unverified*, and the honest
  handling is to say so when one is next touched rather than to re-prove the whole inventory now.
- This amendment does not close #258. That gap is check 4's inability to see a missing tier, and it
  needs a code change, not a rule. This says how the gap would have been found.
