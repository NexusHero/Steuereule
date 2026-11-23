# ADR-0042 — Grenzgänger CH vertical: document type, CH interview entry, exchange-rate core (Draft) 

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 09) — draft; promotion needs Musti review
- **Number open:** `0041` collides with t08's `0041-employee-vertical-lstb.md` — the
  final number is assigned at promotion (0041/0042), not fixed here.
- **Implements** product ADR-029 (full CH depth), product ADR-012 (exchange rate), product ADR-013
  (Switzerland only; 45-day rule — corrected to 60 days, see Amendment 2026-11-05), product ADR-036 (scan fallback form, CHF leads)
- **Builds on** ADR-0008 (field encryption), ADR-0033 (interview engine/entries), ADR-0035
  (foundation consolidation), the document inbox draft 0040
- **Context tags:** architecture, grenzgänger-ch, wechselkurs, interview-engine, honesty principle, security

## Context

The Grenzgänger (cross-border commuter) CH vertical (Ticket 09) runs in parallel with the employee vertical (Ticket 08)
on the shared `packages/core` domain. Its job is to prove the shared core carries a second,
completely different case world: the DE→CH commuter (ADR-029/013), who thinks in CHF (ADR-036)
and whose document set is the CH Lohnausweis (Swiss salary certificate), the Quellensteuer (withholding tax) statement, the PK (Pensionskasse, pension fund) statement
(2nd pillar), the Säule 3a (pillar 3a) statement, the CH health insurance statement and the Familienzulagen (family allowances) statement.

## Decision

1. **Document type vocabulary (`packages/core/src/receipt-type.ts`)** — the CH document types join the shared
   document inbox vocabulary (ADR-007/008) as one extensible `Belegart` union. The `Beleg` table
   gains a plain `art` discriminator (nullable: `null` = the pre-CH undifferentiated receipt). `art`
   is **clear**, not field-encrypted — same reasoning as the dates (the inbox groups by it without
   decrypting), and it is not itself a tax fact or joinable PII.

