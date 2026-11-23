# ADR-0080 — Adding up donation receipts, reading Swiss health insurance statements

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{donation-receipt,ch-health-statement,document-kind}.ts`, `packages/core/src/interview/{advisor,owl-mode}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Builds on:** ADR-0074/0075 (reading Swiss documents), ADR-0076 and ADR-0078 (documents add up)

## Context

In the 2024 real case the app arrived at only a fraction of the donations: each receipt replaced the
previous one. Simply adding them up would also have been wrong, though. One donation appeared with
the same booking number in the joint collective receipt and in a partner's own receipt, and a third
receipt was a duplicate copy. The statements of the Swiss health insurers were read only by the
model, without assignment to a child or a change of insurer.

## Decision

1. **Donations as items.** A fixed reader splits a donation receipt into items: booking number, if
   printed, and always issuer, amount and year. An item counts as already counted if the booking
   number is the same or, if one side has none, issuer, amount and year are the same. New items are
   added to the total, already counted ones are not, and the owl says so. The year is the year of
   the donation, not the date of the receipt.
2. **Health insurance statement as its own document type** (`chKrankenkasse`). It reads the premium
   of the basic insurance per insured person, for Helsana individually per person, for SWICA for the
   whole family. The name decides where the premium belongs: to Person A, to Person B (each
   `krankenkasseChf`) or to a child (`healthBasicEur`, Anlage Kind Kz 66, in euros at the
   Lohnausweis (Swiss salary certificate) rate). If several persons match, the one with the most
   names wins; on a tie it stays open. Without an exchange rate there is no draft for the child, only
   a hint.
3. **A change of insurer adds up, the same statement does not.** A second insurer in the year is
   added to the first. The same statement again does not count.
4. **Counted items on the draft.** Each draft carries its counted items only as a hash. They stay on
   the server and never go to the client. A hash starts with a digit so that the IBAN block does not
   take it for an IBAN.
5. **Legal source `estg-10-1-3`** (basic health insurance).

## Consequences

- 2024 real case: donations as with the tax advisor, in any upload order; the health insurance
  premiums of both partners as with the tax advisor.
- 2025 real case: donations as with the tax advisor; the receipt for 2024 lands in 2024. For health
  insurance the app counts both insurers of the year; the tax advisor claimed only the first (open
  question to him).
- Self-borne medical costs from the statement are mentioned by the owl only as a hint. They belong
  to the medical costs (§ 33) and are not applied automatically.
