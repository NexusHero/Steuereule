# ADR-0042 — Grenzgänger-CH-Vertikale: Belegart, CH-Interview-Entry, Wechselkurs-Kern (Entwurf) 

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 09) — draft; promotion needs Musti review
- **Nummer offen:** `0041` kollidiert mit t08s `0041-lstb-angestellte-vertikale.md` — die
  endgültige Nummer wird bei Promotion vergeben (0041/0042), nicht hier festgeschrieben.
- **Implements** Produkt-ADR-029 (volle CH-Tiefe), Produkt-ADR-012 (Wechselkurs), Produkt-ADR-013
  (nur Schweiz, 45-Tage-Regel), Produkt-ADR-036 (Scan-Fallback-Maske, CHF führt)
- **Builds on** ADR-0008 (Feldverschlüsselung), ADR-0033 (Interview-Engine/Entries), ADR-0035
  (Foundation-Konsolidierung), the Beleg-Posteingang draft 0040
- **Context tags:** architecture, grenzgänger-ch, wechselkurs, interview-engine, honesty principle, security

## Context

The Grenzgänger-CH vertical (Ticket 09) runs in parallel with the Angestellten vertical (Ticket 08)
on the shared `packages/core` domain. Its job is to prove the shared core carries a second,
completely different case world: the DE→CH commuter (ADR-029/013), who thinks in CHF (ADR-036)
and whose document set is the CH-Lohnausweis, the Quellensteuer-Abrechnung, the PK-Nachweis
(2. Säule), the Säule-3a-Nachweis, the CH-Krankenkassen-Nachweis and the Familienzulagen-Nachweis.

## Decision

1. **Belegart-Vokabular (`packages/core/src/belegart.ts`)** — the CH document types join the shared
   Beleg-Posteingang vocabulary (ADR-007/008) as one extensible `Belegart` union. The `Beleg` table
   gains a plain `art` discriminator (nullable: `null` = the pre-CH undifferentiated receipt). `art`
   is **clear**, not field-encrypted — same reasoning as the dates (the inbox groups by it without
   decrypting), and it is not itself a tax fact or joinable PII.

2. **CH-Interview als eigener Catalogue-Entry (`segment-ch`)** — `ch-wohnsitz` + `ch-nichtrueckkehrtage`
   are a separate entry in `interview.ts`'s catalogue, not questions appended to the Minimal-Gate.
   The Grenzgänger-Status is a **derived** fact (`grenzgaengerStatus`, 45-Tage-Regel ADR-013), never
   a re-asked question. Server admission is **entry-aware**: `postAnswer` derives the owning entry
   from the bare questionId (`entryForStep`) and validates reachability within it (`isReachableFor`)
   — the D3 design ADR-0033 already built, applied uniformly, so the CH entry is server-validated
   exactly like the Minimal-Gate (REQ-015's pattern), with no second code path. Admission is scoped
   by an **explicit allowlist** (`minimal-gate` + `segment-ch`): Segment 2 stays *declared, not yet
   admitted server-side* (that is R2's deliberate opt-in, `interview.ts` header), so the generic
   `entryForStep` does NOT silently open it — see Consequences.

3. **Wechselkurs-Kern (`wechselkurs.ts`)** — amtlich (BMF-Monatskurs) is the default and needs no
   Beleg; tatsächlich is representable **only with a Beleg** ("ohne Beleg kein tatsächlicher Kurs").
   This is a **factory invariant** (enforced by `tatsaechlicherKurs`) plus a **plausibility check
   for persisted data** (`pruefeGrenzgaenger`) — deliberately NOT a type-level invariant: the
   `Wechselkurs` type keeps `belegId` as a plain optional field rather than a discriminated
   union. CHF→EUR conversion carries provenance (Kurs + Modus + Monat); the BMF rate *source*
   stays a later backend slice (ADR-012).

4. **CH-Posten → deterministischer Kern (`grenzgaenger.ts`)** — the guided Lohnausweis mask (ADR-036,
   Ziffern 1–15 in paper order) maps the posten-relevant Ziffern (8 Bruttolohn, 10 PK, 12 Quellensteuer)
   into CHF→EUR line items with full provenance. Only **Bruttolohn** maps onto the core's income
   `Posten` today.

## Consequences

- **The honest boundary, stated once:** Vorsorgeaufwand/Anrechnung (PK, Quellensteuer, Säule 3a,
  Krankenkasse, Familienzulagen) are **captured and converted** but **not folded** into the core's
  income-only `Posten` model. Extending the core with Vorsorgeaufwand/Anrechnung is the tax-formula
  slice's shared work — coordinated with the Angestellten vertical (ADR-0015-Lehre), not done here.
  What is not computable is modelled as **offen**, never as a guessed point value (ADR-032 honesty).
- **`TaxYear.openItems` stays the Minimal-Gate's count** — the Cockpit's projection. The CH entry's
  own remaining is served by `nextStepFor(segment-ch)`; folding it into the Cockpit count is the CH
  screen's work, coordinated with Ticket 08, not this slice.
- **Admission boundary (Segment 2 stays out) and GET:** `postAnswer` admits only the allowlisted
  entries `minimal-gate` + `segment-ch`; a Segment-2 id is refused 409 (pinned by a service test).
  `getState` is deliberately still Minimal-Gate-only — a CH answer surfaces the Minimal-Gate's
  `nextStep` there; the CH screen gets its next step from the POST response's `nextStepFor(segment-ch)`,
  and a fully entry-aware GET is follow-up work, not this slice.
- **Security posture (CH data is Steuerdaten):** `art` is a plain discriminator (not joinable PII);
  `dateiname` is field-encrypted (ADR-0008 — filenames carry PII); interview answer **values** are
  field-encrypted at rest (ADR-0008) and WRITE/READ access is audited (REQ-004). What this slice
  deliberately does **not** do: the Beleg **binary** storage (the actual Lohnausweis scan) is out of
  scope (ADR-036/045) — when it lands, its storage-key must join the encrypted set. Follow-up ticket.
- **M2 Plausibilität (`grenzgaenger-plausibilitaet.ts`)** covers the CH hazards structurally: a
  tatsächlicher Kurs without its Beleg (Widerspruch), an echter Grenzgänger without Quellensteuer
  (offen), a Nettolohn contradicting the Lohnausweis arithmetic (Widerspruch), Familienzulagen without
  children (Widerspruch), and the >45-Tage status loss (Hinweis).

## Alternatives considered

- **A separate CH interview controller/service.** Rejected: would duplicate the admission logic; the
  entry-aware write path over `entryForStep`/`isReachableFor` is the ADR-0033 D3 design. Admission is
  then narrowed to an explicit allowlist (`minimal-gate` + `segment-ch`), so the D3 engine is reused
  *without* silently admitting Segment 2.
- **Admit every entry uniformly (no allowlist).** Rejected: that would silently open Segment 2 on the
  shared endpoint — Segment 2's server admission is R2's deliberate opt-in (`interview.ts` header),
  not something this ticket inherits as a side effect of `entryForStep` being generic.
- **Store the Grenzgänger-Status as a column.** Rejected: a derived fact is recomputed, never persisted
  (same instinct as ADR-014/048's estimate range and the Beleg Zuordnung state).
- **Fold deductions/credits into the core `Posten` now.** Rejected: the core's `Posten` is income-only;
  extending it is shared tax-formula work that would diverge from the Angestellten vertical (ADR-0015-Lehre)
  if done unilaterally here.
- **Field-encrypt the `art` discriminator.** Rejected: it is not PII/tax fact and the inbox needs it in
  the clear to group by type, same as the dates.
