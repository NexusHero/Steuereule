# ADR-0076 — More Werbungskosten, childcare and the employer share of the premiums

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/prisma/schema.prisma` (commute, child), `apps/api/src/commute/`, `apps/api/src/children/`, `apps/api/src/confirmation/field-access.ts`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/src/printout/`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/{advisor.service,advisor-case-facts}.ts`, `apps/api/src/ki/advisor-prompt.ts`, `apps/api/src/ch-certificate-scan/ch-letter.parse-strategy.ts`, `packages/core/src/domains/{work-expenses,childcare,n-gre}.ts`, `packages/core/src/interview/{advisor,field-catalog}.ts`, `apps/mobile-web/src/screens/{workdays,children,cross-border}/`
- **Builds on:** ADR-0050 (measuring printout fields), ADR-0072 (N-Gre premiums), ADR-0073 (Person B), ADR-0075 (premium letter)

## Context

In the real case the tax advisor claimed work equipment (work clothing), account fees and
childcare. The app had no field for these: the owl named them as levers but could not store them
anywhere, the estimate did not know them, the printout did not print them. Documents about work
equipment ended up as "further training = yes". For Grenzgänger (cross-border commuters), further
training and relocation did not count in the estimate at all. The employer amount of a premium was
only visible in the form at 100 %, although the calculation always uses it and a premium letter
states it without a share.

## Decision

1. **More Werbungskosten (work-related expenses) per person in the commute form:** professional
   associations (Kz 310), work equipment and typical work clothing (Kz 320, with "what it was"),
   account fees and other (Kz 380, with "what for"). The commute form is already kept per person,
   also for Person B; saving without these fields leaves them unchanged. Encrypted like all
   amounts.
2. **Estimate:** they count together with commute and home office and are compared with the
   employee lump sum as before. Further training and relocation now also count for Grenzgänger.
3. **Printout:** Anlage N l. 53/54/56 and 62–64, Anlage N-Gre l. 48/49/51 and 57–59, newly measured.
4. **Childcare per child** (amount, type/provider, period): Anlage Kind l. 67 (Kz 51). From 2025 the
   estimate deducts 80 %, at most €4,800 per child (before that two thirds, at most €4,000), only for
   a child who was not yet 14 at the start of the year; for a married couple once for the household.
5. **Owl and documents:** the fields are in the field catalog and are draft targets (also for
   Person B). The owl knows their effect in the case overview. A work equipment document goes to
   Kz 320; several documents add up to the annual total instead of replacing each other. A value
   that is not a plain amount is left in place for the PII check and is not "corrected".
6. **Premiums:** the employer amount is visible as long as the share is open or 100 %. If the person
   pays nothing toward the Krankentaggeld (sickness daily allowance) themselves, the employer counts
   as the 100 % payer — in the calculation and in the premium letter reader. For the NBUV the share
   remains a question to the user, because the employee share there is only a remainder from item 9.

## Consequences

- Real case: work equipment and account fees per person and the childcare can be entered and appear
  in the printout as with the tax advisor.
- Not included: further training costs (Kz 330) are not in the printout yet; travel expenses and
  double housekeeping stay as before.
