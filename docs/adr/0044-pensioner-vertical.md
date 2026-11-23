# ADR-0044 — Pensioner vertical: pension type, statutory tables, Anlage R folding (Draft)

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, ticket 10.4) — draft; promotion needs Musti review
- **Implements** product ADR-034 (pensioners in 1.0, Anlage R), product ADR-036 §3 (5 pension types),
  product ADR-030 (freely combinable), product ADR-032 (no fabricated zero)
- **Builds on** ADR-0037 (income-type set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0041
  (LStB/employees vertical), ADR-0042 (Grenzgänger CH vertical)
- **Context tags:** architecture, rentner, anlage-r, determinism boundary, honesty principle, security

## Context

In 1.0 the pension becomes a full income type (product ADR-034): statutory pension +
company pension (Anlage R (pension income form)), the taxable portion determined automatically from
the pension start year, freely combinable with all other income types (a pensioner with rental
income/capital is the normal case).
The interview answer „Rente" ("Pension") already exists in the minimal gate (ADR-0037 promoted `Rente` as
an income type); what is missing is the item/Anlage R build-out: the guided data interface
for the Rentenbezugsmitteilung (pension payment notification), the two statutory percentage tables,
and the folding of the taxable portion into the deterministic core.

## Decision

A pure, UI-free module `packages/core/src/pension.ts` (ADR-0004, no I/O), plus a document type
extension, plus the usual API/screen build-out:

1. **`Rentenart` vocabulary (product ADR-036 §3)** — the five pension types as a closed union
   (`GesetzlicheRente`, `Betriebsrente`, `PrivateRentenversicherung`, `WitwenWaisenrente`,
   `AuslaendischeRente`), German domain values byte-identical to the product ADR (ADR-0033 citation form).
   All five are Anlage R capable.

2. **Two statutory tables, VERBATIM (no invented percentage, product ADR-032):**
   - `besteuerungsanteilProzent(rentenbeginnJahr)` — the cohort table (§ 22 Nr. 1 Satz 3
     Buchst. a Doppelbuchst. aa EStG), up to and including 2005 = 50 %, 2006–2058 explicit, after 2058
     → **open** (`null`), never guessed: the Wachstumschancengesetz has already moved the end point
     once (2040 → 2058), a later year is never a guessed value.
   - `ertragsanteilProzent(vollendetesLebensjahr)` — the Ertragsanteil (income portion) table (§ 22 Nr. 1 Satz 3
     Buchst. a Doppelbuchst. bb EStG) for private pension insurance, "from 97" = 1 %.
   The tables are stored as explicit data, not as derived arithmetic — the test
   pins the boundary values of the statute itself.

3. **Guided data interface (`RentenDaten`)** — pension type (null = not chosen yet),
   annual amount, pension start year (Besteuerungsanteil path) and age at pension start
   (Ertragsanteil path), each `erfasst`/`offen`/`unklar` (the same honesty state machine
   as `lstb.ts`). Serialization in ONE place (`null`/`unklar`/number string), so that repository
   and tests never drift apart (ADR-0033 one-rule instinct).

4. **Anlage R folding (`renteAlsKernposten`/`renteStand`)** — the taxable portion
   (annual amount × portion, rounded to whole euros) becomes a `Posten` of income type `Rente` with
   `Quelle: { art: 'regel', regel: '§ 22 … — Besteuerungs-/Ertragsanteil … %' }` (provenance, ADR-014/
   015). If a required field is missing or the year lies outside the table, the result is **open**
   with an open item — never an invented zero. `renteStand` folds via `berechne` (ADR-0038)
   and passes `gegated` through unchanged, so that a pensioner with additionally gated
   business/crypto still reads `offen` (ADR-030/034 combinability).

5. **`Rentenbezugsmitteilung` as a document type** — the `Belegart` union (ADR-0040/0042) grows by one
   value, no rename, no change in semantics of the existing values.

6. **API (`Rente` module) + screen** — `GET`/`PUT /v1/steuerjahre/{jahr}/rente[/(art|{feld})]`, one
   row per `(userId, steuerjahr)`, `rentenart` as a plaintext discriminator (like `Beleg.art`), the
   three numbers field-encrypted at rest (ADR-0008). The screen is the guided fallback (ADR-036
   scan fallback), scan/OCR outside the slice (ADR-045).

## Consequences

- **Honest limit, named once:** the taxable portion is the only foldable item;
  the tariff/Günstigerprüfung (most-favorable check) over this portion is the tax-formula slice, not here.
  What cannot be determined is `offen`, never a guessed point value.
- **CH AHV** is treated as a "foreign pension" with the Besteuerungsanteil (comparable to
  a German statutory pension); the CHF→EUR conversion path via the existing
  exchange-rate core (ADR-0042/product ADR-012) is a separate later step — here the
  annual amount is captured in EUR.
- **Several concurrent pensions** (statutory + company pension + …) are the 1.0 limitation: the
  data interface holds ONE pension per `(userId, steuerjahr)`. The core is cut so that
  a list extension does not break the `Posten` contract — a named follow-up, not a
  silent gap.
- **Security posture:** `rentenart` is a plaintext discriminator (no joinable PII); the three
  numbers (annual amount = income, pension start year/age = tax-determining facts) are
  field-encrypted at rest (ADR-0008); WRITE/READ audited (REQ-004). No performance axis.

## Alternatives considered

- **Derive the percentages by formula instead of storing them as a table.** Rejected: an explicit
  table is reviewable and "no invented percentage" is the reliable property; a
  formula is prone to off-by-one errors and drifts away from the statute more easily.
- **Several pensions per year as a JSON column.** Rejected: breaks the field-encrypted column
  pattern and the `(userId, steuerjahr)` uniqueness; deferred as a named follow-up.
- **Drop the Ertragsanteil and always treat private pensions as "open".** Rejected: product ADR-036 §3
  explicitly names private pension insurance as a 1.0 pension type, and the table is citable — "open"
  would be an avoidable gap here, not honesty.
