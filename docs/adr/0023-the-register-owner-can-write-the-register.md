# ADR-0023 — The Requirements Register's owner can write it; the evidence is checked by CI

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Stakeholder (NexusHero)
- **Context tags:** delivery method, requirements traceability
- **Arises from** the REQ-010 status ruling on [PR #247](https://github.com/NexusHero/Steuereule/pull/247#issuecomment-5170258284)
  and its implementation in [PR #249](https://github.com/NexusHero/Steuereule/pull/249)
- **Applies** [ADR-0021](0021-controls-are-proven-by-breaking-them.md)'s standard — a control is only a
  control if it can fail — to the register itself
- **Adjusts** [ADR-0018](0018-scrum-master-reinstated.md), which returned register state to the Scrum
  Master without noticing that the seat could not open the file

## Context

`docs/requirements/register.md` is the living source of truth for what this product has actually
delivered. ADR-0018 named the Scrum Master (Suhay) as the owner of its state.

He could not write it. The role holds `Read`, `Grep`, `Glob` and the GitHub tools — no `Edit`, no
`Write`, no `Bash`. So the file was in fact maintained by **whichever developer's slice happened to
land in it**, writing down a meaning the owner held and the writer had to infer.

That is not a hypothetical seam. It tore five times, and the tear has a consistent shape: a status is
set when the slice that writes the row merges, and is then read again only by whichever slice *next*
touches that same row — never on its own schedule.

- **REQ-010** read `Done`/`green` while one of its own cited tests
  (`trusted-proxies-ip-resolution.test.ts`'s A1) is a permanent regression test that stays green
  **because** the single-value `X-Forwarded-For` rate-limit bypass is unfixed. PR #247 did exactly what
  the process asked — append test paths to the evidence column — and produced a wrong row, because
  nothing asked it to read the status line above the cell it was editing.
- **REQ-004** carried "no REQ-004-tagged acceptance test of its own" at three places. The tagged tests
  (`profile.integration.test.ts:248-363`, REQ-004.1–.6, real Postgres) had landed **five days before**
  the reconciliation that recorded the gap (`08099ac`, 2026-07-23, vs `d650a03`, 2026-07-28). The claim
  was untrue on the day it was written.
- **REQ-002/REQ-009** still required `SameSite=strict` after ADR-0011 and ADR-0012 §3 deliberately
  superseded it with `SameSite=None; Secure`; code and tests had moved, the register had not.
- **REQ-002**'s traceability row cited *source files* in a column headed `Location` for a test. A source
  file cannot be green.

The common cause is not carelessness. It is that the person who knew what the row meant could not
type it, and the person who could type it was guessing.

## Decision

**1. The register's owner gets write access to it.** The `scrum-master` role gains **`Edit`**.

**2. The grant is deliberately partial, and the partition is the point.**

| | Suhay | enforced by |
|---|---|---|
| Change an existing document | yes (`Edit`) | tool grant |
| Create a file | **no** (no `Write`) | tool grant |
| Run a command, a test, a commit | **no** (no `Bash`) | tool grant |
| Land a change on `main` by himself | **no** — no commit path | tool grant |
| Touch code, tests, CI config, ADRs | **no** | *written obligation + the review gate* — see Consequences |

He writes the **meaning**: status, statement, Given–When–Then, which issue it serves, what the row
claims. He does not certify the **evidence**, because he cannot run what he cites.

**3. CI checks the evidence, so the split does not rest on trust.** A `register-check` gate
(Salih's to build) turns the four mechanical properties into checks that go red:

1. every cited path exists;
2. every cited file is actually executed by a CI job (matched against the vitest globs), so a citation
   cannot point at a test nothing runs;
3. a **bidirectional** `REQ-NNN` tag reconciliation — every tag in the test tree appears in the
   register, and every register citation points at a file that really carries the tag it claims. This
   check would have gone red on the REQ-004 defect on 2026-07-23, five days before a human recorded it
   as a gap that did not exist;
4. `Status` and `State` values come from the declared vocabularies, which also catches the register
   drifting out of its own language (ADR-0006: the development process is English).

Plus the one that closes the REQ-010 class, which needs a marker in the **test source** rather than in
prose: a test that documents an unfixed defect carries `@documents-defect #NNN`, and the gate requires
both that the register's citation of that file carries the corresponding flag **and that the referenced
issue is still open**. The day the defect ticket closes is then automatically the day the register row
goes red until someone re-reads it.

**4. What is explicitly *not* decided as a control.** "Whoever touches a REQ row re-reads the whole
row" was proposed and is **rejected as a mechanism**. Delete that sentence and every test still passes:
by ADR-0021's own scope test it is an agreement, not a control. It survives only as the human residue —
attached to the refinement block, where the REQ row a slice touches is read out as part of the DoR,
with a second person in the room — never as a standing promise nobody triggers.

## Alternatives considered

- **(2) Declare the register developer-maintained, with Suhay ruling on status semantics at
  refinement.** The lead's recommendation. Rejected by the stakeholder: it formalises the guessing
  rather than removing it, and leaves the owner of a document unable to correct it without a relay.
- **(3) Let the CI check be the only owner.** Rejected: the checks are mechanical by construction.
  Whether a requirement is genuinely `Done` is a judgement about what was promised, and no gate makes
  it. A check with no owner behind it turns "green" into the whole answer, which is the failure this
  ADR is about, one level up.
- **Give the Scrum Master the full developer toolset** (`Bash`, `Write`) so he can commit his own
  edits. Rejected: it makes the Scrum Master a developer, which was not decided, and it would let a
  register row reach `main` without passing a review gate.

## Consequences

- **The seat can now do its job.** The meaning and the ability to write it sit in the same place for the
  first time.
- **His edit still goes through the gate.** With no commit path, a register change rides the branch in
  flight and reaches `main` only through a PR that Musti reviews and Salih tests. This is a feature: a
  register editable straight on `main` would be a new hole in the wall this ADR closes.
- **The scope limit is honest about what holds it.** The tool grant cannot express a path restriction —
  agent frontmatter grants tools, not paths, and a project-wide permission rule would restrict the
  developers too. So "documentation only" is a **written obligation**, and the thing that catches a
  breach is the **review gate**, which catches it reliably precisely because every edit has to appear in
  a diff someone reads. What the tool grant *does* enforce is narrower and real: no new files, no
  commands, no independent landing path. Recorded plainly rather than dressed up as enforcement,
  because a paper control counted as a real one is the exact mistake ADR-0021 exists to prevent.
- **`register-check` is the load-bearing half of this decision.** Until it runs, item 3 is a plan and
  the split between "writes meaning" and "certifies evidence" is only a convention. The gate's own
  status should be visible, not assumed.
- **A future re-read of this ADR should ask** whether check 5's `@documents-defect` marker was actually
  adopted by the tests that need it. A marker convention nobody applies degrades into the same
  unenforced agreement this ADR rejected in item 4 — it just fails one layer later.
