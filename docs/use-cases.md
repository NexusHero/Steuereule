---
title: "Steuereule — Use-Case Overview"
subtitle: "A use-case view over the Requirements Register (arc42-compatible)"
status: "Living Document"
lang: en
toc: true
toc-depth: 3
numbersections: true
---

# Use-Case Overview (Use Cases) {#section-use-cases}

## How to read this document {#how-to-read}

This document provides the **functional use-case view** of Steuereule. It names the user-facing goals, the actors and personas, and how they are anchored in the requirements tracked in the Requirements Register (`REQ-001` to `REQ-035`).

### Ground rules of the architecture & traceability

1. **Every use case refers to concrete `REQ-NNN`** in the [Requirements Register](requirements/register.md) and to the related [ADRs](adr/index.md).
2. **Deterministic core before AI suggestion ([ADR-0005](adr/0005-deterministic-core-llm-assist.md), [ADR-0051](adr/0051-owl-ai-mode.md)):**
   The deterministic calculation core in `@steuereule/core` computes every amount, tariff, splitting advantage, allowance and deadline deterministically and tamper-proof, without exception. The AI assistant („Eulen-Modus“ ("owl mode")) only suggests, explains, structures and phrases — always with logged origin (*provenance*), never mutating on its own and never silent on errors.
3. **E2E automation:**
   Every relevant flow is firmly anchored in the E2E scenario matrix (`e2e/scenarios/01-24`) as a real browser run on CI and protected against regressions.

---

## Actors and personas {#actors-and-personas}

