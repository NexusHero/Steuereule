# ADR-0017 — Draft-first PRs with a public review, mandatory refinement, and risk-tiered testing

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Stakeholder (NexusHero)
- **Extends** [ADR-0015](0015-crew-reduced-to-two-developers.md), [ADR-0016](0016-crew-reduced-to-four-roles.md)
- **Context tags:** delivery method, transparency, operating cost

## Context

Three pressures arrived together.

**The process was invisible.** Review and test happened locally, before any PR existed, and the PR
carried only a verdict. For a project whose interesting property *is* that an orchestrated AI crew
builds it under a disciplined process, hiding that process throws away the evidence. The stakeholder
put it plainly: you should almost be able to watch the agents work.

**ADR-0016 opened a requirements hole.** Retiring the Product Owner left nobody whose job is asking
"is this what we promised?". The cost showed up within a day: the Requirements Register had eight
wrong statuses and two missing REQs, found only because someone happened to read it while choosing
the next feature.

**The gates cost unevenly.** Measured across this session: a Musti review runs ~45–90k tokens, a
Salih real-stack pass ~98–167k. They were sometimes dispatched in parallel, which spends the
expensive one before knowing whether the cheap one sends the code back.

A fourth option was considered and rejected on evidence — reducing Salih to a CI-watcher. The splash
entrance was **inert in a real browser while CI was fully green (7/7)**; only his own drive found it.
CI checks what someone already thought to check; Salih finds the class nobody thought of, and *then*
turns it into a check. Watching CI is also something the orchestrator already does, so it would
duplicate a capability that is not scarce.

## Decision

**1. Every task begins with a refinement block.** Musti drafts it; the **stakeholder rules on it**.
It carries the REQ (or "new → into the register first"), exactly one Given–When–Then criterion, the
ADRs touched and any conflict, explicit out-of-scope, **which existing product claim the change might
make untrue**, and the risk tier. Musti drafts because he knows the codebase; he does not decide,
because what was promised to the user is not his to settle. A dev handed work without a refinement
block **requests one rather than starting**.

The honesty line earns its place from history: a slice once shipped a screen still promising "stays
on this device" after the data moved server-side, and the DSGVO copy had to be corrected rather than
ported for the same reason.

**2. The register moves with the slice.** A slice is not done until its REQ status points at a test
file that actually exists.

**3. Devs open a draft PR as soon as their own gate is green.** The draft *is* the workbench, on
purpose. The review happens on it, in public. CI starts during the review instead of after it.

**4. Musti reviews on the draft, in the open, as Musti.** He reads the diff locally — cheaper and
better than through the API — but posts findings as PR comments. **He posts his record even when he
finds nothing**, because a silent pass is indistinguishable from not having looked. The slice
advances on **no unresolved findings**, never on "no comments".

**5. Musti runs before Salih, always.** The cheap gate first: his review is roughly a third of a
real-stack run, and code sent back would invalidate that run anyway.

**6. Salih is risk-tiered.** **T3** (docs, DS assets, test infra, config): he does not run. **T2**:
he runs when a user can see or do something different. **T1** and any genuinely new user-facing
surface: full pass. This aims him at the cases where he has historically found things — a dead
animation, a stale cache, a solid-green eye — and away from those where he has found nothing.

**7. Salih flips the PR to ready.** Not Musti, and not the dev. `draft` means the crew is still on it;
`ready` means both gates are through and it is the stakeholder's to merge. Had Musti flipped it before
Salih ran, `ready` would have meant "one gate passed, one running" — and the stakeholder could merge
into an untested state.

**7a. When Salih does not run, nobody in the crew flips it.** Where the tier stands Salih down — a T3,
**or a T2 the tier ruling stands him down on** — or where the PR's author is the only crew member whose
gate would apply, **no crew member flips it**: the PR stays draft and the **stakeholder** flips or
merges it directly. `ready` means *every gate this PR was owed has passed*; a PR that was owed no
Salih-run never claims one. A reviewer never flips their own work, and never flips work they authored.

