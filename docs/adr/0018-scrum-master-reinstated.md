# ADR-0018 — Suhay (Scrum Master) reinstated; backlog, refinement and readiness leave the lead

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Stakeholder (NexusHero)
- **Partially supersedes** [ADR-0016](0016-crew-reduced-to-four-roles.md) (the Scrum Master half only;
  the Product Owner seat stays retired). **Amends** [ADR-0017](0017-public-draft-first-review-and-tiered-testing.md) §1.
- **Context tags:** delivery method, operating cost

## Context

ADR-0016 retired the Scrum Master seat and named the cost it was knowingly accepting:

> Board hygiene will decay without a role that owns it. Expect the backlog to need periodic cleanup
> rather than staying continuously groomed.

and

> More load on Musti: capacity, tiers, WIP and ticketing on top of review and architecture. Watch for
> the review gate itself degrading under that; if it does, the answer is to give the bookkeeping back,
> not to thin the review.

ADR-0017 then added a **mandatory refinement block** to that same seat, and repeated the warning in
its own words: *"if the review gate degrades under it, the answer is to reinstate a seat — most likely
the Product Owner, since the pressure is on requirements — not to thin the review."*

**The bill arrived, and it is measurable rather than felt:**

- **55 open issues**, of which at least a dozen are demonstrably delivered and merged — the REQ-013
  task set (#96–#100), the REQ-001 task set (#91–#94), the REQ-011 export endpoint (#127), and several
  `[Bug][Record]` tickets whose fixes are on `main` (#106, #107, #108, #110, #112). Nobody closed them
  because nobody owns closing them.
- **The Requirements Register drifted to eight wrong statuses and two missing REQs**, found only
  because someone happened to read it while choosing the next feature — and then drifted again within
  a day, still calling REQ-011 "In review" and the DSGVO sequencing gate "OPEN" after both had
  changed.
- **A single review round produced six findings needing six tickets**, none of which existed until the
  orchestrator filed them by hand. The reviewer had the responsibility and, that session, not even
  the tool.
- Two process holes in ADR-0017 (§7a, twice) were found by *running* it, not by anyone whose job was
  to check readiness before work started.

The review gate itself did **not** degrade — Musti's reviews this session were the sharpest on the
project, catching two blocking defects on an erasure path and refuting his own dev's proof as
answering the wrong question. That matters for what this ADR does and does not change: **the review is
not thinned; the bookkeeping is taken off it**, exactly as ADR-0016 prescribed for this case.

## Decision

**Reinstate Suhay as Scrum Master, with the seat as it was before ADR-0016.** `.claude/agents/scrum-master.md`
is restored from history rather than rewritten, with only the changes reality forces (see below). The
crew is five roles: Suhay, Musti, Kaan, Robin, Salih.

**What moves back from Musti to Suhay:**

| Held by Musti since ADR-0016 | Owner now |
|---|---|
| Backlog shape, prioritisation, board state | **Suhay** |
| Risk-tier assignment at readiness | **Suhay** (Musti keeps the right to bump **up**, never down) |
| The WIP limit (≤2 slices in the review+test queue) | **Suhay** |
| findings→tickets | **Suhay** files, prioritises and links; Musti reports the finding precisely |
| Requirements Register custody | **Suhay** |
| Capacity / keeping both devs loaded | **Suhay and Musti jointly**, as before |

**Refinement is a joint grilling, and it is a hard precondition (amends ADR-0017 §1).** Every task
begins with a `grillme` session run by **Suhay and Musti together**. Suhay grills the **story, scope
and readiness** — the REQ, the one Given–When–Then criterion, out-of-scope, which existing product
claim the change might make untrue, and the tier. Musti grills the **technical design** — the ADRs
touched, the seam, feasibility. **The stakeholder still rules on the result**, because what was
promised to the user is neither of theirs to settle.

**Neither half alone is a refinement**, and this is enforced from both ends: Musti's definition tells
him to stop and fetch Suhay if he finds himself grilling alone, and Kaan's and Robin's tell them to
send back work that arrives without the joint block or with only one half of it. ADR-0017 §1 already
had Musti drafting it solo; that is what changes here. The reason is the same one §7a settled on the
review side of the pipeline a day earlier: **someone grilling scope they defined themselves is the
same structural weakness as someone reviewing a PR they wrote themselves.** The refinement is where
scope, honesty and risk are decided, and everything downstream — the tier, the gate depth, the
register entry, the acceptance criterion the tests are written against — is derived from it. A
project without that step has no structure to derive anything from.

**Three things the restored definition could not keep, because they are no longer true:**

1. **Every reference to Matthias resolves to the stakeholder.** The Product Owner seat stays retired.
   Suhay's requirement questions go to the Requirements Register and the product/design ADRs first,
   and to the stakeholder only for what those genuinely don't settle. Escalation chain:
   **register + ADRs → Suhay → stakeholder.**
2. **The pipeline description was rewritten.** The old definition told Suhay that "a PR only opens
   once Musti's local review and Salih's local test have both passed". ADR-0017 moved both gates onto
   the draft PR, in public, and §7a settled who flips it. A restored role carrying a false description
   of the current process would misreport ticket state from its first turn.
3. **Milestone acceptance goes to the stakeholder**, not to a Product Owner — Suhay still triggers it
   and still turns its findings into tickets.

**Musti keeps `issue_write`** (granted by ADR-0017 §9) even though the board is Suhay's again, so a
finding is never blocked waiting on a hand-off. Ownership and capability are deliberately not the same
thing here: the record of *who curates the board* is what matters, not who is technically able to
create an issue.

## Consequences

**Positive**

- Someone's actual job is again "is this ready, is the board true, was this closed?". The evidence
  says nothing else does that work — not the orchestrator's task list, and not a reviewer with five
  other responsibilities.
- Refinement stops being a solo act by the person who also has to review the result. A reviewer
  grilling scope he defined himself is the same structural problem as a reviewer approving his own
  PR — which §7a just spent a day closing on the other side of the pipeline.
- The tier's assignment and its bump-up right sit in different seats again, restoring a one-way
  ratchet that was a single judgement while Musti held both.

**Negative / accepted**

- **This costs tokens, and that is what retired the seat.** ADR-0016 cut it because it produced no
  findings during a session where both gates did. That observation was true and is not withdrawn: a
  coordination seat *routes*, it does not discover. The judgement being made now is that the routing
  turned out to be load-bearing after all, and that an untrue board is a defect class of its own.
  Suhay runs **Sonnet**, not Opus, as before.
- **A fifth seat is a fifth thing the orchestrator plans around** — ADR-0015 recorded that as a real
  cost when Ogün's never-dispatched track imposed it. The mitigation is that Suhay is invoked at
  slice boundaries (refinement, readiness, findings, closing), not continuously.
- **Nobody's job is still "is this what we promised the user?"** in the full Product-Owner sense.
  Suhay carries the readiness half of it; the register and the honesty tests carry the rest. This is
  ADR-0016's accepted cost, only partially repaid.

## Alternatives considered

- **Reinstate the Product Owner (Matthias) instead.** ADR-0017 predicted this would be the seat to
  bring back, "since the pressure is on requirements". Rejected on the evidence actually available:
  the visible failures were *board* failures — unclosed delivered tickets, an untrue register,
  unfiled findings — not wrong requirements. Requirements answers have in practice been read
  successfully from the register and the ADRs, which was ADR-0016's whole argument for retiring that
  seat. If requirement *drift* shows up later, this ADR does not stand in the way of bringing
  Matthias back too.
- **Leave the seat retired and periodically clean the board.** ADR-0016's own plan. Rejected because
  it was tried: the cleanup did not happen on its own, and the register drifted a second time within
  a day of being reconciled by hand.
- **Give the bookkeeping to the orchestrator permanently.** This is what actually happened today —
  the orchestrator filed all six finding tickets and opened two PRs on Musti's behalf. It works, and
  it is exactly the "role that has to be couriered is a role the process routes around" failure
  ADR-0017 §9 named on the other side. A seat whose work is silently absorbed is a seat that does not
  exist.
- **Rewrite the seat into a new "backlog owner" role.** Rejected by the stakeholder: bring Suhay back
  as he was. The restored definition is the one from git history, changed only where it asserted
  something no longer true.
