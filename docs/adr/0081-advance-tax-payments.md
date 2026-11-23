# ADR-0081 — Advance tax payments in the estimate

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/interview.ts`, `apps/api/src/tax-estimate/`, `apps/mobile-web/src/screens/cockpit/tiles.ts`
- **Builds on:** ADR-0079 (change year), ADR-0080

## Context

Grenzgänger (cross-border commuters) pay no wage tax in Germany; the Finanzamt (tax office) sets
advance tax payments (§ 37 EStG). In the 2025 real case the estimate therefore showed an additional
payment of almost the whole annual tax, although a large part had already been paid in advance. The
app had no field for advance tax payments.

## Decision

1. **Dedicated question in the interview**, entry `vorauszahlungen`: „Vorauszahlungen ans Finanzamt
   geleistet?“ ("Made advance payments to the tax office?"), then the total for the year (income
   tax, Soli and church tax together). „Betrag später“ ("Amount later") is allowed.
2. **Estimate:** the total is credited like withheld tax (§ 36 Abs. 2 Nr. 1 EStG). It shifts the
   result, appears as a separate value `prepayments` alongside it and not in `anrechnung`. This
   leaves the reconciliation with the Bescheid (tax assessment notice) (tax deduction amounts)
   untouched. In a Zusammenveranlagung (joint assessment) there is one Bescheid, so the question is
   asked once, for Person A.
3. **Tile „Vorauszahlungen ans Finanzamt“** ("Advance payments to the tax office") in the cockpit,
   at the front for Grenzgänger and landlords, otherwise under „Weitere Themen“ ("More topics").
4. **No printout:** the tax return does not ask for advance tax payments; the Finanzamt knows them.

## Consequences

- The estimate's additional payment is only meaningful once the advance tax payments are entered.
  The owl lists them among the open points for Grenzgänger.
- A reader for the advance payment notice will follow if needed.
