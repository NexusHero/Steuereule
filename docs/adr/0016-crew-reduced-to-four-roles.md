# ADR-0016 — Product Owner and Scrum Master retired; the crew is four roles

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Stakeholder (NexusHero)
- **Supersedes nothing; extends** [ADR-0015](0015-crew-reduced-to-two-developers.md)
- **Context tags:** delivery method, operating cost

## Context

ADR-0015 cut the crew from four developers to two, on the finding that the review and test
lanes — not authoring capacity — were the bottleneck. That left six roles: Suhay (Scrum
Master), Matthias (Product Owner), Musti (Lead/Review), Kaan (frontend), Robin (backend),
Salih (DevOps/Quality-Platform).

The question this ADR answers was put deliberately: **which seat can we lose so that we pay
in time, but not in quality?** The evidence came from a full working session covering the
DSGVO round, two externally-authored PRs, and several fixes.

**The two gates earned their keep, concretely:**

- **Salih** found the largest defect of the session: the entire splash entrance was inert in
  a real browser, because an `Animated.Value` was handed to a plain `View`. 114 green unit
  tests did not see it; only a real-browser pass could. Earlier, the same gate caught the
  Profil stale-cache bug.
- **Musti** withheld a PASS on the DSGVO export because the HTML-escaping invariant — the
  single most security-critical control in that slice — had **no test at all**. The code was
  correct; a future refactor could have removed the escaping silently. He also caught the
  splash blink playing in the wrong slot against the DS reference.

Removing either would have cost quality directly, not hypothetically.

**The two coordination seats were not invoked once in that session.** Their functions were
absorbed without friction:

- Suhay's board hygiene, ticketing, risk-tier assignment and WIP limit were handled by the
  orchestrator's task list.
- Matthias's requirement answers were available from the artifacts he curated — the
  Requirements Register and the product/design ADRs — read directly, without a round trip.

That is the asymmetry: the gates produce findings nothing else produces; the coordination
seats mostly *route* information that is already written down.

## Decision

**Retire Matthias (Product Owner) and Suhay (Scrum Master). The crew is four roles: Musti,
Kaan, Robin, Salih.**

Their responsibilities move, they are not dropped:

| Was | Now |
|---|---|
| Requirements & acceptance criteria (Matthias) | The **stakeholder**, working from the Requirements Register + product/design ADRs. Devs' requirement questions go to the stakeholder after reading those. |
| Per-slice product acceptance (Matthias) | The **stakeholder** on Salih's preview; the honesty invariant is additionally enforced by tests. |
| Board, tickets, findings→tickets (Suhay) | **Musti** files the ticket for every review finding; the stakeholder owns the board. |
| Risk tier assignment, WIP limit (Suhay) | **Musti** assigns the tier (he already held the right to bump one up) and holds the WIP limit. |
| Capacity split across devs (Suhay + Musti) | **Musti** alone. |

`.claude/agents/product-owner.md` and `.claude/agents/scrum-master.md` are deleted. The role
tables, dispatch instructions and ping-pong wording in the remaining four definitions and in
`docs/process/` are rewritten to name the stakeholder where they named a persona.

**History is not rewritten.** `CONTRIBUTORS.md` keeps both under *Former members*, and the
in-code record of decisions they made — e.g. the i18n comment recording Matthias's wording
ruling on issue #65 — stays exactly as it is. A decision's provenance does not stop being
true when the role that made it is retired.

## Consequences

**Positive**

- Removes two seats that produced no findings, while keeping both seats that did.
- Requirement answers get read from the register rather than relayed, which is one hop
  shorter and leaves a citable source instead of a conversation.

**Negative / accepted**

- **Nobody's full-time job is asking "is this what we promised the user?"** anymore. The
  register and the honesty tests carry it, and both are static — they cannot notice a *new*
  feature drifting from intent. This is the real cost, and it is accepted knowingly.
- Board hygiene will decay without a role that owns it. Expect the backlog to need periodic
  cleanup rather than staying continuously groomed.
- The ping-pong loop (a complaint on a green build becomes a permanent test) now depends on
  the stakeholder actually exercising the preview. If they don't, the loop stops learning —
  the mechanism survives, its input does not.
- More load on Musti: capacity, tiers, WIP and ticketing on top of review and architecture.
  Watch for the review gate itself degrading under that; if it does, the answer is to give
  the bookkeeping back, not to thin the review.

**Neutral**

- Gates, risk tiers, the WIP limit, the honesty invariant and the `Co-authored-by`
  convention are unchanged. A smaller crew runs the same process.

## Alternatives considered

- **Keep both, invoke them rarely.** Genuinely tempting — it costs nothing to leave a
  definition in place. Rejected because a seat that exists is a seat the orchestrator plans
  around; ADR-0015 already recorded that as the cost Ogün's never-dispatched track imposed.
- **Retire Suhay only, keep Matthias on call.** This was the recommendation. The stakeholder
  chose to retire both, accepting the requirement-drift risk named above in exchange for the
  simpler loop.
- **Retire a developer instead.** Rejected: it would trade quality-neutral coordination for
  throughput, and the developers are the only seats that produce the product.
- **Thin the gates instead of removing seats** (skip Musti on T3, skip Salih on non-visible
  changes). Not an alternative but a complement — the risk-tier system already permits this
  and should be used more sharply. It saves effort exactly where the gates find nothing.