2. **CH interview as its own catalogue entry (`segment-ch`)** — `ch-wohnsitz` + `ch-nichtrueckkehrtage`
   are a separate entry in `interview.ts`'s catalogue, not questions appended to the minimal gate.
   The Grenzgänger status is a **derived** fact (`grenzgaengerStatus`, 60-day rule — see Amendment), never
   a re-asked question. Server admission is **entry-aware**: `postAnswer` derives the owning entry
   from the bare questionId (`entryForStep`) and validates reachability within it (`isReachableFor`)
   — the D3 design ADR-0033 already built, applied uniformly, so the CH entry is server-validated
   exactly like the minimal gate (REQ-015's pattern), with no second code path. Admission is scoped
   by an **explicit allowlist** (`minimal-gate` + `segment-ch`): Segment 2 stays *declared, not yet
   admitted server-side* (that is R2's deliberate opt-in, `interview.ts` header), so the generic
   `entryForStep` does NOT silently open it — see Consequences.

3. **Exchange-rate core (`wechselkurs.ts`)** — amtlich (official; BMF monthly rate) is the default and needs no
   document; tatsächlich (actual) is representable **only with a document** ("ohne Beleg kein tatsächlicher Kurs" — no document, no actual rate).
   This is a **factory invariant** (enforced by `tatsaechlicherKurs`) plus a **plausibility check
   for persisted data** (`pruefeGrenzgaenger`) — deliberately NOT a type-level invariant: the
   `Wechselkurs` type keeps `belegId` as a plain optional field rather than a discriminated
   union. CHF→EUR conversion carries provenance (rate + mode + month); the BMF rate *source*
   stays a later backend slice (ADR-012).

4. **CH line items → deterministic core (`grenzgaenger.ts`)** — the guided Lohnausweis mask (ADR-036,
   Ziffern (boxes) 1–15 in paper order) maps the line-item-relevant Ziffern (8 Bruttolohn (gross salary), 10 PK, 12 Quellensteuer)
   into CHF→EUR line items with full provenance. Only **Bruttolohn** maps onto the core's income
   `Posten` today.

## Consequences

- **The honest boundary, stated once:** Vorsorgeaufwand/Anrechnung (pension expenses / tax credit) (PK, Quellensteuer, Säule 3a,
  Krankenkasse, Familienzulagen) are **captured and converted** but **not folded** into the core's
  income-only `Posten` model. Extending the core with Vorsorgeaufwand/Anrechnung is the tax-formula
  slice's shared work — coordinated with the employee vertical (ADR-0015 lesson), not done here.
  What is not computable is modeled as **offen** (open), never as a guessed point value (ADR-032 honesty).
- **`TaxYear.openItems` stays the minimal gate's count** — the cockpit's projection. The CH entry's
  own remaining is served by `nextStepFor(segment-ch)`; folding it into the cockpit count is the CH
  screen's work, coordinated with Ticket 08, not this slice.
- **Admission boundary (Segment 2 stays out) and GET:** `postAnswer` admits only the allowlisted
  entries `minimal-gate` + `segment-ch`; a Segment-2 id is refused 409 (pinned by a service test).
  `getState` is deliberately still minimal-gate-only — a CH answer surfaces the minimal gate's
  `nextStep` there; the CH screen gets its next step from the POST response's `nextStepFor(segment-ch)`,
  and a fully entry-aware GET is follow-up work, not this slice.
- **Security posture (CH data is Steuerdaten, tax data):** `art` is a plain discriminator (not joinable PII);
  `dateiname` is field-encrypted (ADR-0008 — filenames carry PII); interview answer **values** are
  field-encrypted at rest (ADR-0008) and WRITE/READ access is audited (REQ-004). What this slice
  deliberately does **not** do: the document **binary** storage (the actual Lohnausweis scan) is out of
  scope (ADR-036/045) — when it lands, its storage-key must join the encrypted set. Follow-up ticket.
- **M2 plausibility (`grenzgaenger-plausibilitaet.ts`)** covers the CH hazards structurally: an
  actual rate without its document (Widerspruch, contradiction), a genuine Grenzgänger without Quellensteuer
  (offen), a Nettolohn (net salary) contradicting the Lohnausweis arithmetic (Widerspruch), Familienzulagen without
  children (Widerspruch), and the >60-day status loss (Hinweis, notice; was >45, see Amendment).

## Alternatives considered

- **A separate CH interview controller/service.** Rejected: would duplicate the admission logic; the
  entry-aware write path over `entryForStep`/`isReachableFor` is the ADR-0033 D3 design. Admission is
  then narrowed to an explicit allowlist (`minimal-gate` + `segment-ch`), so the D3 engine is reused
  *without* silently admitting Segment 2.
- **Admit every entry uniformly (no allowlist).** Rejected: that would silently open Segment 2 on the
  shared endpoint — Segment 2's server admission is R2's deliberate opt-in (`interview.ts` header),
  not something this ticket inherits as a side effect of `entryForStep` being generic.
- **Store the Grenzgänger status as a column.** Rejected: a derived fact is recomputed, never persisted
  (same instinct as ADR-014/048's estimate range and the document Zuordnung (assignment) state).
- **Fold deductions/credits into the core `Posten` now.** Rejected: the core's `Posten` is income-only;
  extending it is shared tax-formula work that would diverge from the employee vertical (ADR-0015 lesson)
  if done unilaterally here.
- **Field-encrypt the `art` discriminator.** Rejected: it is not PII/tax fact and the inbox needs it in
  the clear to group by type, same as the dates.

## Amendment — 2026-11-05: the Nichtrückkehrtage limit is 60, not 45

Product ADR-013 and this ADR named a 45-day rule. For Switzerland the source is Art. 15a Abs. 2
DBA (double taxation agreement) Deutschland–Schweiz: Grenzgänger status ends only when the person does not return to the
place of residence on **more than 60 working days** in the calendar year for professional reasons. 45 days is
the rule of the DBA Deutschland–Frankreich. With 45, a commuter with 46–60 such days was classed
`kein-grenzgaenger` — wrong status, wrong Quellensteuer expectation, and since Anlage N-Gre a
blocked printout.

`GRENZGAENGER_NICHTRUECKKEHRTAGE` is now 60; the plausibility notice follows the same constant.
Ruled by the stakeholder (NexusHero) on 2026-11-05. Not covered and still open: part-time and
part-year employment, where the 60 days are reduced proportionally (BMF-Schreiben (BMF circular) on Art. 15a).

