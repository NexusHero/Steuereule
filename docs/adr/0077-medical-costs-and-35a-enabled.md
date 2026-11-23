# ADR-0077 — Medical costs (§ 33) and household-related expenses (§ 35a) enabled

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/config/features.ts`, `apps/mobile-web/src/config/features.ts`, `apps/api/src/printout/{printout-values,printout.service,form-renderer}.ts`, `apps/api/src/printout/felder-2025.{spec.json,json}`
- **Builds on:** ADR-0032 (switch `HOUSEHOLD_AND_HEALTH_BOOSTERS`), ADR-0050 (measuring the printout)

## Context

The questions about medical costs and household-related expenses and their calculation (reasonable
burden, 20 % tax reduction) were built but switched off: at the time there was no reliable total
amount of income, and no Vordruck (official form) could print the values. The estimate now computes
the total amount of income itself. In the real case the chiropractor and the tradesman labor share,
which the tax advisor had claimed, were therefore missing.

## Decision

1. The switch is on (API and app). The tile „Haushalt & Handwerker“ ("Household & tradesmen") is at
   the front for everyone, „Gesundheit“ ("Health") at the front for pensioners, parents and single
   parents, otherwise under „Weitere Themen“ ("More topics").
2. The printout fills the **Anlage Außergewöhnliche Belastungen** l. 23–25 (Kz 302, 303 = 0, because
   the interview asks for the costs after reimbursements) and the **Anlage Haushaltsnahe
   Aufwendungen** l. 4 (Kz 202), l. 5 (Kz 212) and l. 6/9 (Kz 214). Both Vordrucke are newly
   measured and come after the Sonderausgaben (special expenses).
3. If the switch is off, the printout prints none of this and the interview stores none of it.

## Consequences

- Medical costs are one total; doctor, dentist, glasses are not kept separately.
- For tradesmen only the labor share is known; the user adds the invoice amount in l. 6 in the
  printout.
