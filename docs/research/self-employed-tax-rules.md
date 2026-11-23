# Tax rules for the self-employed 2022–2026 — sources

As of: 19.11.2026. Basis for `packages/core/src/domains/business/*` and its integration into the estimate (`engine/business-income.ts`, ADR-0101). "Checked" means: read in the statutory text on gesetze-im-internet.de or in the BMF letter itself. "Not checked against the primary text" is noted where only secondary sources or memory support the statement.

## Freelance profession or trade (`profession.ts`)

- § 18 Abs. 1 Nr. 1 Satz 2 EStG: catalog professions and scientific, artistic, literary, teaching and educational activity. Checked.
- § 18 Abs. 1 Nr. 1 Satz 3 und 4 EStG: assistance from professionally trained staff only with the person's own leading and self-responsible activity; a stand-in during temporary unavailability does no harm. Checked.
- § 15 Abs. 2 EStG: Gewerbebetrieb (trade or business) as the catch-all category. H 15.6 EStH on the „ähnlicher Beruf“ (similar profession): not checked against the primary text.

## Depreciation (`depreciation.ts`)

- § 6 Abs. 2 EStG: GWG (low-value assets) up to €800 net; register above €250. § 52 Abs. 12 EStG: for acquisitions after 31.12.2017. Checked.
- § 6 Abs. 2a EStG: Sammelposten (pool) above €250 up to €1,000, one fifth each in the year of formation and the four following years, a disposal does not reduce it, immediate deduction up to €250, uniform for all assets of the year. Checked.
- § 7 Abs. 1 Satz 4 EStG: in the year of acquisition, one twelfth less for each full month before the month of acquisition. Checked. Year of disposal pro rata including the month of disposal (R 7.4 Abs. 8 EStR): not checked against the primary text.
- § 7 Abs. 2 EStG, declining-balance AfA (depreciation): current text 1.7.2025–31.12.2027, 3 times, at most 30 %. Checked. § 52 Abs. 15 Satz 4 EStG names the windows 1.1.2020–31.12.2022 and 1.4.–31.12.2024. Checked. The rates of these windows (2.5 times/25 % and 2 times/20 %) come from the amending acts: not checked against the primary text.
- § 7 Abs. 4 EStG: 3 % for business buildings (Nr. 1), 3 % for residential buildings completed after 31.12.2022, 2 % otherwise, 2.5 % before 1925. Checked.
- § 7 Abs. 5a EStG: 5 % of the residual value for residential buildings with construction start 1.10.2023–30.9.2029. Checked.
- AfA-Tabelle AV (depreciation table for general assets), BMF 15.12.2000, IV D 2 - S 1551 - 188/00, BStBl I S. 1532: useful lives in the code with citation. Checked against the table text.
- BMF 22.02.2022, IV C 3 - S 2190/21/10002 :025 (replaces BMF 26.02.2021): computer hardware and software 1 year; no option, register required, full AfA in the year of acquisition is not objected to (Tz. 1.1, 1.2, 1.4). Checked via WD 4 - 3000 - 051/22 of the Bundestag. Whether smartphones fall under it: open; the code uses 5 years (AfA-Tabelle AV 6.13.2.2).
- § 7g Abs. 1 EStG: IAB (investment deduction) up to 50 %, profit limit €200,000, maximum €200,000 per business. Abs. 2: add-back up to 50 % of the costs, reduction of the costs. Abs. 3: reversal after the third following year. Abs. 5: special AfA up to 40 % in the year of acquisition and the four following years. Abs. 6: profit limit, almost exclusively business use. Checked.
- § 52 Abs. 16 EStG: 40 % for acquisitions after 31.12.2023 (before that 20 %); investment period for deductions from 2017 six, 2018 five, 2019 four years. For 2020 and 2021 no extension in the text. Checked.
- § 7a Abs. 9 EStG: after the end of the incentive period, residual value over the remaining useful life. Not checked against the primary text.

## Umsatzsteuer (VAT) (`vat-annual.ts`, `business-taxes.ts`)

- § 12 Abs. 1, 2 UStG: 19 % and 7 %. § 12 Abs. 3 UStG: 0 % photovoltaics up to 30 kWp. Checked (text without time limit).
- § 12 Abs. 2 Nr. 15 UStG, food in restaurants excluding drinks: 7 % from 1.1.2026, Steueränderungsgesetz 2025 of 22.12.2025 (BGBl. 2025 I Nr. 363). Checked against the current text; date via Bundestag/KPMG/Haufe. 7 % from 1.7.2020 to 31.12.2023 and 19 % in 2024/2025: not checked against the primary text.
- § 28 Abs. 5 UStG, gas 7 % from 1.10.2022 to 31.3.2024: not checked against the primary text.
- § 19 Abs. 1 UStG: €25,000 previous year, €100,000 current year (from 2025); total turnover based on payments received (Abs. 2); waiver binds for five years (Abs. 3). Checked. BMF 18.03.2025, III C 3 - S 7360/00027/044/105: exceeding €100,000 ends the scheme with that transaction. Until 2024 €22,000 / €50,000: not checked against the primary text.
- § 20 Satz 1 UStG: cash-basis taxation up to €800,000 previous-year turnover, for freelance professions without limit. Checked. €600,000 until 2023: not checked against the primary text.
- § 13b, § 15 Abs. 1 Satz 1 Nr. 4, § 19 Abs. 1 Satz 4 UStG (reverse charge, deduction, Kleinunternehmer without deduction): not checked against the primary text.

