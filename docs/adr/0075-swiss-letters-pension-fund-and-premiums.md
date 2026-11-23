# ADR-0075 — Swiss letters: Pensionskasse statement and the employer's premium confirmation

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{ch-insurance-letters,document-kind}.ts`, `apps/api/src/ch-certificate-scan/ch-letter.parse-strategy.ts`, `apps/api/src/receipt/{receipt-parse.service,dto/parse-receipt.dto}.ts`, `apps/mobile-web/src/lib/receipts/captureReceipt.ts`, `apps/mobile-web/src/screens/advisor/CopilotBridgeProvider.tsx`
- **Builds on:** ADR-0072 (N-Gre: Pensionskasse split, premium shares), ADR-0073 (Person B), ADR-0074 (Lohnausweis)

## Context

For the Anlage N-Gre the Lohnausweis (Swiss salary certificate) is not enough. The split of the
Pensionskasse (Swiss occupational pension fund) into mandatory and over-mandatory (lines 20, 84, 87)
is in the Pensionskasse statement; what the employer paid for Krankentaggeld (sickness daily
allowance) and non-occupational accident insurance (lines 18, 19, 95–98) is in the employer's
confirmation. The general document recognition created at most one field from these, and the
employer premium ended up in the field for the employee's premium.

## Decision

1. **Two dedicated document types** `chPensionskasse` and `chPraemien`, recognized in
   `classifyDocumentKind` by their content (mandatory + sender Pensionskasse/BVG; Krankentaggeld +
   non-occupational accident + premium/contribution).
2. **Fixed rule, no model.** The letters are not a standard form; the rule reads the two layouts of
   the Pensionskassen that occur (lines with employee/employer columns and „davon BVG“ ("of which
   BVG") lines; a mandatory/over-mandatory/TOTAL table per side) and the amounts of the premium
   letters. What it does not read stays open and is asked for instead of guessed. If a contribution
   type is missing in a scan, no total is formed from the rest.
3. **Checks.** Mandatory + over-mandatory = total per side. The total employee contributions must
   equal item 10 of the already entered Lohnausweis; if they differ, the drafts are „prüfen“
   ("check"), and the owl asks whether the statement belongs to the right year. A letter from
   another year is not prepared.
4. **Fields.** Pensionskasse → `pkArbeitnehmerChf`, `pkArbeitgeberChf` (each mandatory),
   `pkArbeitgeberGesamtChf` (from which line 20). Premium letter → `krankentaggeldArbeitgeberChf`,
   `nbuvArbeitgeberChf`; 100 % only if the letter says that the employer pays the full premium.
   Otherwise the owl asks about the share.
5. **Person as for the Lohnausweis** (ADR-0074): the name in the letter decides; if it matches
   neither or both persons, the app asks. Name, AHV and insurance number never leave the server and
   appear in no draft.

## Consequences

- Real case 2025: the wife's statement yields lines 84 and 20 as in the tax advisor's return. For
  the husband the line „Sparbeitrag“ ("savings contribution") was missing in the scan; the total
  employer contributions stay open and are asked for.
- A file in the 2025 folder was the statement for 2024; the year check holds it back.
