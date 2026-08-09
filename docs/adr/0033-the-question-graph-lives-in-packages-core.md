# ADR-0033 — The interview's question graph lives in `packages/core`, and the server validates against it

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Musti (lead) — an engineering placement call; ruled in the
  [#318](https://github.com/NexusHero/Steuereule/issues/318) judgement and built as its task 0.
- **Applies** [ADR-0004](0004-testing-strategy.md) (pure, I/O-free logic, ≥90 % coverage) and
  [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (a control that cannot fail is not one).
- **Implements** [ADR-0031](0031-the-interview-is-three-questions-and-a-catalog.md) §1 and §4.
- **Context tags:** architecture, determinism boundary, interview

## Context

The interview is a question-by-question flow whose next screen depends on the answers so far. Three
placements were possible: in the web app, in the API, or once in the shared core.

Two of the three branches are not navigation. **Gewerbe** (product ADR-028) and **CH-only**
(product ADR-016/029) are honesty controls — they exist to stop the product from quietly accepting
a return it cannot produce. That changes the question from "where is this convenient" to "where can
this be enforced".

## Decision

**The graph is a pure function in `packages/core/src/interview.ts`, imported by both the web app and
the API. The API validates every incoming answer against it.**

```
nextStep(answers)            → { kind: 'question', id } | { kind: 'gate', id } | { kind: 'done' }
isReachable(answers, target) → boolean      // the server's admission check
isValidAnswer(step, value)   → boolean
remainingSteps(answers)      → number       // what TaxYear.openItems is written from
```

Three reasons, in ascending hardness:

1. **It is exactly the shape `core` exists for.** A flow is a pure function `(answers) → next step`.
   `cockpit.ts` is already this form, and `isValidSteuerId` is already the precedent for one
   definition imported by both sides.
2. **A round trip per tap would be a bad product.** Product ADR-016 fixes onboarding under 60
   seconds; the client needs the graph locally.
3. **And therefore the server needs the same graph.** If the client owns the only copy, the gates
   are advisory — precisely ADR-0021's defect class. So `POST` is admitted only when
   `isReachable(storedAnswers, questionId)` holds, using the same function the client renders from.

### Gates are answerable steps, not screens the client remembers

A gate the user has seen and carried on past is recorded like any other answer
(`GATE_ACKNOWLEDGED`). This is deliberate: it keeps `nextStep(answers)` a single-argument total
function, it makes "the user was shown this limit and continued" an auditable fact about the tax
year rather than client state, and it persists through the same `InterviewAnswer` row shape with no
extra model.

### A terminal gate admits nothing further

`job = 'Selbstständig'` returns the Gewerbe gate forever, and `isReachable` is false for every step
behind it. Product ADR-028 refuses to ship half a return; a purely self-employed return is entirely
the half we cannot do. `'Beides'` is different and passable — ADR-028 says so explicitly — which is
why the distinction is in the graph rather than in a screen.

### Citation form, so this class of error stops

The three-digit **product** log and the four-digit **engineering** log are different sources, and
conflating them has now caused two real defects: `schema.prisma` and `cockpit.service.ts` cite
"ADR-014/048" meaning the product log, where `docs/adr/0014` is an unrelated decision and
`docs/adr/0048` does not exist; and `Interview.jsx` was read as authoritative against product
ADR-016. From here: **`Produkt-ADR-016`** (three digits) versus **`ADR-0016`** (four digits, this
log). `packages/core/src/index.ts` is corrected in the same change.

## Consequences

- **One graph, two consumers, no drift** — the client cannot render a path the server would reject.
- **`remainingSteps()` counts questions, never gates**, and is 0 behind a terminal gate — an honest
  zero, not a finished one. It is a **minimum**; exact today because no branch in Segment 1 adds a
  question. ADR-0031 §3's catalogue breaks that, which is #318's own revisit trigger for deriving
  `openItems` on read instead of storing it.
- **ADR-0031 §4 is enforced by a test, not by care.** The suite asserts that each gate is not
  reachable before, and is reachable immediately after, the answer that determines it — the ordering
  defect the prototype has (`Interview.jsx:14, 52`) cannot come back through a port.
- **The tests name the identity of the next step, never merely its existence.** Both red paths were
  run: removing the Gewerbe branch fails 6 tests, making `isReachable` unconditionally true fails 6.
  Coverage on the module is 100 %.
- **Segment 2 extends this module** rather than adding one (ADR-0031 §3). A catalogue entry is a
  named set of question ids.

## Alternatives considered

- **Graph in the API only, client asks per answer.** Rejected on product ADR-016's 60-second budget,
  and it makes the client unable to render a back button without a round trip.
- **Graph in the client only.** Rejected: it is ADR-0021's defect class by construction — the two
  gates would be decoration, and #318's P2 could not be written at all.
- **Duplicate the graph on both sides.** Rejected: two copies of a branch condition is the drift the
  `isValidSteuerId` precedent was created to avoid, and the failure is silent.
- **Gates as ephemeral client state instead of stored answers.** Rejected: `nextStep` would need a
  second argument the server cannot verify, and "the user was told we cannot do this" would exist
  only in a browser — losing it in the DSGVO export and in any later dispute.
