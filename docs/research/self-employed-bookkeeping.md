# Bookkeeping for the self-employed: sources and licenses (ADR-0101)

As of: 19.11.2026. Applies to `packages/core/src/domains/ledger/*`.

## Charts of accounts SKR03 and SKR04

- **Account numbers:** The numbers of the SKR03 and SKR04 charts are a de facto standard of German bookkeeping. We use only the numbers, not the account names of any published catalog.
- **Cross-check:** Every number was checked against Odoo's openly licensed charts of accounts: `odoo/odoo`, branch `18.0`, files `addons/l10n_de/data/template/account.account-de_skr03.csv` and `account.account-de_skr04.csv`, license **LGPL-3.0**. Nothing was taken from these files except the check that number and meaning match in both charts; the HGB mapping (Odoo tags `tag_de_asset_bs_*`, `tag_de_liabilities_bs_*`, `tag_de_pl_*`) also served only for cross-reading.
- **Deviations from Odoo:** Cash (1000/1600), bank (1200/1800) and money in transit (1360/1460) are missing in Odoo (Odoo creates them via journals); we use the usual numbers. For receivables and payables we take the accounts „ohne Kontokorrent“ (without current account, 1410/1210, 1610/3310), because the app does not keep debtor and creditor accounts.
- **Account names:** All account names are our own wording.
- **Scope:** 184 concepts per chart. Each concept has a kind, default tax code, EÜR (cash-basis income statement) key (`EuerKey`), HGB position (§ 266 HGB at the depth for small companies, § 275 Abs. 2 HGB total cost method) and the E-Bilanz element of that position.

## Inflow and outflow (§ 11 EStG)

- Regularly recurring income and expenses paid a short time before or after the turn of the year belong to the year to which they economically belong (§ 11 Abs. 1 S. 2, Abs. 2 S. 2 EStG). „Kurze Zeit“ (a short time) is ten days (H 11 EStH), i.e. 22.12. to 10.1.
- The due date must also fall within this period (BFH, ruling of 27.6.2018, X R 44/16).
- If 10.1. falls on a weekend, the due date of the VAT advance payment shifts under § 108 Abs. 3 AO; it then lies outside the period (BFH, ruling of 21.6.2022, VIII R 25/20). The app calculates with the due date that the user or the API supplies after this shift.

## Retention (§ 147 AO)

- Books, inventories, annual financial statements, opening balance sheet, work instructions and organizational documents (thus also the process documentation): **ten years** (§ 147 Abs. 1 Nr. 1, Abs. 3 S. 1 AO).
- Accounting vouchers: **eight years** since the Fourth Bureaucracy Relief Act (BEG IV), from 1.1.2025. The new period applies to all documents whose period had not yet expired on 31.12.2024 (Art. 97 § 19a EGAO). For credit institutions and insurance companies the reduction applies only later; for the self-employed in the app this plays no role.
- Commercial and business letters, other documents: **six years**.
- The period begins at the end of the calendar year of the last entry or creation (§ 147 Abs. 4 AO) and does not end as long as the assessment period is running (§ 147 Abs. 3 S. 5 AO).
- ADR-0101 §13 has been adjusted accordingly; `retentionPeriod` returns the statutory period.

## Non-deductible expenses in the EÜR

- Every account lands on exactly one `EuerKey`. Whatever is entirely non-deductible is only on its own key, never additionally on an ordinary one: trade tax (4320/7610) on `ausgaben_gewerbesteuer` (§ 4 Abs. 5b EStG), non-deductible debt interest under § 4 Abs. 4a EStG (2113/7313) on `nicht_abziehbar_schuldzinsen_4_4a`, non-deductible late-filing surcharges and coercive fines (4397/6437), ancillary tax payments (2102/7302) and advertising and entertainment costs (4655/6645) on `nicht_abziehbar_sonstige`. The tax rules (`profit.ts`) count these keys as 0.
- The non-deductible part of the debt interest is therefore reposted from the interest account to 2113/7313, not posted additionally.
- There is no separate account for fines in the cross-checked Odoo charts of accounts; it has therefore not been created.
- The VAT on gratuitous withdrawals (withdrawals of goods and services, private car use) is on `einnahmen_umsatzsteuer_entnahmen`, separate from the VAT collected.
- Reduction of acquisition costs under § 7g Abs. 2 EStG (4853/4854, 6243/6244) on `ausgaben_herabsetzung_7g`; depreciation on intangible assets on `ausgaben_afa_immateriell`; rent and leasing of movable assets on `ausgaben_miete_leasing_beweglich`.

