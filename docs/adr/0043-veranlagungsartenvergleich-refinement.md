# ADR-0043 — Veranlagungsartenvergleich refinement: Soli/KiSt folded in, the uncertainty is now only the Progressionsvorbehalt

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, ticket 10.2) — refinement of ADR-0034, triggered by Musti's
  review of the 10.2 branch (REQUEST-CHANGES F2).
- **Refines** [ADR-0034](0034-veranlagungsartenvergleich-returns-a-bounded-comparison.md) Decision 3
  (and its Consequences paragraph "until Soli and Kirchensteuer are computed …").
- **Applies** [ADR-0032](0032-nothing-on-screen-promises-what-the-slice-does-not-deliver.md) (no
  fabricated zero) and [ADR-0033](0033-the-question-graph-lives-in-packages-core.md) § *citation
  form* — the PV bound is a new, citable derivation and belongs in the ADR log, not only in a
  module-header note.
- **Context tags:** architecture, determinism boundary, honesty principle, tax computation

## Context

ADR-0034 defined the Veranlagungsartenvergleich (comparison of assessment types) as a **bounded
comparison** and explicitly left three factors **uncomputed** — Solidaritätszuschlag (solidarity
surcharge), church tax and Progressionsvorbehalt (progression proviso).
Decision 3 modeled Soli and KiSt as a (computable) upper bound over numbers the module
"already holds", and the Progressionsvorbehalt as **unboundable**: without input, `unschaerfe` is
`unbestimmt` and `aussage` can never become `eindeutig`.

Ticket 10.2 (M1) closed two of these three gaps, and did so differently from how ADR-0034 had
anticipated:

1. **Soli and KiSt are now computed** (`packages/core/src/tarif.ts` — §4 SolZG with exemption limit +
   phase-in zone, §51a as a caller factor `0 | 0.08 | 0.09`), and folded into `einzel`/`zusammen`/`delta`.
   ADR-0034's Decision 3 text ("an upper bound … arithmetic over numbers this module
   already holds") therefore describes a mechanism that no longer exists: Soli/KiSt are no
   longer part of `unschaerfe`.
2. **The Progressionsvorbehalt becomes boundable**, via a new input object
   (`ProgressionsvorbehaltEingabe`) with a bound that ADR-0034 called non-derivable.
   The core invariant (bounded comparison, `aussage` first, `empfehlung` only on
   `eindeutig`) is fully preserved — this is a refinement, not a silent
   contradiction, and ADR-0034's Consequences paragraph ("until Soli and Kirchensteuer are computed and
   Progressionsvorbehalt is an input") anticipated exactly this step. But the ADR text on
   Decision 3 is now **stale**, and the new PV bound is a derivation that is missing from the
   ADR log (ADR-0033: citation form).

## Decision

Decision 3 of ADR-0034 is made more precise as follows (not rewritten retroactively — see
Consequences):

1. **`einzel`/`zusammen`/`delta` carry the full assessed tax.** The numbers are
   income tax **plus** Solidaritätszuschlag **plus** (optional) church tax — exact to the
   euro, for the two zvE (taxable income) bases passed in. Soli and KiSt are **no longer** part of
   the uncertainty: they are monotone surcharges on an income tax that differs between the
   assessment types, and cannot flip the sign of `delta` — an excluded factor that cannot tip the
   result does not belong in the error bound.

2. **`unschaerfe` is exclusively the Progressionsvorbehalt (§32b EStG).** The only
   excluded factor that can tip the result. Its upper bound is
   `45 % × Lohnersatzleistungen` (wage replacement benefits), rounded up to the whole euro
   (`Math.ceil(MAX_GRENZSTEUERSATZ * betrag)`, `MAX_GRENZSTEUERSATZ = 0.45` from §32a Abs. 1 Nr. 5
   EStG). Derivation: the PV effect is `y·[s(y+P)−s(y)]` with `s′(u)=(T′(u)−s(u))/u ≤ 45 %/u`,
   hence `≤ 45 %·y·ln(1+P/y) ≤ 45 %·P`; since the PV only increases both sides (einzel/zusammen),
   `|Δdelta| ≤ 45 %·P` holds. This is a **conservative, citable** upper limit — the top marginal
   tax rate as the ceiling, not a threshold chosen by feel (in the spirit of ADR-0034
   "computed, not chosen").

3. **`nicht-angegeben` remains the honest indeterminate case.** If the Progressionsvorbehalt
   is not (or not fully) captured — `ProgressionsvorbehaltEingabe` with `art:
   'nicht-angegeben'` —, `unschaerfe` is `unbestimmt` and `aussage` can **never** become
   `eindeutig`. This also applies at the service level: a `lohnersatz === 'Ja'` without a captured
   (positive) amount is mapped to `nicht-angegeben`, **not** to `lohnersatzleistungen` with `betrag: 0`
   (a fabricated zero would produce `obergrenze: 0` and make a false `eindeutig` possible
   — ADR-0032).

`aussage === 'eindeutig'` if and only if `unschaerfe.kind === 'bestimmt' && |delta| >
unschaerfe.obergrenze` — the same invariant as in ADR-0034 Decision 3, with the refined
meaning of the two terms.

## Consequences

- **ADR-0034 remains the source of the invariant; Decision 3 there is no longer literally current.**
  This ADR **supersedes** the Soli/KiSt bound part and the "PV is unboundable" part of
  ADR-0034 Decision 3. The rest of ADR-0034 (Decision 1 naming discipline, Decision 2 type enforcement,
  Decision 4 conclusion table) stays in force unchanged. ADR-0034 is not rewritten
  retroactively (log rule: an ADR that replaces another supersedes it, it does not rewrite
  history).
- **`unschaerfe` becomes narrower and more honest.** Instead of a bound over three uncomputed
  factors, it is now the bound over exactly the one that can actually tip the result. The
  `zu-knapp` case is therefore wrong less often than under ADR-0034: a delta within the
  PV noise bound is no longer additionally burdened with the Soli/KiSt uncertainty.
- **The PV bound is a number someone must be able to defend.** That is why it is stated here with
  its derivation, not as a comment in the module header. A caller reading `unschaerfe.obergrenze`
  can point to this ADR instead of justifying a constant.
- **Level 3 stays open.** As in ADR-0034 §4, this module asserts nothing about the correctness
  of the zvE bases entered; in the M1 slice `zveA`/`zveB` are an income basis, not a real
  taxable income. This refinement does not change that.

## Alternatives considered

- **Keep modeling Soli/KiSt in `unschaerfe` instead of computing them.** Rejected: ticket 10.2
  computes them anyway (tarif.ts); treating them as an "uncomputable" bound would be a
  self-report about a factor the module now knows exactly, and would keep burdening `einzel`/
  `zusammen` with an uncertainty that no longer exists.
- **Document the PV bound retroactively as part of ADR-0034 instead of creating a follow-up ADR.**
  Rejected: the ADR log is append-only (4-digit, sequential, immutable); a retroactive
  change to Decision 3 would rewrite history. A follow-up ADR that references and
  refines is the rule.
- **Leave the PV bound as a comment in the module header.** Rejected on ADR-0021's thesis: a
  note that nobody is required to read is not a control and not an ADR log entry
  (ADR-0033 citation form). The derivation belongs in the document that justifies architecture
  decisions.
