# ADR-0041 — Grenzgänger-CH-Vertikale: Belegart, CH-Interview-Entry, Wechselkurs-Kern (Entwurf) <!-- adr-check-ignore -->

- **Status:** Draft — not yet promoted to `docs/adr/`
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 09) — draft; promotion needs Musti review
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
   exactly like the Minimal-Gate (REQ-015's pattern), with no second code path.

3. **Wechselkurs-Kern (`wechselkurs.ts`)** — amtlich (BMF-Monatskurs) is the default and needs no
   Beleg; tatsächlich is representable **only with a Beleg** ("ohne Beleg kein tatsächlicher Kurs").
   This is a type-level invariant, not a UI reminder. CHF→EUR conversion carries provenance
   (Kurs + Modus + Monat); the BMF rate *source* stays a later backend slice (ADR-012).

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
  entry-aware write path over `entryForStep`/`isReachableFor` is the ADR-0033 D3 design and admits every
  entry uniformly.
- **Store the Grenzgänger-Status as a column.** Rejected: a derived fact is recomputed, never persisted
  (same instinct as ADR-014/048's estimate range and the Beleg Zuordnung state).
- **Fold deductions/credits into the core `Posten` now.** Rejected: the core's `Posten` is income-only;
  extending it is shared tax-formula work that would diverge from the Angestellten vertical (ADR-0015-Lehre)
  if done unilaterally here.
- **Field-encrypt the `art` discriminator.** Rejected: it is not PII/tax fact and the inbox needs it in
  the clear to group by type, same as the dates.
