# ADR-0079 — Change year: German and Swiss salary in one year, two commutes

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/engine/{tax-estimate,married-estimate}.ts`, `packages/core/src/common/workdays.ts`, `packages/core/src/interview/field-catalog.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/commute/`, `apps/api/src/confirmation/field-access.ts`, `apps/api/src/printout/`, `apps/mobile-web/src/screens/workdays/WorkdaysScreen.tsx`
- **Builds on:** ADR-0074 (reading the Swiss Lohnausweis), ADR-0076 (more Werbungskosten)

## Context

Anyone who changes from a German to a Swiss employer during the year has both: a
Lohnsteuerbescheinigung (wage tax certificate) (Anlage N) and a Lohnausweis (Swiss salary
certificate) (Anlage N-Gre). In the 2024 real case the estimate computed only the Swiss part, and
the commute applied to the whole year, although the commute to Switzerland existed for only two
months.

## Decision

1. **Estimate with both salaries.** If a complete Lohnsteuerbescheinigung and a Lohnausweis are
   present, both salaries count. There is one employee lump sum, the German social insurance is
   added to the pension provision, and wage tax, solidarity surcharge and Swiss Quellensteuer
   (withholding tax) are credited. This applies to single persons and to spouses (type `mixed`).
2. **Two commutes with a period.** The first commute gets a period (`periodFrom`/`periodTo`). A
   second commute after the change has its own kilometers, its own means of transport, its own
   workplace (encrypted) and its own period. The commuting days of the year are split by the
   weekdays on which each commute existed. The app knows vacation, sickness and home office only
   for the whole year; they are therefore distributed evenly.
3. **Printout.** A change from Germany to Switzerland puts the first commute in the Anlage N and the
   second in the Anlage N-Gre, each with „vom/bis“ ("from/to"). Two commutes on the same form appear
   there as 1st and 2nd entry (Kz 110–112 and 130–132). The further Werbungskosten (work-related
   expenses) are listed with the first commute, so only once.
4. **Form.** The switch „Arbeitsstelle im Jahr gewechselt?“ ("Changed job during the year?") opens
   the end date of the previous commute and the new commute. A half-typed date is not stored.
5. **Owl.** It may propose period, kilometers and means of transport of the second commute. Not the
   workplace, as with the first commute.

## Consequences

- 2024 real case: the estimate now computes the German and the Swiss salary together. The new
  commute counts only for November and December, with the same number of days as with the tax
  advisor.
- Fixed along the way: the commute form's interface did not pass the further Werbungskosten from
  ADR-0076 on to storage. Now it passes on all fields the client sends. Missing fields leave the
  stored value in place.
- The split by weekdays is an approximation. Anyone who knows the exact days per commute can adjust
  the period. There is no separate days field per commute.
