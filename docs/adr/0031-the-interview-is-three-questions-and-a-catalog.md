# ADR-0031 — Nine questions, two segments: the interview stays three, the other six arrive as the catalog's first entry

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** NexusHero (stakeholder — he asked for the nine-question flow, and the shape below is
  what he accepted); framed by Musti (lead) in the #318 grill, where the conflict was reported rather
  than designed around.
- **Settles** the open question in [#318](https://github.com/NexusHero/Steuereule/issues/318)'s
  Halt comment — *"the question set itself"*, the fifth neighbour of that ticket's D1–D4 checkbox.
- **Precises, does not overturn,** product **ADR-016** (`finanzo-funke-design-system/project/research/adr/016-018-gates-paywall-zustaende.md`,
  accepted 2026-07-22) and its restatement in product ADR-031.
- **Builds on** [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (a control that only runs in
  the client is not a control) and [ADR-0008](0008-profile-persistence-encryption.md) (nothing
  sensitive in client storage).
- **Context tags:** product scope, interview, requirements traceability

## Context

The stakeholder wants the nine questions in `finanzo-funke-design-system/project/ui_kits/app/Interview.jsx`.
Product ADR-016 decides the interview asks **exactly three**, and names the failure it is avoiding:

> **Kontext:** Vollinterview vorab ermüdet (Taxfix-Hauptkritik: „Fragenkatalog").

Read as a straight either/or, this is a conflict, and #318 stopped on it — correctly, because the
entire cut of that ticket was derived from ADR-016, and a reversal would have taken the question set,
the out-of-scope list, the P1 table and the one-PR shape down with it.

**It is not an either/or.** ADR-016's decision has two halves that are usually quoted as one:

> Onboarding stellt genau **drei Fragen** … Alles Weitere (Vermietung, Kapital, Spenden …) wird
> **on-demand** hinzugefügt.

The second half is not a deferral of the other six questions. It is a **seam** — a named place where
everything beyond the minimum arrives. ADR-016 constrains *where the other questions live and when a
user meets them*; it does not say those questions may not exist. What it forbids is the wall of
questions in front of a user who has not yet seen the product.

The nine-question prototype does build the forbidden shape — nine screens, six branches, before
anything is shown. But its **content** is not the thing ADR-016 objects to.

## Decision

**The nine questions ship. They ship in two segments, across the seam ADR-016 already defines.**

### 1. Segment 1 — the interview: the three questions of the Minimal-Gate

Unchanged from #318's cut, and unchanged from ADR-016:

1. `job` — Woher kam dein Geld? (Angestellt / Selbstständig / Beides / Rente)
2. `ausland` — Gearbeitet im Ausland? (→ CH-only-Gate)
3. `kinder` — Hast du Kinder?

Two gates, and only two: **Gewerbe** (from `job`) and **CH-only** (from `ausland`). Onboarding stays
under ADR-016's 60 seconds.

### 2. Segment 2 — the other six, as the catalog's first entry

`partner`, `homeoffice`, `weg`, `tage`, `fortbildung`, `einkuenfte` are **not** appended to the
interview. They become the **first entry of the on-demand catalog** ADR-016 prescribes — reached from
the Startansicht's "Mehr hinzufügen" tile, after the user has seen the product, entered by choice and
leavable at any point.

This is the load-bearing distinction, and it is the whole reason the two halves are not the same
feature wearing different labels:

| | Segment 1 — interview | Segment 2 — catalog |
|---|---|---|
| When | before the product is visible | after, on request |
| Entered by | everyone, unavoidably | the user's choice |
| Abandonable | no — it is the gate | yes, at any question |
| Grows with | nothing (fixed at three) | every future Lebenslage (ADR-032/033/034) |

Nine questions asked as one unavoidable pre-flow is the Fragenkatalog ADR-016 names. Three asked at
the gate, six offered afterwards, is the structure ADR-016 asks for — with more content in it than
anyone had yet put there.

### 3. Segment 2 is the catalog's proof, not a special case

Segment 2 is built **through** the catalog seam, not beside it. If the six questions arrive by any
mechanism a later Lebenslage could not also use, the segment is wrong and must be rebuilt — the point
is to have the catalog's first real consumer, so that ADR-016's "on-demand" half stops being an
untested intention.

Concretely: the same `packages/core` graph, the same `InterviewAnswer` rows, the same server-side
reachability validation. A catalog entry is a **named set of question ids**, not a second code path.

### 4. Gate ordering: no gate may fire later than the answer that determines it

The prototype's Ausland gate fires on **question 9 of 9** (`Interview.jsx:14, 52`), while the Gewerbe
gate correctly fires on question 1 (`:46`). A cross-border commuter to Austria answers eight questions
before being told we cannot do their country — precisely what ADR-016's *"muss früh abzweigen"* exists
to prevent.

Segment 1 heals this by construction: `ausland` is question 2 of 3. **The rule is written down anyway**,
because the prototype's ordering is the natural thing to copy, and the catalog will grow more gates:

> A gate is placed immediately after the question whose answer determines it. A gate that can be
> reached only after unrelated questions is a defect, not a layout choice.

### 5. Delivery order

Segment 1 first, as its own PR. Segment 2 follows as its own PR.

Not for review-size reasons alone: shipping them together would put the interview and the catalog in
one diff, which is exactly where the distinction §2 rests on gets lost. Two PRs make the seam visible
in the history — and if segment 2 turns out not to fit through the catalog, §3 makes that a finding
rather than a merge.

## Consequences

- **#318 keeps its cut in full.** The question set, the out-of-scope list, the P1 table and the one-PR
  shape all stand as written. The Halt is lifted, not resolved by revision.
- **The technical substance was never at risk**, as #318's Halt comment already noted: the graph in
  `packages/core`, server-side path validation, `InterviewAnswer` with `/// @encrypted value`,
  `@RequiresAccount()`, no `localStorage`, P2/P3/P5. Segment 2 adds rows and question ids to that
  structure; it changes none of it.
- **The catalog gets a ticket with real content**, instead of remaining a placeholder in ADR-016 that
  nothing has ever had to satisfy.
- **`Begriff` is needed after all — in segment 2, not segment 1.** #318 correctly excluded it: it hangs
  on `einkuenfte`'s Sparerpauschbetrag explainer, which is segment 2's.
- **The prototype's client-side weights, `localStorage` persistence and estimate ticker stay out of
  both segments.** ADR-0008 and #318's own exclusions are untouched by this decision.
- **Two REQs, not one.** Segment 1 is REQ-015; segment 2 gets its own row. Neither goes `Done` before
  its named acceptance file exists (ADR-0025). The register's owner writes both.

## Alternatives considered

- **Overturn ADR-016 and ship all nine as the interview.** Rejected: it builds the shape ADR-016 names
  as its primary competitor's main criticism, and it discards a decision that was accepted, reasoned
  and never shown to be wrong — on the strength of a prototype that was never a product decision.
- **Hold the line at three and drop the other six.** Rejected: the stakeholder asked for them, they are
  real tax content, and ADR-016 never said they may not exist. This reading treats "on-demand" as a
  polite way of saying "never", which is not what the ADR says.
- **Ship all nine, but reorder so the gates come early.** This fixes §4's defect and nothing else — the
  user still meets nine unavoidable questions before seeing the product. It addresses the symptom
  #318's Halt comment happened to name and leaves ADR-016's actual objection standing.
- **Segment 2 as a second interview phase, skippable.** Rejected as the worst of both: it is still a
  pre-product flow, and a skip button is not the same as a catalog the user opens on purpose — it
  would also leave ADR-016's on-demand half still untested.
