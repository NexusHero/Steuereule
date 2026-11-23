# ADR-0090 — Findings from the real-case run through the stream (2024/2025)

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/{engine/married-estimate,domains/{lstb,n-gre,health-insurance,extraordinary-burdens},common/print-width,interview/{interview,field-catalog}}.ts`
  - `apps/api/src/{lstb,children,printout,tax-estimate,confirmation,ch-certificate-scan}/`
  - `apps/api/prisma/`
  - `apps/mobile-web/src/screens/{lstb,children,master-data,filing-type-comparison}/`
  - `e2e/forms/real-case-additions.mjs`
- **Builds on:** ADR-0063 (church tax lines of the LStB, Lohnsteuerbescheinigung / wage tax certificate), ADR-0066 (the owl's field catalog), ADR-0079 (job-change year), ADR-0080 (Swiss health insurance statement), ADR-0087/0088, ADR-0089 (the stream)

## Context

The real case of a married Grenzgänger (cross-border commuter) household for 2024 and 2025 was run through the app alone, with the new stream. The app produced the printouts itself. The advisor's tax return and the Bescheid (Steuerbescheid, tax assessment notice) served as a comparison only afterwards. The run showed errors, gaps and two domain questions. We settled the questions using the official 2025 instructions and the Vordrucke (official forms).

## Decision

1. **Filing type comparison on the filing page.** It starts from the known marital status: master data or the basis answer. Until now it always stood at „Nein“ ("No"). The two buttons share the row instead of sticking out of the card.
2. **Taxable income (zvE) as in the Bescheid.** For Zusammenveranlagung (joint assessment), the estimate reports taxable income after the allowances for children when these are more favorable than Kindergeld (child benefit) (§ 2 Abs. 5 EStG). The tax itself was already correct. But the comparison with the Bescheid made it look as if the child allowance were missing.
3. **Religion of Person B.** The partner form asks for B's religion and stores it only with consent (Art. 9 DSGVO). Without this information the church tax of the Zusammenveranlagung stayed „offen“ ("open").
4. **LStB line 24.** The tax-free employer contributions to health and long-term care insurance (a–c, as a sum) are an optional line next to the church tax: own column, encrypted, endpoint `lstb-zuschuesse`. The estimate deducts them from the social insurance share, because only what the employee bore is deductible (§ 10 Abs. 2 Satz 1 Nr. 1 EStG). The owl can now also write line 24 and church tax lines 6/7.
5. **Reimbursed medical costs.** The interview asks for the costs before reimbursement (Kz 302) and for what the insurer, insurance or Beihilfe (civil-service allowance) reimbursed (Kz 303, new question `gesundheit-erstattung`). The difference is deductible, never less than 0. Before, the user had to do the arithmetic; in the real case this went wrong.
6. **Daycare provider.** The field accepts only as much text as fits in line 67 of Anlage Kind (child annex), and says so. It is measured in Helvetica 10 pt (`printedWidthPt`) and against the narrower box of the 2024/2025 Vordrucke. A parity test matches the widths with the renderer. The printout therefore no longer rejects a text that is too long only after payment.
7. **N-Gre line 82 stays.** Krankentaggeld (Swiss daily sickness allowance insurance) and half of the NBUV (non-occupational accident insurance) belong in lines 80/81 (sum line 82) according to the form and the 2025 ELSTER instructions. The advisor and the Finanzamt (tax office) left them out. They have no tax effect when the basic health insurance already uses up the maximum of €2,800.
8. **New: the other half of the NBUV** counts as Werbungskosten (work-related expenses), N-Gre lines 57/58 (Kz 380) and in the estimate. That is what the instructions on lines 97/98 say: a non-occupational accident includes the commute.
9. **Child's Swiss health insurance in Kz 89.** A child now has `healthInsuranceAbroad`. If it is set, health and long-term care insurance go together into Anlage Kind, Kz 89 („ausländische Kranken- und Pflegeversicherung“ ("foreign health and long-term care insurance"), 2024 line 36, 2025 line 37), not into Kz 66/67. The Swiss health insurance statement sets the flag itself, and the owl can write it.
10. **No double counting.** A health insurance entered as „ausländisch“ ("foreign") in the interview does not count again when the Grenzgänger screen already has a Swiss insurer. Both are the same policy.

The comparison of stream versus chat (seven made-up households) added:

11. **Life events in the printout.** Until now they were missing from the PDF, and the check reported nothing. Now the app prints:
    - Further training: Anlage N line 60 or N-Gre line 55, Kz 330.
    - Relocation: as other Werbungskosten, Kz 380.
    - Income replacement benefits: main form line 35, Kz 120 for A and Kz 121 for B.

    For severance pay (Anlage N lines 17/18, depending on how the employer taxed it) and double housekeeping (separate annex) there is no printout yet. The check now says so explicitly instead of printing silently.
12. **Anlage Kind without a child.** If the basis names children but none is entered, the check reports „kinder“.
13. **LStB for B in the job-change year.** If B works in Switzerland and B's commute shows a job change (or an LStB is already entered), the cockpit also offers B's German LStB. It is the same rule as for A in the stream (`hasGermanJobToo`).

## Consequences

- In the 2025 real case, the app's health insurance (insurer change Helsana → SWICA on 1 July) and line 82 are correct. The advisor and the Finanzamt overlooked the SWICA half and the child's health insurance. That is a pointer for an objection, not an app error.
- **E2E:** `real-case-additions` checks rows B (daycare too long, insurer abroad), G (religion of B) and H (line 24). `e2e/advisor/strom-vs-chat.mjs` compares stream and chat per household (manual, costs model calls).
- **Open:**
  - The single-filing path of the estimate does not yet have a Günstigerprüfung (most-favorable comparison) for high-income single parents.
  - Person B is not in the stream yet (separate PR).