| Persona / actor | Typical life situation & tax profile | Primary use cases | E2E scenario |
| :--- | :--- | :--- | :--- |
| **Lena Hoffmann** | Employee in Germany, single, no children, commuter allowance, home office | UC-01, UC-02, UC-03, UC-05 | `e2e/scenarios/01-lena-hoffmann-angestellt.mjs` |
| **Markus & Julia Brenner** | Grenzgänger (cross-border commuters) to Switzerland (CH Lohnausweis (Swiss salary certificate), CHF currency conversion, 60-day rule Art. 15a DBA-CH) | UC-03, UC-04, UC-05 | `e2e/scenarios/02-markus-brenner-grenzgaenger-ch.mjs`, `03-julia-brenner-grenzgaengerin-ch.mjs` |
| **Ehepaar Weber** | Married, Zusammenveranlagung (joint assessment), different incomes, Veranlagungsartenvergleich (comparison of assessment types) | UC-02, UC-04, UC-05 | `e2e/scenarios/04-weber-ehepaar-zusammenveranlagung.mjs`, `14-keller-ehepaar-veranlagungsvergleich.mjs` |
| **Hans Meyer** | Pensioner with statutory pension and capital income (saver's lump-sum allowance, Günstigerprüfung (most-favorable test)) | UC-03, UC-04, UC-05 | `e2e/scenarios/05-hans-meyer-rentner-kapital.mjs` |
| **Sarah Fischer** | Employee with home office and a Riester pension contract (Sonderausgaben (special expenses) § 10a EStG) | UC-02, UC-03, UC-05 | `e2e/scenarios/06-sarah-fischer-homeoffice-riester.mjs` |
| **David Richter** | Single parent with a child, relief amount under § 24b EStG, child benefit Günstigerprüfung | UC-02, UC-03, UC-05 | `e2e/scenarios/07-david-richter-alleinerziehend.mjs`, `16-sabine-kranz-geschieden-kind.mjs` |
| **Maximilian Allesgeber** | Full-spectrum filer with every life situation (relocation, double household, severance pay) | UC-02, UC-03, UC-05 | `e2e/scenarios/17-maximilian-allesgeber-maximal-katalog.mjs` |
| **Maximiliane Koch** | Trader / self-employed: trade gate while the switch for the self-employed is off; afterwards EÜR (cash-basis profit statement), bookkeeping, VAT and trade tax ([ADR-0101](adr/0101-self-employed.md)) | UC-02 (gate) | `e2e/scenarios/09-maximiliane-koch-selbststaendig-gate.mjs` |
| **Erika Zimmermann** | Widowed taxpayer (widow's splitting under § 32a Abs. 6 EStG in the year after the death) | UC-02, UC-04, UC-05 | `e2e/scenarios/13-erika-zimmermann-verwitwet.mjs` |

---

## Use-case matrix {#use-case-matrix}

| UC ID | Use case name | Primary actor | Involved REQ | Core ADR | Status | E2E reference |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **UC-01** | Anonymous onboarding & guest session | All users | REQ-001, REQ-002, REQ-012 | ADR-0011, ADR-0045 | **Done** | `08-navigation-gast-und-alle-screens.mjs` |
| **UC-02** | Minimal gate & three-question interview | All users | REQ-015, REQ-017 | ADR-0031, ADR-0045 | **Done** | `19-dialog-matrix-interview-zickzack.mjs` |
| **UC-03** | LStB & income capture (wages, pension, rental, KAP) | Employees, pensioners, landlords | REQ-016, REQ-024, REQ-026 | ADR-0008, ADR-0050 | **Done** | `01-lena-hoffmann`, `05-hans-meyer`, `22-dialog-crud` |
| **UC-04** | Grenzgänger Switzerland Lohnausweis & status | Grenzgänger CH | REQ-019, REQ-020, REQ-021 | ADR-0042, ADR-0050 | **Done** | `02-markus-brenner`, `03-julia-brenner` |
| **UC-05** | Tax calculation & Veranlagungsartenvergleich | All taxpayers | REQ-001, REQ-022, REQ-027 | ADR-0034, ADR-0038 | **Done** | `04-weber-ehepaar`, `14-keller-ehepaar` |
| **UC-06** | Prior-year carry-over (year change) | Returning users | REQ-028, REQ-032 | ADR-0022, ADR-0052 | **Done** | `23-dialog-matrix-gast-upgrade` |
| **UC-07** | Unlock via Stripe & payment check | Users ready to file | REQ-029 | ADR-0050 | **In review** | `apps/api/test/acceptance/unlock-webhook.test.ts` |
| **UC-08** | Official form printout (paper route) | Paying users | REQ-030, REQ-031 | ADR-0050 | **In review** | `apps/api/test/printout.test.ts` |
| **UC-09** | Owl mode (AI tax advisor in the chat) | Users in need of advice | REQ-031, REQ-033 | ADR-0051, ADR-0052 | **In review** | `24-advisor-chat-steuereule.mjs` |
| **UC-10** | QR code device pairing (desktop via phone) | Mobile users | REQ-014 | ADR-0024 | **Done** | `apps/api/test/acceptance/req-014-device-approve-token.test.ts` |
| **UC-11** | DSGVO (GDPR) data export & account deletion | Registered users | REQ-004, REQ-011 | ADR-0013, ADR-0016 | **Done** | `apps/api/test/acceptance/req-011-export-delete.test.ts` |

---

## Detailed use-case flows {#detailed-use-cases}

### UC-01: Anonymous onboarding & guest session
* **Goal:** Immediate usability without forced registration (*value-first funnel*, [ADR-0045](adr/0045-value-first-funnel.md)).
* **Flow:**
  1. The user opens the application (web or app).
  2. `UserContextGuard` establishes a signed, anonymous guest session ([REQ-002](requirements/register.md#REQ-002)).
  3. The user enters first profile data or goes straight into the interview entry ([REQ-012](requirements/register.md#REQ-012)).
  4. All temporarily captured guest data is stored isolated and encrypted on the server side ([REQ-003](requirements/register.md#REQ-003)).
  5. On a later upgrade to a full account (`POST /v1/auth/sign-up/email`), all guest data is transferred atomically into the new user account ([REQ-006](requirements/register.md#REQ-006)).

### UC-02: Minimal gate & three-question interview
* **Goal:** Fast classification of the income types and legally compliant exclusion of unsupported cases ([ADR-0031](adr/0031-the-interview-is-three-questions-and-a-catalog.md)).
* **Flow:**
  1. Question 1: employment (`Angestellt`, `Rentner`, `Selbstständig/Gewerbe`, `Beides`).
     * *Trade gate:* self-employed users are intercepted with a transparent notice ([REQ-015](requirements/register.md#REQ-015)) while the switch for the self-employed is off; afterwards the path leads into EÜR, bookkeeping, VAT and trade tax ([ADR-0101](adr/0101-self-employed.md)).
  2. Question 2: foreign connection (`Inland`, `Schweiz / Grenzgänger`, `Anderes Ausland`).
     * *CH-only gate:* only Grenzgänger to Switzerland are supported in version 1.0 ([ADR-0042](adr/0042-grenzgaenger-ch-vertical.md)).
  3. Question 3: children (`Ja`, `Nein`).
  4. All answers are validated on the server side, stored encrypted in `InterviewAnswer` and immediately reduce the open items in the cockpit.

### UC-03: Capture of income & documents
* **Goal:** Precise transcription of actual tax values without inventing fake values ([ADR-0008](adr/0008-keine-erfundenen-daten.md)).
* **Flow:**
  1. **LStB (Lohnsteuerbescheinigung, wage tax certificate):** gross wages, withheld wage tax, solidarity surcharge, church tax, employee contributions to health/long-term care/pension insurance. Every field is honestly `erfasst`, `offen` or `unklar`.
  2. **Rentenbezugsmitteilung (pension statement):** pension type (statutory, private, widow's pension), annual amount, pension start (to determine the taxable portion under § 22 Nr. 1 EStG from the statutory cohort table).
  3. **Capital assets:** domestic and foreign brokers, withheld KapESt (capital gains tax), saver's lump-sum allowance (801 € until 2022, 1,000 € from 2023).
  4. **Rental & leasing:** property address, rental income, building acquisition costs, year of construction (straight-line AfA (depreciation) under § 7 Abs. 4 EStG: 2.5 %, 2.0 % or 3.0 %), Werbungskosten (work-related expenses).

### UC-04: Grenzgänger Switzerland (CH vertical)
* **Goal:** Complete handling of the Germany-Switzerland DBA (double taxation agreement) ([ADR-0042](adr/0042-grenzgaenger-ch-vertical.md), [REQ-020](requirements/register.md#REQ-020), [REQ-021](requirements/register.md#REQ-021)).
* **Flow:**
  1. The user transcribes the Swiss Lohnausweis (gross salary item 1, AHV/ALV item 9, PK item 10, Quellensteuer (withholding tax) item 12).
  2. Check of the 60-day non-return rule (Art. 15a Abs. 2 DBA-CH): at ≤ 60 days the genuine Grenzgänger status applies, with a 4.5 % flat Swiss Quellensteuer and taxation in the state of residence, Germany.
  3. Automatic currency conversion CHF → EUR using the monthly BMF reference rates or the actual exchange rates on the document.
  4. Preparation of the data for the official **Anlage N-Gre**.

### UC-05: Tax calculation & Veranlagungsartenvergleich
* **Goal:** Determining the tax refund/additional payment and comparing Einzelveranlagung (separate assessment) vs. Zusammenveranlagung ([ADR-0034](adr/0034-veranlagungsartenvergleich-returns-a-bounded-comparison.md)).
* **Flow:**
  1. The calculation core `@steuereule/core` computes the taxable income (zvE) by deducting the Werbungskosten lump sum, Sonderausgaben, Vorsorgeaufwendungen (provision expenses) and allowances.
  2. Application of the exact § 32a EStG tariff polynomials (basic tariff or splitting tariff for the respective tax year 2022–2026).
  3. Calculation of the solidarity surcharge (§ 4 SolZG exemption limits and phase-in zone).
  4. **Assessment comparison:** for married couples, the tax burden for Einzelveranlagung (§ 26a EStG) and Zusammenveranlagung (§ 26b EStG) is compared. The result delivers a typed decision: `eindeutig` (with savings potential), `zu-knapp` or `unbestimmt`.

### UC-07: Unlock & payment (Stripe)
* **Goal:** Legally sound sale of the official printout per tax year ([ADR-0050](adr/0050-paper-filing-instead-of-elster-in-1-0.md)).
* **Flow:**
  1. The user requests the checkout (`POST /v1/steuerjahre/{jahr}/ausdruck/checkout`).
  2. The pre-check validates whether the printout can be delivered completely (no payment with incomplete master data).
  3. Redirect to the hosted Stripe Checkout page (no credit card data on our servers).
  4. Obtaining the explicit consent to the early expiry of the right of withdrawal for digital goods (§ 356 Abs. 5 BGB).
  5. After a successful payment, only the signature-verified webhook (`POST /v1/zahlung/stripe/webhook`) unlocks the tax year.

### UC-08: Official form printout (paper route)
* **Goal:** Generation of a print-ready, authority-compliant tax return package on official BMF templates ([ADR-0050](adr/0050-paper-filing-instead-of-elster-in-1-0.md)).
* **Flow:**
  1. Pre-check (`GET /v1/steuerjahre/{jahr}/ausdruck/pruefung`): check that all master data is complete (name, Steuer-ID (tax ID), address, date of birth, religion under Art. 9 DSGVO, IBAN, Finanzamt (tax office)).
  2. The `FormRenderer` loads the blank official internet Vordrucke (official forms) pinned for the tax year (`assets/vordrucke/<jahr>/`).
  3. The determined values are printed at the exactly measured field positions in a sans-serif 10pt font with decimal comma.
  4. The finished PDF contains the main form ESt 1 A and all filled-in Anlagen in official order.
  5. The user prints the document, signs on page 2 of the ESt 1 A and submits it to the Finanzamt by post.

### UC-09: Owl mode (AI tax advisor)
* **Goal:** Context-aware, dialog-based tax advice and optimization suggestions ([ADR-0051](adr/0051-owl-ai-mode.md)).
* **Flow:**
  1. The user asks a question in the chat (e.g. „Kann ich mein Arbeitszimmer absetzen?“ ("Can I deduct my home office?")).
  2. The AI adapter retrieves the current tax state via secured MCP tools (with PII masking for Steuer-ID, IBAN, names).
  3. The system proposes concrete entries (*proposals* with origin `Assistent`).
  4. Values are never overwritten unasked. The user sees the proposal in the „Prüfen & bestätigen“ ("Review & confirm") screen and decides actively with a tap.
  5. An undo function allows every assistant change to be reverted immediately.

### UC-11: DSGVO data export & account deletion
* **Goal:** Complete fulfilment of the data subject rights under Art. 15/20 and Art. 17 DSGVO ([ADR-0013](adr/0013-dsgvo-export-and-account-deletion.md), [ADR-0016](adr/0016-dsgvo-loeschung-und-export-im-kern.md)).
* **Flow:**
  1. **Art. 15/20 export:** `GET /v1/account/export` decrypts and delivers all stored data (profile, master data, LStB, pensions, documents, audit logs) as structured JSON and PDF.
  2. **Art. 17 deletion:** `DELETE /v1/account` deletes all of the user's records in all tables in a cascade within a single atomic `$transaction`. DMMF-based coverage tests prevent orphaned tax data.