This was found the day §7 was written, by the first PR that hit it: [#154](https://github.com/NexusHero/Steuereule/pull/154),
Musti's own arc42 update — T3, so §6 stood Salih down, and self-authored, so §4 left no reviewer. Under
§7 alone it had no path out of draft at all. Adding a "Salih flips T3 without running" mechanic was
rejected: it would reduce the flip to pressing a button and hollow out exactly the meaning §7 exists to
protect. Adding a second crew reviewer for self-authored T3 docs was also rejected — it reintroduces a
gate for the one class where the evidence says none is needed.

The **T2 clause was added within the hour**, by the second PR to hit the same edge:
[#155](https://github.com/NexusHero/Steuereule/pull/155), a backend refactor Musti tiered **T2** and on
which §6's own test ("he runs when a user can see or do something different") stood Salih down. A crew
gate *did* apply and *did* pass — Musti's review — yet the first draft of §7a named nobody, because it
spoke only of T3. The tempting repair was "the last crew gate that actually ran flips it", and it is
rejected for the same reason as everything else in §7: it hands the reviewer, for the price of one
click, the button §7 deliberately withheld from him. The rule is about **who ran**, not about which
tier label was applied.

**8. Salih commits the harness instead of re-improvising it.** The recipe for standing the stack up
lives **only as YAML in `ci.yml`**, which nothing can import, so it is rewritten in bash on every run
and the drive script is discarded afterwards. It becomes `e2e/harness/` — `stack.mjs` (one call to a
running stack, with the native-Postgres fallback for a blocked registry), `browser.mjs` (the
375/768/1280 sweep, reduced-motion toggle, per-frame computed-style sampler, element-at-point colour
probe), and a README carrying the environment truths that keep being re-derived. **Findings become
committed specs in `e2e/`**, not scratch files — his own rule applied to his own tooling.

**9. A role's tools follow the role.** ADR-0016 gave Musti findings→tickets; this ADR gave him
arc42-moves-with-the-slice. His toolset carried neither capability: no issue creation, no PR creation.
The cost showed up immediately — his first arc42 PR under this process had to be opened *for* him by
the orchestrator. `issue_write`, `create_pull_request` and `update_pull_request` are added to his
definition. A role that has to be couriered is a role the process quietly routes around, and the
cheapest way to lose a gate is to make using it inconvenient.

**10. The `Generated by Claude Code` footer is a tooling artefact, and is recorded as one.** The GitHub
layer appends it to comments and PR bodies *after* submission — confirmed by submitting a body without
it and reading the same body back with it attached. It contradicts this project's own no-attribution
rule. PR **bodies** are rewritten after creation to strip it. Posted **comments** cannot be: the
available GitHub surface has no comment-edit operation, and delete-and-repost would break permalinks
that other comments already cite. Rather than let the record imply the rule held, `CONTRIBUTORS.md`
states what the footer is, who did not write it, and why the existing ones remain.

## Consequences

**Positive**

- The process becomes visible: what was questioned and how it was answered is readable in the repo,
  not just its verdict. For this project that is part of the product.
- CI runs during review, so build breaks surface while someone is still looking.
- The expensive gate stops being spent on code the cheap gate would have sent back.
- Not running Salih on T3 costs nothing — he has found nothing there — and saves the most per slice.
- The harness should cut a real-stack run substantially. **Estimated, not measured**: setup and drive
  appear to dominate a run, so ~150k → ~50–60k is the guess. The first two T1 slices before and after
  give the real number.

**Negative / accepted**

- **The PR is no longer a clean release candidate.** It shows refute→fix churn. That was the whole
  reason the loop was local. Traded deliberately for watchability.
- Token cost of review goes slightly **up**, not down: comments are GitHub round-trips. Mitigated by
  reading the diff locally and preferring one structured comment over many line-level ones.
- Sequential gates lengthen wall-clock to a finished PR. Running them in parallel stays defensible for
  a large new surface where both will likely find independent things — but as a named exception, not
  the default.
- The refinement step adds load to Musti, who already carries review, architecture, tiers, WIP and
  ticketing since ADR-0016. **If the review gate degrades under it, the answer is to reinstate a seat
  — most likely the Product Owner, since the pressure is on requirements — not to thin the review.**

## Alternatives considered

- **Salih as a CI-watcher only.** Rejected on the splash evidence above.
- **A weaker model for Salih.** He already runs Sonnet, not Opus; weaker means Haiku. The value he
  produces is the diagnostic step — *the animation didn't play* → *an `Animated.Value` on a plain
  `View` is never subscribed* → verified by sampling computed style per frame — which is reasoning,
  not execution. The mechanical half is real but the answer there is the committed harness, not a
  weaker mind. **No measurement was taken**; if the question matters, run him on Haiku once against a
  deliberately reverted fix and see whether he still catches it.
- **Public refutation loop, iterating in comments.** Kept the refutation fast and local; only the
  record and the findings are public. Full public iteration would multiply round-trips for little
  added transparency over a well-written record.
- **Musti flips to ready.** Rejected — it breaks the meaning of `ready` (see decision 7).
