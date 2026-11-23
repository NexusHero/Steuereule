# ADR-0037 — Income types / tax year model in `packages/core` (Draft) 

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 04) — draft; promotion needs Musti review
- **Implements** product ADR-006 (the tax year belongs to the person), product ADR-010 (income types
  instead of profile type), product ADR-030 (freely combinable)
- **Context tags:** architecture, determinism boundary, domain model

## Context

Phase 0.4 delivers the shared tax-domain core both verticals (Phase 1) plug into. The first
half of that core is the *vocabulary*: what is an Einkunftsart (income type), and who owns a Steuerjahr (tax year).
Product ADR-010 already decided the domain shape — a Steuerjahr has a **set** of
Einkunftsarten (`Nichtselbstständig`, `Gewerbe`, `Vermietung`, `Kapital`, `Rente`,
`Grenzgänger`), several at once, and gates **add** Einkunftsarten rather than retyping the
user. Product ADR-006 decided ownership — each person owns their own Steuerjahre, and
Zusammenveranlagung (joint assessment) **couples** two persons' years of the same calendar year without merging
their Belege (documents)/Posten (line items). Product ADR-030 stresses that arbitrary combinations are the normal case,
not a corner.

The existing `packages/core` already carries the interview vocabulary (`interview.ts`: `job`,
`ausland`, `einkuenfte` as the onboarding shorthand) — the bridge between that shorthand and the
domain truth was missing, and nothing owned the Steuerjahr concept.

## Decision

Three pure, UI-free modules in `packages/core` (no I/O, ADR-0004):

1. **`einkunftsarten.ts`** — the closed `Einkunftsart` union (German tax-domain values, byte-equal
   to ADR-010's terms, not English identifiers — same reason the interview answer values are
   German), plus two derivations:
   - `einkunftsartenFromAnswers(answers)` — the ADR-010 bridge: onboarding answers → the declared
     Einkunftsart set. Records what the user *declared*, gated or not.
   - `gatedEinkunftsarten(answers)` — which **declared** Einkunftsarten 1.0 cannot compute
     (ADR-028 EÜR (cash-basis profit statement) always; ADR-032 crypto broker; ADR-033 Verkauf/möbliert (sale/furnished)). Gates only what is
     declared.

2. **`steuerjahr.ts`** — `Steuerjahr` carries its owning `userId` (the codebase's one scoping
   key, ADR-0007/0012 — ADR-006's "Person" *is* this id), its `jahr`, its Einkunftsarten, and a
   `Veranlagung` coupling state (`einzeln` | `zusammen`). `kopple`/`entkopple` are the only way to
   form/dissolve a link; `kopple` throws on same-userId, different-year, or already-coupled input;
   `entkopple` dissolves only the link, never the data (ADR-006).

The derivation is deliberately a pure function over `Answers`, so a new interview question or a
future Lebenslage (life situation) changes the vocabulary in ONE place, and the mapping is exhaustively tested
(ADR-030/034 combinability cases: Grenzgänger+Kapital+Vermietung, Rente+Vermietung+Kapital).

## Consequences

- No "Profiltyp" (profile type) type exists anywhere in core — the onboarding shorthand stays in the interview
  graph, the Einkunftsarten are the domain truth (ADR-010).
- `gatedEinkunftsarten` is what makes the calculation core's honesty cheap: the kernel takes the
  gated set as an input and names it, instead of each caller re-deriving ADR-028/032/033.
- The Einkunftsart string values are German domain terms persisted as-is (a future Prisma model
  can use them directly). German UI labels stay in i18n, never here.
- **Open for promotion review:** whether "Gewerbe" (vs. "Selbstständig") is the right canonical
  short form for ADR-010's "Gewerbe/Selbstständig", and whether `Grenzgänger` (rather than a
  broader "Ausland" (abroad)) is the right name given only CH is covered (ADR-029).

## Alternatives considered

- **Reuse the interview answer values as Einkunftsarten 1:1.** Rejected: ADR-010 names a distinct
  canonical set, and reusing the shorthand would collapse "Beides"/"Rente"/"Kapitalerträge" onto
  domain terms only by convention, exactly the drift ADR-0033's one-rule-instinct exists
  against.
- **Model Einkunftsarten in the API only.** Rejected: web and mobile both render the cockpit
  grouped by Einkunftsart (ADR-010) — a client-side copy is the two-copies drift `isValidSteuerId`
  was created to avoid.