## Data access Z3 (GDPdU description standard)

- Export as `index.xml` according to the tax administration's DTD `gdpdu-01-09-2004.dtd` plus CSV (semicolon, decimal comma, date `DD.MM.YYYY`, UTF-8, CRLF).
- The API ships the DTD itself from the BMF's publication; it is not in the core.

## E-Bilanz taxonomies

| Version | Date of the taxonomy | Mandatory for fiscal years beginning after | Source |
|---|---|---|---|
| 6.5 | 01.04.2021 | 31.12.2021 (FY 2022) | annual rhythm, not individually documented |
| 6.6 | 01.04.2022 | 31.12.2022 (FY 2023) | annual rhythm, not individually documented |
| 6.7 | 01.04.2023 | 31.12.2023 (FY 2024) | BMF letter of 9.6.2023 |
| 6.8 | 01.04.2024 | 31.12.2024 (FY 2025) | BMF letter of June 2024 |
| 6.9 | 01.04.2025 | 31.12.2025 (FY 2026) | BMF letter of 10.6.2025 |

- Each version may already be used one year earlier (non-objection).
- Taxonomy 6.10 (1.4.2026) applies from fiscal year 2027 and lies outside the app's years.

### Account statements and fixed-asset schedule (primary sources checked)

- **Statute:** § 5b Abs. 1 S. 1 EStG as amended by the JStG 2024 (BGBl. 2024 I Nr. 387): balance sheet and P&L „einschließlich der unverdichteten Kontennachweise mit Kontensalden“. Under § 52 Abs. 11 S. 3 EStG this applies to fiscal years beginning after 31.12.2024; for the fixed-asset schedule and fixed-asset register as a statutory obligation under § 52 Abs. 11 S. 4 EStG only from fiscal years after 31.12.2027 (read on gesetze-im-internet.de).
- **BMF letter of 10.6.2025** (IV C 6 - S 2133-b/00064/002/006; read as PDF): account statement for every position with a value, with name of the position, account number, account description and account balance; at least all general-ledger accounts with a balance at the end of the fiscal year; no aggregation into account groups; no personal accounts and no journal. For taxonomy 6.9 there is no objection if the account statements are submitted by another route and the reasons are explained in a separate taxonomy position. Under the BMF letter of 24.5.2016, the fixed-asset schedule remains a mandatory field for fiscal years after 31.12.2016.
- **Consequence for 2025:** Taxonomy 6.8 does not yet contain account statements. The app therefore uses 6.9 for 2025 (permitted under the BMF letter).
- **Open:** The exact element names for the account statement tuple and the columns of the fixed-asset schedule are only in the taxonomy package on esteuer.de, which was not reachable. They are collected in `E_BILANZ_DETAIL_ELEMENTS` and must be checked before the first transmission.
- esteuer.de was not reachable on retrieval (certificate error); the dates for 6.7 to 6.9 come from reports on the BMF letters (otto-schmidt.de, KPMG, Kleeberg, Lexware).

## Bank formats

- CAMT.053 (ISO 20022, camt.053.001.02 to .08), own parser without DTD and entity resolution.
- CSV templates for Sparkasse („CSV-CAMT V2“), ING, DKB (format since 2023) and Commerzbank according to the known column layout of these exports. The test files are made up; they still need to be checked against real exports.
