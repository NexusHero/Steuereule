# ADR-0038 — Deterministic calculation core + AI port (Draft) 

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 04) — draft; promotion needs Musti review
- **Implements** product ADR-014 (AI suggests, never creates on its own), product ADR-015 (range,
  no point value), product ADR-048 (determinism boundary + LangChain behind a port),
  product ADR-008 (line-item conflict), product ADR-032 (honesty/gating)
- **Context tags:** architecture, determinism boundary, honesty principle, AI boundary

## Context

Product ADR-048 rules that `packages/core` computes deterministically and is the **sole source of
every number**; the LLM never computes, it only (a) understands prepared document data, (b) suggests
category/rule, (c) explains legal sources. The tax *formulas* (tariff, Günstigerprüfung (most-favorable-outcome check),
Fünftelregelung (one-fifth rule), zumutbare Belastung (reasonable burden)) are explicitly later slices — this slice builds the honest
**container** they will fill, so "computable vs. open vs. gated" is a type, not a hope
(ADR-032: no estimation hocus-pocus).

## Decision

1. **`berechnung.ts`** — the deterministic fold:
   - `Quelle` ("Herkunft", origin): every amount carries an origin — `eingabe`, `beleg`, `ki-vorschlag`,
     `regel`. A bare number is unrepresentable (ADR-014/015).
   - `Posten`: a settled line item (amount + origin).
   - `PostenKonflikt` (ADR-008): a Posten with conflicting sources — a *distinct type*, never a
     silent overwrite; excluded from the sum; blocks submission.
   - `berechne` → `Berechnungsstand`, a discriminated union: `bestimmt` (sum) **only** when nothing
     is open/conflicting/gated; otherwise `offen` naming exactly what blocks it. The `offen` summe
     is the settled Posten only — a partial truth stated as a partial truth.
   - `loeseKonflikt`: the explicit resolution (choose a source / correct the value), the only path
     from conflict back to a settled Posten.

2. **`ki-port.ts`** — the AI boundary as a **port** (ADR-048 §3): `KiVorschlag` (the schema the
   LLM must answer in) and `KiPort` (a type-only interface; LangChain lives *behind* it, api-side,
   later). `nehmeVorschlagAn` is the only way a suggestion becomes a Posten, attaching the
   `ki-vorschlag` origin (ADR-014 "Beleg + KI-Vorschlag, bestätigt" — document + AI suggestion, confirmed).

The deterministic functions never take a `KiPort` — they are pure and testable with no AI
injected. The port only ever *produces* suggestions; the core *consumes* materialized
suggestions.

## Consequences

- The kernel is honest by construction: it cannot emit a point value while anything is open,
  gated, or conflicting (ADR-015/032), and it cannot represent a conflicting amount as a settled
  Posten (ADR-008).
- The AI wiring (LangChain) is a later slice's work — this slice fixes the contract, not the LLM.
- **Open for promotion review:** the exact `Quelle` vocabulary (`regel` vs. `beleg` vs.
  `ki-vorschlag`) and whether `loeseKonflikt`'s "wert korrigieren → `eingabe`" provenance is the
  right call — ADR-008 says "die verworfene Quelle bleibt im Verlauf" (the discarded source stays in the history), which this slice treats as
  the caller's persistence concern, not the core's.

## Addendum 2026-11-11: fake model behind the KiPort for CI and tests (#450 part 1A, Decision D8)

- `apps/api/src/ki/fake-chat-model.ts` answers the chat from a fixed script, via keywords in the question. This produces tool calls such as `stage_field_draft`. The browser gates use it to test the app, not a model.
- **Switching on:** only with `AI_FAKE_KI=1` and outside production. `assertFakeKiNotInProduction` stops the API from starting in production with the flag set. It cannot be selected as a provider name (`AI_ADVISOR_PROVIDER=fake`).
- **Calculation path:** The application stays the same as with a real model, i.e. LangGraph loop, PII gate, draft instead of write. Only the model's answer is fixed.

## Alternatives considered

- **Let the AI write Posten directly.** Rejected: product ADR-014 rules it out — numbers the user
  never saw. The `KiVorschlag` ≠ `Posten` type split makes it unrepresentable.
- **Compute a base estimate from interview answers here.** Rejected: no tax formula is in scope;
  inventing one is exactly the estimation hocus-pocus ADR-032 forbids. The kernel sums *settled*
  Posten only.
