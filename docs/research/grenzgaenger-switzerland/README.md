# Grenzgänger Switzerland: where the tax return and Bescheid of a real case are wrong

As of: 22.11.2026. Occasion: a married couple (resident in Baden-Württemberg, both Grenzgänger (cross-border commuters) to Switzerland, one child) has tax returns and Bescheide (tax assessment notices) for 2024 and 2025 prepared by their tax advisor. Comparing them with the app showed deviations. For each one, this file states what the primary sources say. The case values are without names; the individual research notes sit alongside.

Primary sources: statutory text (gesetze-im-internet.de), official guide to the income tax return 2024/2025 (ELSTER help, section Anlage N-Gre), BMF letters, BFH decisions. No result rests solely on a secondary source; whatever was not read directly is marked as „nicht geprüft“ (not verified) in the individual files.

## Result per point

| # | Point | Tax return/Bescheid | Correct | Certainty | File |
|---|---|---|---|---|---|
| 1 | Collective Krankentaggeld (sickness daily allowance) in gross salary (item 8), paid by the insurer via the employer | 2024 left as wages, 2025 deducted | tax-free, deduct in the N-Gre line „Steuerfreies Krankentaggeld“ (2024 l. 8, 2025 l. 9) | high | `01-krankentaggeld.md` |
| 1a | Progressionsvorbehalt (progression proviso) on this daily allowance | – | according to the guide and FG BW 14 K 2647/18 no; BFH VI R 26/24 (accident daily allowance) could be transferred | medium | `01-krankentaggeld.md` |
| 2 | Swiss Kinderzulage (child allowance, FamZG) in gross salary | not deducted | tax-free (guide N-Gre, § 65 EStG), deduct (2024 l. 7, 2025 l. 8); no Progressionsvorbehalt. BFH VI R 24/17: the advisor omitting it is grossly negligent | high (result), medium (exact provision) | `02-kinderzulage.md` |
| 2a | Swiss withholding tax on the tax-free portion | fully credited | according to the guide (line 25) only to the extent the income is recorded | medium (directive only secondary) | `02-kinderzulage.md` |
| 3 | Second KVG basic insurer after switching insurer during the year | missing | contributions to both insurers in full as basic cover (§ 10 Abs. 1 Nr. 3 a EStG, BMF Rz. 140); child in Anlage Kind Kz 89 | high (approx. 90 %) | `03-health-insurance-switch-basic-cover.md` |
| 4 | Half of the NBUV premium as Werbungskosten (work-related expenses) | not claimed | correct: 50 % each Werbungskosten (l. 59) and provident expenses (l. 81), BMF 28.10.2009 Tz. 1.3 | high (employee share), medium-high (employer share) | `04-nbu-werbungskosten.md` |
| 5 | Cap on other provident expenses with self-paid KVG | 1.900 € for one person | 2.800 € (§ 10 Abs. 4 Satz 1); has no effect here because the basic contributions exceed the cap (Satz 4) | high | `05-cap-on-other-provident-expenses.md` |

## Recomputed target (calculation core, notice cases from `notice-parity.test.ts` with the corrections)

Minus = additional payment, plus = refund, after advance tax payments. Tax-free daily allowance and Kinderzulage are also not AHV wages: the deductible retirement provision decreases with them (guide N-Gre l. 75 to 77 and 83, AHV/IV 5,05 % of line 77). This consequence is included.

| 2024 | zvE (taxable income) | after advance tax payments |
|---|---|---|
| Bescheid | 174.855 | −4.059,90 |
| **all corrections, without Progressionsvorbehalt, credit reduced (target)** | **153.276** | **+5.082,72** |
| the same with Progressionsvorbehalt on the daily allowance | 153.276 | +2.121,84 |
| the same with full credit (as the app does today) | 153.276 | +6.082,72 |

| 2025 | zvE | after advance tax payments |
|---|---|---|
| Bescheid | 221.690 | −4.633,52 |
| **all corrections, credit reduced (target)** | **214.556** | **−1.405,00** |
| the same with full credit (as the app does today) | 214.556 | −1.281,00 |

The 2025 daily allowance is already deducted in the Bescheid; point 5 changes nothing. Open and not included: a second donation receipt over 230 € in 2024 (duplicate or separate donation, question for the taxpayers), the awning in 2025 (around 200 €) and the exchange rate (BMF annual average 2025 recomputed as 1,0671 instead of 1,065; under 20 € effect on health insurance).

## What this means for the acceptance tests

The target of a real case is not the Bescheid, but the Bescheid with the documented corrections from this list. The case is an acceptance test in `apps/api/test/acceptance/echtfaelle/`. A point with medium certainty (1a, 2a) is kept in the test as a separate variant, not silently chosen. The calculation above is an estimate by the calculation core and not tax advice.
