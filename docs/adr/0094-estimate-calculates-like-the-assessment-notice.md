# ADR-0094 — The estimate calculates like the Bescheid

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/provision.ts`, `packages/core/src/domains/n-gre.ts` (`assessed`)
  - `packages/core/src/engine/married-estimate.ts`, `packages/core/src/engine/notice-parity.test.ts`
  - `packages/core/src/math/tarif.ts` (`solidaritaetszuschlagInCents`, `capitalFlatTax`, `soliOnFlatTax`)
  - `packages/core/src/common/workdays.ts` (`commuterAllowance`)
  - `apps/api/src/tax-estimate/tax-estimate.service.ts`
- **Builds on:** ADR-0054 (spouse estimate), ADR-0079 (job-change year), ADR-0090 (LStB line 24, NBUV), ADR-0093 (lines of the Lohnsteuerbescheinigung)
- **Changes:** product ADR-015 ("never a point value") for the case that all lines are present

## Context

A run with real documents for 2024 and 2025 ended about €3,230 and €190 away from the Bescheide (Steuerbescheid, tax assessment notices). The breakdown showed errors in both directions that partly cancelled each other out. Part of it was due to the inputs (ADR-0093), part to the calculation:

- Provision was a range of 91 to 93 % of social insurance instead of the maximum-amount calculation.
- Capital income without tax deduction was missing from the spouse estimate.
- The solidarity surcharge was calculated on the tax before reductions and in whole euros.
- Swiss amounts were rounded line by line; the Finanzamt (tax office) converts the sum.

Both Bescheide were copied in full and recalculated. Every sum adds up.

## Decision

1. **Two Bescheide are test cases in the calculation core** (`notice-parity.test.ts`). They contain only amounts, no names, employers or numbers. The Bescheid is expected to the euro, the solidarity surcharge to the cent.
2. **Provision line by line** (`deductibleProvision`, § 10 Abs. 3 und 4 EStG):
   - Retirement provision: employee and employer share together, at most the maximum amount (doubled for spouses), times the share of the year, minus the employer share.
   - Basic health and long-term care insurance in full. Contributions with entitlement to sick pay are reduced by 4 %; the reduction is measured on the contribution after deducting its own subsidy. Tax-free employer subsidies are deducted.
   - Other provision only insofar as the basic cover does not use up the maximum amount. The maximum amount is €1,900 per person with entitlement to health insurance subsidies and €2,800 without; for spouses the amounts add up.
   - If the lines for both spouses are present, provision is one amount. If they are missing, the previous range stays.
3. **Rounding like the Finanzamt:** income down, Werbungskosten (work-related expenses) and credit amounts up. The distance allowance is rounded up to full euros. Swiss salary is the sum in CHF times the rate, rounded down; the withholding tax per person rounded up.
4. **Capital income** above the saver's lump sum bears 25 % (§ 32d Abs. 1 EStG), rounded down to full euros. The lump sum counts once, regardless of where a bank has already taken it into account. Withheld capital gains tax and its solidarity surcharge are credited.
5. **Solidarity surcharge** on the tariff tax after child allowances and after tax reductions, to the cent, fractions of a cent are dropped. On the tax under § 32d, 5.5 % applies without an exemption limit.
6. **Child allowance** one twelfth per month (§ 32 Abs. 6 Satz 5 EStG).
7. **A point value is allowed when nothing is estimated any more.** The range remains the form of the answer; its ends coincide as soon as all lines are present.

## Deliberate differences from the Bescheid

- **Half of the NBUV premium as Werbungskosten** (ADR-0090): it was missing from the tax returns of the real case. The app includes it; there that is €286 and €324 more Werbungskosten than in the 2025 Bescheid.
- **Maximum amount for other provision:** a Grenzgänger (cross-border commuter) without a health insurance subsidy has €2,800. The 2025 Bescheid shows €1,900 for one person because the line in the tax return was empty. The app calculates according to the entry `kvZuschussAnspruch`.
- **Distance:** the app checks no route. If the Finanzamt shortens the distance, the Bescheid differs.

## Open

- A child's supplementary insurance (Anlage Kind, child annex, line 30) has no field yet; it only has an effect if the basic cover does not use up the maximum amount.
- The Einzelveranlagung (separate assessment) still calculates provision as a range.
- The maximum amount for donations (20 % of the total amount of income) is not checked.
