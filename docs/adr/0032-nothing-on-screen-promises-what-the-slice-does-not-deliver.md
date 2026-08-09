# ADR-0032 — Nothing on screen promises what the slice does not deliver

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** NexusHero (stakeholder). Reached as one ruling over three separate questions —
  D1, D3 and the CH-only gate's "Vormerken" button — after they turned out to be one question.
- **Applies** [ADR-0021](0021-controls-are-proven-by-breaking-them.md) to the screen: a button that
  appears to make a commitment and does not is the same defect as a control that appears to
  constrain behaviour and does not.
- **Settles** D1 and D3 from the [#11](https://github.com/NexusHero/Steuereule/issues/11) ruling and
  the `auslandWunsch` hole found while cutting [#321](https://github.com/NexusHero/Steuereule/issues/321).
- **Context tags:** product scope, honesty principle, delivery method

## Context

Three questions were open against the interview slice, filed separately and days apart. Each was
about a single element of a single screen, and each looked like a small scoping call.

| | Element | What it tells the user | What is behind it |
|---|---|---|---|
| D1 | `≈ +210 € drin` after a question | a calculation | placeholder weights that contradict the 6-€-per-day rule quoted on the same line; and a **deduction** rendered as if it were a **refund** |
| D3 | *Benachrichtigt mich, wenn Gewerbe kommt* | an email, later | [#83](https://github.com/NexusHero/Steuereule/issues/83) is unbuilt — no email can be sent |
| — | *Vormerken — sag mir, wenn mein Land kommt* | a recorded intent | no storage location decided; the slice writes nothing |

Taken one at a time, each has a plausible local answer ("ship it, refine later", "it's just a
placeholder"). Taken together they are one thing three times: **a screen element that makes a
commitment the slice cannot keep.**

The product's own gates are built on the opposite promise. The Gewerbe gate opens with *"Ehrlich:
dafür sind wir noch nicht gut genug"*; the CH-only gate with *"Ehrlich: andere Länder können wir
noch nicht"*. A product that says that out loud and then renders a button that quietly does nothing
has spent the credibility those sentences were buying.

This kept arriving as three tickets because nobody had written the rule down. Deciding it once is
cheaper than deciding it again for every future gate — and ADR-0031 §3 guarantees there will be more
gates, because the on-demand catalogue is where the remaining coverage arrives.

## Decision

**A screen element may only assert what the shipped slice actually does.**

Concretely, and in order of how often each will come up:

### 1. No number that has the appearance of a calculation without being one

If a figure is shown to a user as money, it is computed by `packages/core` from that user's own
answers, by a rule that can be named and tested. A placeholder is not shown at all — not greyed,
not "approximate", not with a disclaimer. REQ-001's honest empty state is the pattern: showing
nothing is a supported outcome.

This settles **D1**: the estimate sticker and the first estimate are out of the interview slices.
They return with their own slice, against REQ-001's already-proven range.

### 2. No control that offers an action the system cannot perform

A button that would need a capability we have not built is not rendered — it is not disabled, not
"coming soon", not silently inert. The absence is honest; the presence is not.

This settles **D3** (the Gewerbe gate's notify-me button, since #83 is unbuilt) and the CH-only
gate's Vormerken button (since no storage for the intent exists). Both gates remain complete
without them: they say what we cannot do, and what we can do instead.

### 3. When the honest version is a smaller screen, the screen gets smaller

The design-system reference is authoritative for wording and form, **not** for which capabilities
exist. Where it offers an action this slice cannot perform, the port drops the action. That is not
a deviation from the reference to be justified — it is this ADR being applied.

### 4. What this does not license

This is not a licence to drop hard parts by calling them promises. It binds **assertions to the
user** — numbers, commitments, and offered actions. It says nothing about internal completeness,
and it never justifies shipping a control that is merely weaker than specified: ADR-0021 governs
that, and it is unaffected.

## Consequences

- **The three open questions are closed by one rule**, and the next gate does not reopen them.
- **The gates ship smaller than the prototype.** Gewerbe keeps its honest text and, for *Beides*,
  the "prepare the employee part" path — that one promises nothing external. CH-only keeps its
  text and carries on with the rest of the tax year.
- **A "Vormerken" storage model is still needed** the day we can act on it, and the question of
  whether a notification intent belongs in `InterviewAnswer` at all — it is not a fact about the
  tax year — stays open in #321. This ADR removes the pressure to answer it badly and fast.
- **This costs real product value, knowingly.** The estimate after each question is the interview's
  strongest moment, and the #11 cost brief argued that persuasively. It returns when it can be
  computed rather than staged.
- **It is checkable in review**, which is the point: "what does this element assert, and does the
  slice do it?" is a question with an answer, unlike "is this placeholder acceptable?"

## Alternatives considered

- **Ship the elements, mark them provisional.** Rejected: every instance here already carried a
  marker in the reference — a code comment saying the estimate *"darf auch ehrlich klein sein"* —
  and it still reached the screen looking like a number. A marker the user cannot see is not one.
- **Decide the three separately.** What was happening already. It produced three tickets, two
  grills and no rule, and the fourth instance would have cost the same again.
- **Wire the buttons to a no-op store now** so they are "real". Rejected for the Vormerken case
  specifically: it would answer the storage question by accident rather than on purpose, and a
  recorded intent nobody ever reads is a promise broken more slowly, not kept.
