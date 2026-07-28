# ADR-0020 — A draft PR opening triggers the review; nobody gates it

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Stakeholder (NexusHero), on Musti's finding against PR #175
- **Extends** [ADR-0017](0017-public-draft-first-review-and-tiered-testing.md) §4 (the review gate) and
  §7a (who flips). Does not amend either.
- **Context tags:** delivery method

## Context

ADR-0017 moved the review onto the draft PR and settled who flips it to ready. It said nothing about
**what starts the review** — an omission that looked like nothing and wasn't.

In practice the orchestrator filled the gap by asking the stakeholder for a go-ahead before each
dispatch. Over one slice that produced four separate stop-and-ask round trips for gates the process
already mandates. The reviewer was never unavailable and never declined; the work simply sat until
someone remembered to ask.

That is the same failure ADR-0017 §9 removed on the tooling side, where the finding was written as:

> a role that has to be couriered is a role the process routes around.

§9 removed the courier from Musti's *artefacts* — his tickets and his PRs. It left one in front of his
*gate*.

The rule was first written directly into `docs/process/delivery-pipeline.md` (PR #175). Musti's review
of that PR flagged the omission this ADR fixes:

> A load-bearing rule with no ADR behind it recreates #171's drift, inverted: the document now leads
> the decision record instead of trailing it.

He was right. #171 was a process document that had fallen behind an ADR. Writing a new rule straight
into the same document, with no ADR at all, produces the identical inconsistency from the other
direction — and the next reader has no way to tell a decision from an edit.

## Decision

**A draft pull request opening is itself the trigger for Musti's review. Nobody asks for permission to
start it, and the orchestrator does not gate it.**

**The trigger is the pull request, not its author.** A draft from Kaan or Robin, from Salih, or from
the orchestrator all start the review the same way. The first version of this rule said "a draft PR
from a dev", which failed to cover its own PR — a scoping bug found by the review it describes.

Two exceptions, neither an invitation to wait:

1. **He is not the gate on a PR he authored.** The PR then goes to the stakeholder.

   This one is **stated here for the first time**, which is itself a finding from the review of this
   ADR. It was previously *implied* by ADR-0017 §4 (the reviewer reads the developers' work) and
   *presupposed* by §7a (which asks what happens when the author is the only applicable gate) — but
   written down in neither. An unwritten exception to a mandatory gate is exactly the kind of thing
   that survives on shared memory until the memory is wrong, so it is written down now.

2. **A red CI pipeline blocks first** (ADR-0017 §6, gate 6). Reviewing code that does not build is
   wasted effort. **Pending is not red**: a review may start while CI is still running, and in
   practice usually does, since the draft opens early precisely so the two overlap.

Nothing else stands between a draft opening and the review starting.

## Consequences

**Positive**

- The review gate stops being schedulable by anyone outside it. A gate that runs only when someone
  remembers to trigger it is not a gate; it is a suggestion with good intentions.
- It removes the orchestrator from a position it should never have held. The orchestrator dispatches
  and relays; it does not decide whether a mandated gate runs.
- The cost of the alternative is now measured rather than assumed. On the slice that prompted this,
  #173, #174 and #175 were all merged before the review ran, and #173 put a user-visible change on
  five screens with neither gate on it — a change whose "additive spacing only, no visual QA needed"
  justification the post-merge review then disproved on two counts.

**Negative / accepted**

- **Tokens are spent without a human deciding they should be.** Every draft PR now costs a review
  whether or not anyone was waiting for one. That is the point — a gate you can skip by not asking is
  the failure mode being removed — but it is a real, recurring cost and it is accepted knowingly.

  Three things this costing does *not* claim, since it is the one part of this ADR carrying no
  measurement:
  - **The rate is not flat per PR.** It scales with diff surface and tier. On the slice that prompted
    this ADR the three reviews differed by roughly an order of magnitude — one was two files of
    renames, another needed twelve call sites resolved, a design-system reference cross-checked and a
    suite run.
  - **Re-reviews are the term that can grow without bound**, and they are the real exposure rather
    than the per-PR cost: a push after the review starts, a re-review after findings, a re-review
    after Salih. Opening a draft early — which this process encourages — makes an early read more
    likely, and therefore a re-read more likely too.
  - **The tier still bounds the depth**, which keeps this narrower than "a full review on everything".
    A T3 gets a light pass, and Salih does not run at all.
- **A review can now start on a PR the author is still pushing to.** Mitigated by ADR-0017's own rule
  that a draft opens *once the dev's own gate is green*, not as scratch space, but a dev who opens
  early will get read early.
- **The stakeholder can still merge before the gates run.** This ADR does not and cannot change that —
  it is his repository and he is the final authority. What it changes is that the review will already
  be running, so the window in which that can happen is narrower.

## Alternatives considered

- **Leave it implicit.** The status quo before this ADR: everyone knows the review is mandatory, so it
  will happen. Rejected on evidence — over one slice it did not happen four times, and then did not
  happen at all on three merged PRs.
- **Have the stakeholder trigger each review.** Honest and explicit, and what was actually being done.
  Rejected: it makes the mandatory gate optional in practice, since the way to skip it is simply not
  to ask. It also puts a routing decision in the one seat whose scarce attention the whole process is
  designed to protect.
- **Have Suhay trigger reviews as board owner.** The closest call of the four, and it needs a better
  argument than "a courier one seat over" — he already tracks the ticket through the pipeline, so the
  marginal cost really is near nil. Two things decide it:
  - **Tracking that a gate *ran* is not the same as controlling whether it *starts*.** Routing the
    start signal through the bookkeeping seat re-couples precisely what ADR-0018 decoupled, one ADR
    later.
  - **Under ADR-0018 Suhay owns half the refinement.** Making him the trigger for the gate that checks
    the resulting code puts a seat with an authorship interest in the scope in control of *when that
    scope gets checked* — a milder form of the exact structural problem §7a closed on the review side.
    That is not a close call once stated.
- **Write the rule in the process doc only** (what PR #175 did). Rejected by this ADR's own existence,
  for the reason Musti gave: a load-bearing rule with no decision record behind it recreates the #171
  drift inverted.
