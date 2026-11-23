# ADR-0046 — Rental vertical: several properties per Anlage V, straight-line AfA, sale/furnished gate (Draft)

- **Status:** Draft — promotion needs Musti review (ticket 10.6 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, ticket 10.6) — draft; promotion needs Musti review
- **Implements** product ADR-033 (rental income SIMPLE; sale/furnished stays gated), product ADR-010
  (income type `Vermietung`), product ADR-030 (freely combinable), product ADR-032 (no fabricated
  zero)
- **Builds on** ADR-0037 (income-type set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0041/0042/
  0044 (the vertical patterns), ADR-0040 (document type vocabulary)
- **Context tags:** architecture, vermietung, anlage-v, determinism boundary, honesty principle,
  security

## Context

In 1.0 rental income becomes a full income type — but SIMPLE (product ADR-033): several
**properties let for the whole year**, one Anlage V (rental income form) per property, straight-line AfA (depreciation). Sale and
furnished short-term letting stay gated (private sale transaction with holding periods, or a separate
delimitation respectively) — the limit is named honestly, not silently extended. The interview answer
`vermietung-art` (Einfach / Mehrere / Verkauf oder möbliert) already exists in the
segment 2 graph (interview.ts `VERMIETUNG_ART_VALUES`) and `gatedEinkunftsarten` already gates
`Vermietung` for the sale/furnished answer — what is missing is the
item/Anlage V build-out: the guided data interface per property, the straight-line AfA, and the
folding into the deterministic core.

Rental income differs structurally from pensions (10.4) and capital (10.5): there are
**several properties** per `(userId, steuerjahr)` — the list character is the normal case
(ADR-030: rental income+capital+pension+Grenzgänger is a normal combination), not an edge case.

## Decision

A pure, UI-free module `packages/core/src/rental.ts` (ADR-0004, no I/O), plus the
usual API/screen build-out:

1. **Rental classification (`ordneVermietungEin`)** — the `vermietung-art` answer is mapped to
   what it MEANS: `einfach`/`mehrere` are computable (let for the whole year, one
   Anlage V per property), `verkauf-oder-moebliert` stays gated (ADR-033 — named, never
   extended), `unbekannt` is never guessed. A pure derivation from the ONE source
   (interview answer), no denormalized column.

2. **Guided data interface per property (`VermietungsobjektDaten`)** — four captured facts:
   rental income (annual base rent), acquisition costs (building share), year of construction (completion),
   ongoing Werbungskosten (work-related expenses) — each `erfasst`/`offen`/`unklar` (the same honesty
   state machine as lstb.ts/rente.ts/kapital.ts), serialization in ONE place
   (ADR-0033 one-rule instinct). Werbungskosten may be 0 — but that 0 is the user's INPUT,
   never a zero invented by the core (ADR-032).

3. **Straight-line AfA (`afaSatzProzent`)** — § 7 Abs. 4 Satz 1 EStG, the three statutory bands
   VERBATIM (no invented percentage): completed up to and including 1924 → 2.5 %;
   1925–2022 → 2 %; from 2023 (residential buildings, § 7 Abs. 4 Satz 1 Nr. 2 i.d.F. JStG 2022) → 3 %.
   A non-integer/negative year of construction is open (null), never guessed.

4. **Facts per property + folding (`vermietungsobjektFakten`/`vermietungStand`)** — the
   rental income becomes an income `Posten` of income type `Vermietung` with
   `Quelle: { art: 'eingabe' }`; Werbungskosten and AfA are reported SEPARATELY (sum over
   all properties, AfA with `§ 7 Abs. 4 Satz 1 EStG` provenance) — reported, never subtracted: the
   net computation is the tax-formula slice, the same "partial truth stated as a partial
   truth" honesty as angestellte.ts's sonderausgaben. `offenePosten` counts the
   blocked results per property (rental income, AfA, Werbungskosten — max 3); `gegated` passes
   through unchanged, so that a sale/furnished landlord reads open with a named gate.

5. **API (`Vermietung` module) + screen** — one row PER PROPERTY
   (`Vermietungsobjekt` model, four field-encrypted columns, ADR-0008), not a JSON column:
   the field-encryption pattern needs one row per fact. `GET /v1/steuerjahre/{jahr}/
   vermietung`, `POST …/vermietung/objekte` (creates an empty property), `PUT …/vermietung/
   objekte/{objektId}/{feld}` — a foreign/unknown `objektId` is a 404 (never a cross-user
   read). The screen shows the classification, per property the four fields + facts (AfA with
   provenance), „Weiteres Objekt hinzufügen" ("Add another property") and the sum — the sale/furnished gate hides
   the input and names the limit.

## Consequences

- **M1 limit, named once:** properties can be created and edited field by field;
  deleting individual properties does not exist in M1 (a wrong property is set back field by field
  to `offen`) — a named follow-up with the submission/version model, not a
  silent gap. The sale/furnished case and all special AfA cases (§ 7 Abs. 5 EStG, increased
  deductions) are NOT here.
- **Honest limit, named once:** the net computation (income − Werbungskosten − AfA)
  and the resulting tax are the tax-formula slice — here the three numbers are
  honestly reported SIDE BY SIDE, never silently netted (ADR-015/032).
- **Security posture:** all four numbers are field-encrypted at rest (ADR-0008) — rental income
  and acquisition costs are among the most sensitive facts, joinable to the Steuer-ID; the
  classification is NOT its own column, but the (likewise encrypted) interview answer
  `vermietung-art`; WRITE/READ audited (REQ-004). No performance axis.
- **Register:** REQ-026; 10.2/10.3/10.4 occupy 022/023/024, 10.5 occupies 025 — check for
  collisions on merge (10.7 takes 027; REQ numbers are stable and never reused).

## Alternatives considered

- **One JSON column for all properties.** Rejected: breaks the field-encrypted
  column pattern and the uniqueness per fact; one row per property is the pattern of the
  neighboring verticals (ADR-0008) and reviewable.
- **Only ONE property per year (like pensions).** Rejected: product ADR-033 names "several properties"
  explicitly as 1.0 scope, and the list character is the normal case (ADR-030) — the
  limitation would be an avoidable gap, not honesty.
- **AfA rate as a formula instead of cited bands.** Rejected: the three bands are directly
  citable from § 7 Abs. 4 Satz 1 EStG and pinned in the test; a formula drifts away from the statute more easily
  (the same reasoning as ADR-0044 for the pension tables).
- **Werbungskosten optional with a silent 0.** Rejected: a silently invented 0 would be exactly the
  fabricated-zero error that ADR-032 forbids — 0 is a user input, never a
  core default.
