# ADR-0063 — Church tax in the estimate: rate, cap, besonderes Kirchgeld, Abgeltungsteuer

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/church-tax*.ts`, `packages/core/src/engine/tax-estimate.ts`, `married-estimate.ts`, `most-favourable-check.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/lstb/` (lines 6 and 7), LStB form, cockpit
- **Ticket:** #450 part 6F (scope extension of 10.11.2026)

## Context

Until now the estimate did not calculate church tax:

- **Single people:** For single people there was only the hint `churchTaxOpen`.
- **Married couples:** For married couples a range of 8–9 % was calculated, but only if neither spouse had German wage tax.
- **LStB:** The church tax withheld according to the LStB (Lohnsteuerbescheinigung, wage tax certificate) was not captured.
- **Sonderausgabe:** Church tax paid was not deducted as a Sonderausgabe (special expense).
- **Cap and Kirchgeld:** The cap was missing, as was the besonderes Kirchgeld (special church levy).
- **Abgeltungsteuer:** For the Abgeltungsteuer (flat-rate withholding tax on capital income) there was an approximation instead of the formula.

As a result, church members were missing the refund of church tax withheld in excess.

## Decision

### 1. Crediting and Sonderausgabe

- **New fields in the LStB:** Line 6 (the employee's church tax) and line 7 (the spouse's church tax, only in a mixed-denomination marriage) are two optional, encrypted fields (`Lstb.kirchensteuer`, `Lstb.kirchensteuerEhegatte`).
  - They sit next to the three required fields. An LStB without these lines remains complete.
- **Crediting:** The withheld church tax is credited against the church tax owed, like the wage tax, for single people and for couples.
  - For couples, lines 6 and 7 of both LStBs count.
  - A Grenzgänger (cross-border commuter) CH has had no German church tax withheld, so €0.
- **Sonderausgabe:** The church tax withheld in the year is a Sonderausgabe under § 10 Abs. 1 Nr. 4 EStG.
  - It is offset together with donations against the Sonderausgaben lump sum.
  - Church tax refunds from previous years are not offset (deliberate simplification).
- **Assessment basis:** Church tax is assessed on the income tax after deduction of the child allowances (§ 51a Abs. 2 EStG). This also applies if the Günstigerprüfung (most-favorable check) results in Kindergeld.
  - For single people with children this is a range between half and full allowance (transfer).

### 2. Rate and federal state

- **Rate:** 8 % in Bavaria and Baden-Württemberg, otherwise 9 %.
  - The federal state comes from the postcode in the master data (postcode table from #451).
  - An unknown postcode or a postcode spanning two states results in the range 8–9 %.
  - Exception: Catholics in Bad Wimpfen (postcode 74206) belong to the Diocese of Mainz and pay 9 % (BStBl 2026 I S. 869).
- **Denomination:** The denomination comes from the master data.
  - `VD` means no church tax and no hint.
  - If the denomination is empty or unknown, the state is **"open"** (`konfession-fehlt`), never a silent assumption of €0.
  - For couples this also applies if there is no information for Person B.
- **Missing line 6:** If line 6 is missing for a member with an LStB, the state is also "open" (`einbehalt-fehlt`).

### 3. Cap

The cap rates are listed per state and church with their source in `church-tax.data.ts`. The basis is the official announcements of the church tax resolutions or the state-recognized resolutions.

| Type | States | Effect |
| :--- | :--- | :--- |
| automatic | BE, BB, MV (3 %), SN, TH, ST (3.5 %), NI (Prot. 3–3.5 %, Cath. 3.5–4 %), HH, SH Prot. (3 %), HB Prot. (3.5 %) | Church tax is at most this share of the zvE (taxable income) |
| on application only | BW, NW, RP (the official announcement names no cap) | Calculated without a cap. If church tax exceeds 2.75 % of the zvE, the cockpit shows „Kappung auf Antrag möglich“ ("cap possible on application") |
| none | BY | — |
| no official value | HE, SL; HH, SH, HB Cath. | "open" (`kappung-unbekannt`), but only if church tax exceeds 2.75 % of the zvE. Below that no cap can apply |

Ranges for Lower Saxony arise because the postcode does not uniquely determine the regional church or diocese.

### 4. Besonderes Kirchgeld and mixed-denomination marriage

- **Mixed denomination** (both members, different churches): Church tax is calculated half-and-half on the joint tax. The total is the same as with the same denomination; only the split between the churches differs.
- **Mixed faith** (only one spouse is a member):
  - **Share:** Church tax falls on the member's share of the joint tax. The share results from the ratio of the basic-tariff tax on their own income. The cap refers to the same share of the zvE.
  - **Comparison:** This church tax is compared with the besonderes Kirchgeld according to the official bracket table; the higher amount applies.
  - **Assessment basis** of the Kirchgeld is the joint zvE under § 51a Abs. 2 EStG, i.e. after the child allowances.
- **Tables:**
  - up to 2024 from €40,000 (BStBl 2024 I S. 706 / S. 720, BStBl 2023 I S. 343)
  - from 2025 from €50,000 (announcements 2025 SN, NI, NW, MV, BE, TH; 2026 SN, BW)
  - 13 brackets each, from €96 to €3,600
- **Where it is levied:**
  - **Levied:** where an official source documents it for the year.
  - **Not levied:** Bavaria (both churches), NRW and BW Catholic (there the official announcement names only other churches).
  - **Otherwise:** "open" (`kirchgeld-unbekannt`), but only if the table would apply.

### 5. Abgeltungsteuer

`churchTaxReductionShare` now sits in the exact formula of § 32d Abs. 1 Satz 4 EStG:

- ESt = (e − 4q) / (4 + k)
- church tax = k × ESt

This replaces the approximation "25 % − 25 % of the church tax" in the Günstigerprüfung.

### 6. What is not guessed

If an officially documented value is missing for a state, the app does not insert one. This applies to the cap rate and to the year's Kirchgeld table. Where the missing value could change the church tax, the app shows "open" with the reason. The PR lists the states.

## Consequences

- The refund range of church members now includes church tax.
- With an unknown denomination, the cockpit shows a hint. This also applies to accounts that previously did not get one because the master data is empty.
- The BMF income tax calculator does not calculate church tax. The reference values (6F) therefore apply rate and cap to the BMF income tax of the 6A fixtures.

## Assumptions

- **Cap rates:** They come from announcements 2024–2026 and apply in the app for 2022–2026. The rates have been unchanged for many years; a change would be visible in the announcements.
- **Monthly reduction:** The reduction for leaving the church or marrying during the year is not modeled. The estimate calculates a full year.
