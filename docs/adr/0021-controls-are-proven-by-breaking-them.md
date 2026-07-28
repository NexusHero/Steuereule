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
| `turbo.json` `"lint": {}` | a task | no package implements it | ADR-0019 |
| `ignorePatterns` via `--config` | an ignore list | silently inert in oxlint 1.76 | ADR-0019 |
| bare `oxlint` | a check | reports findings, exits 0 | ADR-0019 |
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

**Scope — what this does not require.** Ordinary feature code is out: its tests are already the proof,
and demanding a mutation for every function would be ceremony. This applies to the narrower set above:
things whose entire value is that they *prevent* something. If a change would still be correct with the
control deleted, the control is what needs proving.

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