## Gewerbesteuer (trade tax) (`trade-tax.ts`)

- § 8 Nr. 1 GewStG: one quarter of the sum of a) to f) above €200,000; d) one fifth (half of that for electric vehicles and bicycles), e) one half, f) one quarter. Checked.
- § 9 Nr. 1 Satz 1 GewStG from EZ 2025: the Grundsteuer (property tax) recorded as a business expense in the assessment period (§ 36 Abs. 4b Satz 1 GewStG, version of the JStG 2024 of 2.12.2024). Checked. Until 2024 1.2 % of 140 % of the Einheitswert (assessed value): via Haufe/NWB, not checked against the primary text.
- § 10a GewStG: deficits up to €1 million in full, above that 60 %. Checked.
- § 11 Abs. 1, 2 GewStG: rounding down to full €100, allowance €24,500 at most up to the rounded-down income, base rate 3.5 %. Checked. R 14.1 Satz 3 GewStR: round the base amount down to full euros (via NWB, version of the GewStR 2009).
- § 35 Abs. 1 EStG: 4.0 times the base amount, maximum reduction amount, limit to the trade tax actually payable. Checked.
- BMF 03.11.2016, IV C 6 - S 2296-a/08/10002-003, BStBl I S. 1187, amended by BMF 17.04.2019, IV C 6 - S 2296-a/17/10004: Rn. 4 (starting figure, § 35a after it), Rn. 9 (limited per business), Rn. 10 (spouses), Rn. 16–18 (formula, positive income per type of income, examples). Checked against the text. I did not find a newer letter.
- § 51a Abs. 2 Satz 3 EStG: § 35 is disregarded for church tax. Checked. § 3 Abs. 2 SolZG: Soli (solidarity surcharge) on the income tax to be assessed with child allowances; does not name § 35. That § 35 reduces the Soli is the usual reading; not supported by the wording.

## Losses (`losses.ts`)

- § 10d Abs. 1 EStG (version from 1.1.2024): carry-back up to €1 million (€2 million jointly), first into the previous year, then into the second previous year, with priority over Sonderausgaben (special expenses); waiver only in full. Checked.
- § 10d Abs. 2 EStG: €1 million (€2 million) in full, above that 70 %. Checked. § 52 Abs. 18b Satz 3 EStG: from VZ 2024. 70 % only until 2027, from 2028 60 %: via Steuerschröder, not checked against the primary text.
- €10 million / €20 million for 2022 and 2023 (Viertes Corona-Steuerhilfegesetz; § 52 Abs. 18b Satz 2 EStG): via Haufe and buzer.de, not checked against the primary text.
- § 10d Abs. 4 Satz 2 EStG: remaining loss carry-forward. Checked.
- Open: whether the maximum amount of Satz 1 applies to both carry-back years together (the code reads it that way); the order of a carry-back from a later year and a carry-forward in the same year (the code deducts the carry-back first); BVerfG 23.07.2025, 2 BvL 19/14 on minimum taxation, content not read.

## Profit (`profit.ts`)

- § 4 Abs. 5 Satz 1 Nr. 1 EStG: gifts up to €50 per recipient and year. Checked. § 52 Abs. 6 Satz 1 EStG: from financial years after 31.12.2023. Checked. Previously €35: not checked against the primary text.
- § 4 Abs. 5 Satz 1 Nr. 2 EStG: business entertainment at 70 %. Checked.
- § 4 Abs. 5 Satz 1 Nr. 5 with § 9 Abs. 4a Satz 3 EStG: €28 / €14. Checked against the current text.
- § 4 Abs. 5 Satz 1 Nr. 6 EStG: trips between home and business with the Entfernungspauschale (distance allowance), 0.03 % rule for a car in business assets. Checked.
- § 9 Abs. 1 Satz 3 Nr. 4 EStG: €0.38 from the first kilometer, current text. Checked. From 2026 through the Steueränderungsgesetz 2025 (BT-Drs. 21/1974). Until 2025 €0.30 / €0.38 from the 21st km: not checked against the primary text.
- § 4 Abs. 5 Satz 1 Nr. 6b, 6c EStG: center of activity, annual flat rate €1,260 with reduction per month, daily flat rate €6 up to €1,260. Checked. 2022 version (€1,250, €5 up to €600): not checked against the primary text.
- § 4 Abs. 5b EStG: Gewerbesteuer is not a business expense. Checked.
