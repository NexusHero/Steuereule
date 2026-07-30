# ADR-0022 — A push to a PR with open findings triggers the re-read

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Stakeholder (NexusHero)
- **Completes** [ADR-0020](0020-the-draft-pr-triggers-the-review.md) (what starts the review) and the
  thread-resolution rule that lives in `.claude/agents/lead-developer.md`, § *"You opened the thread, so
  you close it"* (PR #198, commit `b4b6818`) — how a finding is closed. That rule has no ADR of its own,
  so the agent definition is the citable artifact; the PR is only where it was argued.
- **Context tags:** delivery method

## Context

Two rules were landed a day apart and neither covers the gap between them.

**ADR-0020** settled what starts the *first* pass: a draft PR opening, with nobody's permission
required. **PR #198** settled *how* a finding is closed: the reviewer resolves it, after re-reading the
fix, because a push is a claim and resolving is confirmation.

Neither says **what brings the reviewer back**. So in practice nothing did.

On #197 and #204 every resolution happened because the orchestrator went and fetched him. That worked,
and it produced good results — on #204 he re-read, resolved two threads and deliberately held two open
over a collateral revert and a wrong commit id, which a resolve-on-push rule would have buried. But it
worked because a human-driven loop was standing in for a trigger, and the failure mode is silent: with
nobody poking, findings stay open on a PR that otherwise looks finished, and the next reader has to
re-derive which ones still stand.

That is the third instance of one shape. ADR-0017 §9 removed a courier from the reviewer's *artefacts*
(his tickets and PRs). ADR-0020 removed one from his *first pass*. This one sat in front of his
*second*.

## Decision

**A push to a pull request on which he has open findings triggers his re-read. Nobody asks him, and the
orchestrator does not gate it.**

He re-reads the **current head**, not each individual push — so a burst of commits is one re-read, not
five. For each open thread he then either **resolves** it, or **replies saying what is still open**.

Two clarifications that follow from #198 rather than being new:

- **The push is the trigger, not the evidence.** He still resolves on having read the fix. A push that
  plainly does not touch a finding gets a reply saying so, and the thread stays open.
- **Leaving a thread open remains a deliberate signal** — a partial fix, or an outcome accepted while
  the reasoning is not. It must not also mean "not got to yet", which is exactly what the missing
  trigger made it mean.

## Consequences

**Positive**

- The second pass stops depending on someone remembering. A gate that runs only when prompted is not a
  gate, and this was the last of the three places that was still true.
- `unresolved` regains its meaning. While the trigger was missing it conflated "still broken" with
  "nobody has looked", which makes the signal useless precisely when a PR is busiest.

**Negative / accepted**

- **More re-reads, and some will find nothing.** Head-based batching keeps it proportional, but a dev
  who pushes across several sessions will pull several re-reads. Accepted for the same reason as
  ADR-0020's cost: a gate you can skip by not being asked is the failure being removed.
- **The trigger is scoped to PRs that still have open findings, and the reverse case stays uncovered.**
  Once the last thread is resolved, a subsequent push triggers nothing: ADR-0020's first-pass trigger
  does not re-fire, so a dev who lands every fix, gets every thread closed, then pushes a refactor that
  crosses a boundary gets no second architectural pass — Salih's tier run would catch behaviour, not
  structure. Re-review of post-resolution pushes stays request-driven. Named rather than left to be
  inferred, because it is this ADR's own gap shape one iteration out; the alternative is unbounded
  re-reads on every push, which is what the "current head" clause exists to avoid.
- **He cannot currently reply inside a thread.** No reply-to-review-thread operation is exposed in his
  tool surface at all — he has create/submit/resolve/unresolve and comment-on-pending-review, none of
  which reply into an existing thread. (A 403 was also observed against the underlying endpoint, but the
  missing tool is the operative cause, and the distinction is load-bearing for #192: a 403 is fixed by
  widening a token, an absent tool by adding one.) So "reply instead of resolving" is available only as
  a *new anchored comment* — which
  GitHub creates as a **new thread**. Anyone using that fallback has to close both the original and the
  reply thread; on #204 that is how two extra threads came to look like live findings. Tracked with
  #192's tooling gap. The rule stands and the workaround is worse than the rule deserves.

## Alternatives considered

- **Resolve on push, without re-reading.** Rejected, and #198 already rejected it: it makes the author
  the effective closer of their own findings, and produces a thread that reads as verified when nothing
  was checked. #204 is the concrete case — a resolve-on-push rule would have closed F2 and F3 over a
  collateral revert and a wrong commit id.
- **The dev asks for the re-read when they believe the findings are addressed.** Honest, and it is what
  was happening informally. Rejected as the same courier failure one seat over: the way to skip the
  second pass becomes not asking for it.
- **Leave it to the orchestrator, permanently.** What was actually happening. It works and it is the
  reason the gap took two days to notice — which is the argument against it, not for it. A rule whose
  operation depends on one participant's diligence is indistinguishable from no rule the first time
  that participant is busy.
