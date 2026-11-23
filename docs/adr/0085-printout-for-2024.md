# ADR-0085 — Printout for 2024, overlong entries before payment

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/printout/`, `scripts/vordrucke/`, `docs/process/official-forms-at-year-change.md`, `apps/mobile-web/src/screens/printout/PrintoutScreen.tsx`
- **Builds on:** ADR-0050 (paper path, measuring the Vordrucke)

## Context

The 2024 Vordrucke (official forms) were in the repo but not measured; there was no printout for
2024. The 2024 Vordrucke are numbered differently from 2025: in the Anlage N the commute is three
lines lower, in the Anlage N-Gre and the Anlage Kind one line higher. Measuring with the 2025 spec
still hit some fields, but in the wrong line, because the same number means something else there.
In the 2024 real case the printout also failed on a provider text that did not fit its line at
10 pt. This only showed up when creating it, i.e. after payment.

## Decision

1. **Measure the 2024 Vordrucke** (293 fields) and read them field by field against 2025 with the
   position report.
2. **Line matching as a tool:** `zeilen-abgleich.mjs` assigns each field the line of the new year
   with the same printed text. Identically worded lines (1st and 2nd entry) and lines without their
   own text get the offset of their neighbors and are reported for checking. `vermessen.mjs --alle`
   lists all fields that cannot be measured instead of aborting at the first one.
3. **Fields a year does not have** (2024: occupation in the Anlage N-Gre) are in `NOT_ON_FORM`.
   Their value is omitted for that year. Any other unknown field ID remains an error.
4. **Overlong entries before payment:** the check before payment renders the printout as a trial
   and reports overlong values as `zuLang.<feld>`. The app names them so that the user shortens
   them. The font is not reduced, because the Vordruck rules require at least 10 pt (ADR-0050). The
   owl proposes at most 45 characters for the childcare provider.

## Consequences

- 2024 real case: the printout is produced. Anlage N-Gre of both partners, commutes with period,
  Kindergeld (child benefit) and childcare match the tax advisor, as far as the stored test data is
  complete.
- The CI job „Vordrucke“ also checks 2024, because it runs through all specs.
- Caught up along the way: the 2025 position report did not yet contain the fields newly measured
  with ADR-0079.
