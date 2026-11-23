# ADR-0087 — Escalation case: two Grenzgänger with a change year, three children, medical costs

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ch-salary-certificate/`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/src/lstb-scan/lstb-scan.parse-strategy.ts`, `apps/api/src/advisor/{advisor.service,advisor-drafts}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `packages/core/src/domains/{medical-invoice,childcare-notice}.ts`, `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`, `apps/mobile-web/src/screens/cockpit/CockpitPartnerSection.tsx`, `e2e/scenarios/25-familie-sommer-eskalation.mjs`
- **Builds on:** ADR-0054 (Person A enters data for Person B), ADR-0074 (reading the Lohnausweis), ADR-0077 (medical costs), ADR-0079 (change year), ADR-0080 (health insurance statements), ADR-0086 (care period)

## Context

A deliberately exaggerated, fictional case: both spouses work until June for a German employer
(German social insurance and pension) and from July as Grenzgänger (cross-border commuters) in
Switzerland (AHV, Pensionskasse with Obligatorium, Quellensteuer). Three children are in
kindergarten and day care, there is a dentist invoice of €1,700 and a cosmetic surgery. Every
document should find a field, and the printout should be complete. The first run found these gaps:

- For Person B there was neither a Lohnausweis (Swiss salary certificate) form nor an interface. B's
  employer address, rate and Grenzgänger status could not be entered anywhere; the printout stayed
  locked.
- The joint estimate did not count B's Swiss salary as soon as B also had an LStB, because B as a
  person without an account has no interview answer „Schweiz“ ("Switzerland").
- B's read LStB was prepared as a draft for A and displaced A's own LStB drafts.
- Amounts with a thousands dot were read incorrectly (€1.700,00 as €700).
- Doctor and dentist invoices found no field. A cosmetic surgery was not recognized.
- The self-borne costs in the Swiss health insurance statement appeared only as a hint.
- A day care document with an annual total paid yielded only the period, not the amount.
- An invoice that builds on a still open document draft replaced it instead of adding to it.

## Decision

1. **B's Swiss data.** All endpoints of `ch-lohnausweis` take `?person=B`, like LStB and commute
   (ADR-0054). B's own Grenzgänger questions (residence, non-return days) are stored by `PUT
   ch-lohnausweis/grenzgaenger?person=B` as B's answers. Estimate, printout and form derive B's
   status from them as for A from the interview. For A the interview remains the place for these
   questions (400 without `person=B`). In the cockpit, B has the field „Lohnausweis Schweiz“ in a
   Switzerland tax return. B's form first asks for residence and days.
2. **Estimate.** A person with a Lohnausweis counts as a Grenzgänger if they answered „Schweiz“ or
   answered the Grenzgänger questions. With an LStB in addition it is a change year (ADR-0079),
   also for B.
3. **Whose LStB.** An LStB without a specified person (upload in the chat) belongs, in a
   Zusammenveranlagung (joint assessment), to the person whose name is on it. If none matches, the
   chat asks as for the Lohnausweis. Drafts for B carry `person: 'B'` and do not displace A's
   drafts.
4. **Medical costs from invoices (§ 33 EStG).** A doctor, dentist or similar invoice becomes a draft
   for `gesundheit-betrag` with „Ja“ ("Yes") as the accompanying answer. The amount is the own share
   after a printed reimbursement, otherwise the invoice amount. Several invoices add up, the same
   invoice counts once. The app does **not** record a cosmetic surgery or cosmetic treatment: no
   draft, and the chat says why (Product Owner decision: "do not record at all"). § 33 EStG is a
   legal source of the owl.
5. **Self-borne costs from the Swiss statement** (franchise, deductible) go to the medical costs in
   euros at the Lohnausweis rate (otherwise at the annual average, „prüfen“ ("check")), once per
   statement.
6. **Day care amount.** If a document states the total paid for the year („Gesamt 2025“, „im Jahr
   2025 gezahlt“ ("total 2025", "paid in 2025")), it is proposed as a „prüfen“ draft. A monthly fee
   still does not count as an amount (ADR-0086).
7. **Summing up and conflicts.** An invoice also adds onto an open document draft and takes over its
   counted items. A field that, when applying, already has exactly the draft's value (two documents
   both open „Krankheitskosten: Ja“ ("Medical costs: yes")) is not a stale state.
8. **Amounts** with a thousands dot are read in full; the line with the invoice amount takes
   precedence.
9. **Reasonable burden with entered children.** The interview answer „2 oder mehr“ ("2 or more")
   does not distinguish 2 from 3+ and still counts as "1–2". If children are entered for the year,
   their number decides: from three, 1/1/2 % applies (§ 33 Abs. 3 EStG). Found when comparing with
   the BMF calculator; its tariff values for the case matched.

## Consequences

- Scenario 25 („Familie Sommer“) in the E2E matrix plays through the case: documents in the chat and
  via the same interface, B's Switzerland form in the browser, then the remaining forms. It checks
  the estimate with both change years, a printout without missing entries and every amount in its
  field. Medical costs: €1,700 plus the self-borne costs, never the €3,800 of the surgery.
- Cosmetic surgeries with medical necessity confirmed by a public health officer are entered by the
  user themselves; the app does not recognize them as an exception.
- The Anlage N still does not print the wage tax (it comes from the electronic LStB), only the gross
  salary.
