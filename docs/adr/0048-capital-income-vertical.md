# ADR-0048 — Capital vertical: depot classification, capital income form, § 32d Günstigerprüfung (bounded comparison) (Draft)

- **Status:** Draft — promotion needs Musti review (ticket 10.5 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, ticket 10.5) — draft; promotion needs Musti review
- **Implements** product ADR-032 (capital income in 1.0, crypto stays 2.0), product ADR-010
  (income type `Kapital`), product ADR-030 (freely combinable), product ADR-032 (no fabricated
  zero)
- **Builds on** ADR-0037 (income-type set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0034
  (bounded comparison, Günstigerprüfung name reservation), ADR-0040 (document type vocabulary),
  ADR-0043 (Soli/KiSt folded in, the uncertainty is now only the Progressionsvorbehalt)
- **Context tags:** architecture, kapital, anlage-kap, guenstigerpruefung, determinism boundary,
  honesty principle, security

## Context

In 1.0 capital income becomes a full income type (product ADR-032): German depots
(Abgeltungsteuer (flat-rate withholding tax), Sparerpauschbetrag (saver's lump-sum allowance), **Günstigerprüfung (most-favorable check) § 32d Abs. 6**) plus foreign brokers
(IBKR, Revolut — no tax withheld → Anlage KAP (capital income form) obligation; exactly the young target group). Crypto stays
2.0 (private sale transaction, holding periods, its own sourcing logic — an honest gate).
The interview answer `kap-depot` (Deutscher Broker / Ausländischer Broker / Krypto) already exists
in the segment 2 graph (interview.ts `KAP_DEPOT_VALUES`) and `gatedEinkunftsarten` already gates
`Kapital` for the crypto answer — what is missing is the item/Anlage KAP build-out: the
guided data interface for the Jahressteuerbescheinigung (annual bank tax certificate), the depot classification, and the
§ 32d Günstigerprüfung as a bounded comparison following the ADR-0034 pattern.

Naming discipline (ADR-0034 §1): **this** ticket carries the name "Günstigerprüfung" (§ 32d
Abs. 6 EStG) — the Veranlagungsartenvergleich (comparison of assessment types, 10.2) is not called that, and vice versa. Two
different comparisons, two names, never again one.

## Decision

A pure, UI-free module `packages/core/src/capital.ts`, a second one
`packages/core/src/most-favourable-check.ts` (ADR-0004, no I/O), plus a document type extension,
plus the usual API/screen build-out:

1. **Depot classification (`ordneKapDepotEin`)** — the `kap-depot` answer is mapped to
   what it MEANS for the tax return: `deutscher-broker` (Abgeltungsteuer withheld —
   the Günstigerprüfung is the applicable question here), `auslaendischer-broker` (no German
   tax withheld → mandatory assessment Anlage KAP, taxation at the standard tariff — the KAP obligation
   is named honestly, a flat-rate withholding is never invented), `krypto` (gated, ADR-032 §2),
   `unbekannt` (never guessed). The classification is a pure derivation from the ONE source
   (interview answer) — no denormalized column that can drift.

2. **Guided data interface (`KapitalDaten`)** — one captured fact: the capital income
   (income from capital assets, whole euros), `erfasst`/`offen`/`unklar` (the same
   honesty state machine as lstb.ts/rente.ts). Serialization in ONE place
   (ADR-0033 one-rule instinct). Folding: `kapitalAlsKernposten` → `Posten` of income type
   `Kapital` with `Quelle: { art: 'eingabe' }` (the guided form is a transcription; the
   document/AI-suggestion provenance is already carried by the `Quelle` contract — it is the
   assignment slice, a named follow-up, not a half feature here); `kapitalStand` folds
   via `berechne` and passes `gegated` through unchanged — a crypto investor reads open with a
   named gate.

3. **`guenstigerpruefung.ts` — § 32d Abs. 6 EStG as a bounded comparison (ADR-0034 pattern):**
   - `abgeltung`: 25 % on (capital income − Sparerpauschbetrag § 20 Abs. 9: €1,000 single /
     €2,000 joint) + Soli (§ 4 SolZG) + KiSt with the § 32d Abs. 1 Satz 4 reduction (the
     Abgeltungsteuer is reduced by 25 % of the church tax attributable to it). All rates cited, no
     invented constant.
   - `persoenlich`: the tariff tax on the capital income share = § 32a tariff on
     (remaining zvE + capital income) − tariff on remaining zvE, plus the Soli difference (the
     exemption limit makes the Soli non-linear — a difference, never a surcharge on the difference) and
     the KiSt; Zusammenveranlagung (joint assessment) = splitting (§ 32a Abs. 5) on the combined basis.
   - The result is the ADR-0034 union: `aussage` `eindeutig` (with `empfehlung`) / `zu-knapp` /
     `unbestimmt` — `empfehlung` exists ONLY on `eindeutig`, the compiler refuses the
     shortcut. `unschaerfe` is the ONE bound definition from the Veranlagungsartenvergleich
     (`progressionsvorbehaltSchranke`, exported for this): the Progressionsvorbehalt (§ 32b) is
     the only excluded factor that can tip the result. `eindeutig` only if the
     bound is determined AND |delta| exceeds it. Level 3 stays open: `uebrigesZvE` is
     an income basis (not a real zvE), and `herkunft` honestly carries that along.

4. **`Steuerbescheinigung` as a document type** — the `Belegart` union (ADR-0040) grows by one value
   (the bank's annual tax certificate), no rename, no change in semantics of existing
   values.

5. **API (`Kapital` module) + screen** — `GET`/`PUT /v1/steuerjahre/{jahr}/kapital[/
   {feld}]`, one row per `(userId, steuerjahr)`, `kapitalertraege` field-encrypted at rest
   (ADR-0008). `GET .../kapital/guenstigerpruefung` computes ONLY via @steuereule/core and
   names the honest gates (`nicht-anwendbar`): foreign broker
   (`keine-abgeltung-einbehalten`), crypto (`krypto-gegated`), unanswered kap-depot
   (`kap-depot-nicht-beantwortet`), missing capital income (`keine-kapitalertraege`) — never an
   invented comparison. The screen shows the depot classification, the field, the item with
   provenance and the Günstigerprüfung with `aussage` first.

## Consequences

- **M1 limits, named once:** `uebrigesZvE` of the Günstigerprüfung is the LStB income
  basis of the same tax year (as the Veranlagungsartenvergleich 10.2 uses it) — pension/
  rental income/CH are not yet folded in (level 3 open, carries `herkunft`). Zusammenveranlagung
  is computed by the core, the API serves M1 single (partner figures are never invented — a named
  follow-up). KiSt is a query input (M1 does not collect it yet, default 0).
- **Honest limit, named once:** loss offsetting, crediting of foreign Quellensteuer (withholding tax)
  (§ 32d Abs. 5), § 32d Abs. 2 cases (shareholdings) and the KiSt cap are NOT here —
  named follow-ups, no silent approximation.
- **Crypto stays 2.0:** the gate is the honest statement (screen + `gatedEinkunftsarten`),
  not a half feature (ADR-032 §2).
- **Security posture:** `kapitalertraege` is field-encrypted at rest (ADR-0008) — actual
  capital assets are among the most sensitive facts, joinable to the Steuer-ID; the depot classification
  is NOT its own column, but the (likewise encrypted) interview answer `kap-depot`;
  WRITE/READ audited (REQ-004). No performance axis.
- **Register:** REQ-025; the neighboring tickets occupy 022/023/024 — check for collisions
  on merge (10.6 takes 026).

## Alternatives considered

- **Abgeltungsteuer without Sparerpauschbetrag.** Rejected: § 20 Abs. 9 EStG is citable and
  changes the assessment basis considerably — leaving it out would be a silent falsification, not a
  simplification.
- **KiSt as an uncertainty bound instead of folded in.** Rejected: the § 32d Abs. 1 Satz 4 reduction
  is citable; once folded in, the uncertainty remains exclusively the Progressionsvorbehalt —
  the same shape as the Veranlagungsartenvergleich (ADR-0043), one bound definition for both.
- **Depot type as its own Prisma column.** Rejected: a denormalized copy of the
  interview answer can drift (ADR-0033 defect class); the derivation from the one source is
  pure and testable.
- **"Make up" a Günstigerprüfung for foreign brokers as well.** Rejected: there,
  Abgeltungsteuer was never withheld, the comparison is moot — the honest
  `nicht-anwendbar` answer is itself the naming of the KAP obligation (ADR-032).
