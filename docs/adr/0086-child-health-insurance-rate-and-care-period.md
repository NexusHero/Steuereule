# ADR-0086 — Child's health insurance without a chosen rate, care period from the Bescheid

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `packages/core/src/domains/childcare-notice.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Builds on:** ADR-0080 (health insurance statements), ADR-0076 (childcare)

## Context

In the complete 2024 run two things were missing. The user uploaded the health insurance statement
for the child before choosing an exchange rate in the Lohnausweis (Swiss salary certificate). The app
promised to convert the amount later, but never came back to it. It recognized the Bescheid (notice)
of the child day care, but created no draft. The care period was therefore guessed (whole year
instead of from the start according to the Bescheid).

## Decision

1. **Rate for the child:** if no rate has been chosen yet, the app converts the child's premium at
   the official annual average (as printed by the Anlage N-Gre). The draft is „prüfen“ ("check"),
   and the owl says that it must be adjusted for a different rate.
2. **Care period from the Bescheid:** a Bescheid or an invoice for childcare („ab …“, „vom …
   bis …“ ("from …", "from … to …")) yields the period in the tax year for Anlage Kind line 67. A
   start without an end runs until the end of the year. If the start is followed by a time limit
   („befristet bis …“, „bis zum …“ ("limited until …", "until …")), the period ends there, also in
   the following year. The draft goes to the only child of the year; if there are several, to the
   child whose first name is in the Bescheid. If none or more than one matches, no draft is created,
   and the owl asks to enter the period for the child. The app does not read the amount, because a
   Bescheid only states a monthly fee; the owl asks for the amount actually paid.
3. Document drafts may carry text (date), not only amounts.

## Consequences

- 2024 real case: the child's health insurance is in the draft, the care period is the one from the
  Bescheid, as with the tax advisor.
- A Bescheid from the previous year with a time limit into the new year also yields the correct
  period in the new year.
