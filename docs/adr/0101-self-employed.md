# ADR-0101 — Self-employed: EÜR, bookkeeping, balance sheet, VAT and trade tax

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** new core under `packages/core/src/domains/business/*` (tax rules) and `packages/core/src/domains/ledger/*` (bookkeeping), `apps/api/src/business/*`, `apps/api/prisma/schema.prisma`, `apps/mobile-web/src/screens/business/*`, owl tools, enablement
- **Builds on:** ADR-0050 (paper route; changed here for the self-employed), REQ-015 (business gate; placed behind a switch here), ADR-0097 (one document pipeline), ADR-0066 (the owl fills drafts, zero-write), ADR-0008 (field encryption), ADR-0007 (user-bound)

## Context

Until now the interview caught the self-employed with the business gate (REQ-015): „Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer — das kann SteuerEule in Version 1 nicht.“ ("The self-employed need an EÜR, Anlage G/S and VAT — SteuerEule cannot do that in version 1."). The persona Maximiliane Koch (`docs/use-cases.md`) ended there. The Product Owner set the scope in a grilling round with 27 decisions.

One legal requirement determines the filing route: anyone with profit income must in principle file the income tax return electronically (§ 25 Abs. 4 EStG), likewise the EÜR (Einnahmenüberschussrechnung, cash-basis profit statement) (§ 60 Abs. 4 EStDV), and the balance sheet as an E-Bilanz (electronic balance sheet) (§ 5b EStG). There are exceptions for hardship cases (§ 150 Abs. 8 AO) and for profits up to €410 alongside a wage. The app has so far filed on paper (ADR-0050).

## Decision

Everything in one pull request, without a mock, in the app's patterns.

### Scope

1. **All self-employed**, freelancers (Anlage S) and businesses (Anlage G), full-time and part-time.
2. **Freelance or business:** the app suggests one based on questions about the profession (§ 18 EStG, catalog and similar professions) and says why; the user confirms. In case of doubt, what the Finanzamt (tax office) has assessed so far counts.
3. **Sole proprietors in full.** Shares in a partnership only as an amount taken over from its Feststellungsbescheid (notice of separate determination); the app does not do the partnership's declaration of separate determination.
4. **Tax years 2022 to 2026**, all years the app offers. Form lines, thresholds and E-Bilanz taxonomy per year.

### Profit and tax returns

5. **Profit determination:** EÜR (§ 4 Abs. 3 EStG) for everyone allowed to use it; balance sheet (§ 4 Abs. 1, § 5 EStG) for everyone who must (§ 140, § 141 AO) or wants to draw one up.
6. **Capture:** totals per EÜR line as the quick route, or individual documents via the one document pipeline (ADR-0097). Both end up in the ledger (point 10).
7. **Depreciation:** low-value assets up to €800 immediately, linear AfA according to the official table, collective item (€250 to €1,000), declining-balance AfA where permitted, investment deduction and special AfA (§ 7g EStG).
8. **VAT:** small-business check (§ 19 UStG) and standard taxation with the annual VAT return. ~~Advance VAT returns remain outside the app; the user enters the advance payments made as a total.~~ Changed by §22: the app calculates the advance VAT returns and the EC Sales List (Zusammenfassende Meldung); the total of the advance payments comes from them if the user does not enter their own.
9. **Trade tax:** trade tax return, allowance €24,500, municipal multiplier from the official municipality table (the user can correct it), credit against income tax (§ 35 EStG).
10. **Losses:** take over and offset the loss carryforward from the last Feststellungsbescheid, report a new loss, calculate the carryback into the two previous years and offer to waive it (§ 10d EStG; since 2022 only all or nothing).

### Bookkeeping

11. **One ledger for all self-employed.** EÜR, balance sheet, VAT and trade tax are derived from it; the totals per line from point 6 are bookings like any other.
12. **Chart of accounts SKR03 and SKR04** to choose from.
13. **GoBD:** posting lock, immutable log of every booking, retention per § 147 AO (books and procedural documentation ten years, booking documents eight years since 2025, Art. 97 § 19a EGAO), data export for the tax audit, procedural documentation. There is no third-party certification; the app therefore never calls itself „GoBD-zertifiziert“ ("GoBD certified").
14. **Bank:** bank statements as a file (CSV, CAMT.053); the app suggests bookings. No bank credentials in the app.
15. **Balance sheet in the app:** double-entry bookkeeping, annual financial statements with balance sheet and profit and loss statement (GuV), E-Bilanz data set.

### Filing

16. **Filling aid for Mein ELSTER:** the app calculates everything and shows, per form line, what the user enters in Mein ELSTER, for the main form, Anlage S/G, EÜR, VAT and trade tax returns. This changes ADR-0050 for the self-employed: no paper, no printout as the filing. It shows the rest of the income tax return (main form, Anlage N, N-Gre, R, KAP, V, Kind, Vorsorgeaufwand, Sonderausgaben, AV, household-related expenses, extraordinary burdens) with the same values that the form printout would print, per copy (person, child, property), line and code number from the measured Vordrucke (official forms) of the year (`felder-<jahr>.zeilen.json`, also for 2022 and 2023, which are not printed); for a year without published Vordrucke it names the values without lines and says so.
17. **E-Bilanz waits for ELSTER:** balance-sheet filers can book and close the year; submitting the E-Bilanz comes with ELSTER transmission. Until then the app says so openly. Supplemented by §22: the transmission is built up to the edge and is switched on with ERiC and the operator's certificate.

### The owl

18. **The owl assigns accounts as a draft:** for documents and bank transactions it suggests account, tax rate and depreciation; nothing is booked until the user accepts (zero-write, ADR-0066). It explains items.

### Verification, enablement, price

19. **Verification:** golden test cases from official examples and worked cases, per tax year. No external audit.
20. **Switch:** the business gate stays on for users until the Product Owner has reviewed the results and flipped the switch. The code is there from the merge.
    - **Flipped on 20.11.2026:** the Product Owner decided that the self-employed area is on by default. `SELBSTSTAENDIGE_ENABLED` unset now means on; only an explicit off (`false`, `0`, `no`, `nein`, `off`) brings back the business gate from REQ-015. The test suites and the E2E stacks that check the path with the gate (scenario 09) set the off themselves; scenario 09b needs a stack with it on.
21. **Price:** a separate, higher tier per tax year for years with self-employment, via a second Stripe price ID. The Product Owner sets the amount in Stripe; bookkeeping, VAT and trade tax are included in it.

### Addendum of 21.11.2026: the gaps after the first version

22. A review of the state after the merge found wrong calculations, groups that did not get through, and limitations. The Product Owner decided to fix all of them in one pull request. For external dependencies the app builds up to the edge. It calculates the advance VAT returns and shows them as a filling aid. For wages it books the values from the payroll program and calculates mini-jobs itself. Legal values are listed with sources in `docs/research/self-employed-extension.md`.
    - **Provision without a wage:** health insurance (KV), long-term care insurance (PV) and sickness benefit count as entered. The 4 % reduction applies once and only to KV. New are own retirement provision (statutory pension insurance (RV), professional pension scheme, Rürup) and further insurances; for KSK members the limit of €1,900 applies.
    - **Groups that now get through:** pensioners with a side business (question `rente-selbststaendig`). Self-employed with a midi-job or side job as their only wage. Several businesses per person (column `betrieb`). VAT is calculated across all businesses of a person, because there is one entrepreneur with one enterprise; Anlage EÜR, S/G and GewSt exist per business.
    - **Small business:** in the founding year €25,000 (from 2025, actual turnover) or €22,000 (until 2024, extrapolated) apply. The app reconciles the checkbox in the profile with the ledger. § 20 UStG measures against the previous year.
    - **EÜR:** non-deductible bookings no longer reduce the profit. The ten-day rule (§ 11 EStG) applies across the ledger boundary.
    - **New:** company car (1 % rule with EV/hybrid fractions, logbook, cost cap, trips home–business, VAT on private use). Advance VAT returns, intra-Community acquisition and EC Sales List (VAT ID on the booking). E-invoices (XRechnung UBL/CII, ZUGFeRD; XML stored as the original, delivered only as a download in a sandbox). § 16/§ 34 and § 34a. Wages with mini-job levies and wage tax return (Lohnsteuer-Anmeldung), without social security notifications.
    - **E-Bilanz:** the element names follow the official taxonomy 6.9; the fixed-asset schedule is built dimensionally. Transmission goes via an ERiC sidecar run by the operator (`ELSTER_TRANSMISSION_ENABLED`, `ELSTER_ERIC_CLI`, `ELSTER_CERT_PATH`, `ELSTER_CERT_PIN`, `ELSTER_HERSTELLER_ID`). The XBRL file goes over stdin, the PIN only into the sidecar's environment. The ERiC license and certificate are the operator's responsibility.
    - **Anlage S/G:** the lines come from a verified file that the operator reads off Mein ELSTER (`apps/api/assets/elster-lines/`). Without the file the app shows amounts without lines.
    - **Rechecked on 20.11.2026** (research §12): code numbers of the advance VAT return 2022–2025 (Kz 87 from 2023, Kz 70 from 2025), mini-job levies, maximum amount 2026, § 19 extrapolation until 2024, § 34a trade tax only from 2024, § 47 UStDV.
    - **Remains open and is said openly:** the 2026 Vordrucke (main form, Anlage Sonstiges, GewSt) have yet to be published. The app does not carry Kz 70 (date of the change from § 19). Quick-capture totals at 19 %/7 % carry no tax rate. Owl drafts outside documents book into the first business. Open from the review: if the previous year has no own advance VAT returns in the app, the special advance payment is measured against its annual tax instead of the total of the advance payments. Church tax other than ev/rk appears only in the total amount (Kz 83). Under a joint assessment only one profit per year gets the reduced rate. The app does not do the E-Bilanz correction (second submission).

## Consequences

- REQ-015 changes: the gate stays server-side but can be switched off; for „Beides“ ("Both") the route after flipping leads into the employee part and the self-employed part.
- The persona Maximiliane Koch gets an end-to-end E2E route instead of the gate.
- New facts are field-encrypted like their neighbors (ADR-0008); bookings and log are append-only, never changeable.
- Filing for the self-employed depends for now on the user entering it in Mein ELSTER; the E-Bilanz on the ELSTER certificate.
- Five year versions per tax return mean five sets of form lines and test cases; the app states a missing version (such as a form not yet published) openly instead of guessing.
