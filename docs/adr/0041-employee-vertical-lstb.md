# ADR-0041 — Employee vertical: LStB scan fallback form + on-demand catalog entries (Draft) 

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Kaan (backend/FE, Ticket 08) — draft; promotion needs Musti review
- **Implements** product ADR-036 (scan fallback form instead of OCR), product ADR-031 (5 life situations),
  product ADR-016/035 (on-demand Sonderausgaben (special expenses) catalog), product ADR-008 (visible conflict,
  never silent overwriting)
- **Builds on** ADR-0008 (field encryption), ADR-0007/0012 (userId seam), REQ-004 (audit),
  ADR-0031 §3 (one catalog walker, no second code path), ADR-0033 (graph in `packages/core`,
  server validates), ADR-0032 (nothing promises more than the slice delivers)
- **Context tags:** architecture, lstb, interview, catalog, honesty principle, encryption

> **⚠ Number collision (open — do NOT resolve here):** `0041` is also taken by the parallel
> Grenzgänger (cross-border commuter) CH branch (Ticket 09), which in its own worktree (not in this branch)
> holds the draft `0041-grenzgaenger-ch-vertikale.md`. On merge, this draft and the
> t09 draft are to be resolved to `0041`/`0042`; the final number is THEN to be carried into this title and all
> references. This draft deliberately keeps `0041` so that both branches stay textually
> mergeable; the `adr-check-ignore` marker in the title carries the draft through the ADR number check until this
> renumbering.

## Context

Phase 1a (Ticket 08) builds the employee vertical on the shared core (Phase 0.4). Two
data intakes are new and need an architecture decision, because both have to implement the
honesty principle (ADR-0032/ADR-032) on the persistence side:

1. **LStB data intake** (product ADR-036): The user transfers the three printed LStB (Lohnsteuerbescheinigung, wage tax certificate) values
   field by field into a guided form. Scan/OCR is deliberately NOT here (product ADR-045, later).
   The form must represent three honest states per field — `erfasst`, `offen`, `unklar`
   ("looked at, not readable") — and a visible contradiction (product ADR-008), never a
   silent correction.
2. **Interview segment 2 / catalog** (product ADR-031/016/035): The 5 life situations and the
   Sonderausgaben (donations, KV/PV (health/long-term care insurance), Riester) come as FURTHER catalog entries via the SAME
   engine that already runs the minimal gate (ADR-0031 §3). Server admission must not become a second
   code path.

## Decision

1. **`packages/core/lstb.ts` — the pure LStB model.** Three fields, each one of
   `erfasst` (integer euros) | `offen` | `unklar`. The derived `LstbZustand`
   (`unvollstaendig` | `widerspruch` | `vollstaendig`) is a pure function of the three
   field states and is recomputed on every read, **never stored** (ADR-014/048:
   a stored copy of a derivable state can only drift). The contradiction
   ("Lohnsteuer/SV exceeds gross") is named, never silently corrected (ADR-008).

2. **Persistence: three nullable string columns, one encoding point.** `null` = `offen`, the
   reserved marker `unklar` = "not readable", any other string = integer euros
   (`erfasst`). The mapping field state ↔ string lives in EXACTLY one place
   (`serialisiereLstbFeld`/`deserialisiereLstbFeld` in `packages/core/lstb.ts`), so that the
   API repository and its tests do not drift apart (ADR-0033 instinct). The marker can
   never collide with a real value, because captured values are integers and the marker
   is not a number. **Why a string, not three columns per state:** one column per field
   carries the state including the amount, without a "state column" next to an
   "amount column" being able to diverge.

3. **All three values are field-encrypted at rest** (ADR-0008). Actual income is the
   most sensitive personal fact a tax app holds — linkable via the same `userId`
   with the Steuer-ID (tax identification number) in the `Profile` — unlike `TaxYear` (counters only) or the
   `Beleg` data (which the suggestion rule needs in plaintext). The `Lstb` model (`schema.prisma`)
   documents this rationale on the model.

4. **API: `GET /v1/steuerjahre/{jahr}/lstb` + `PUT .../lstb/{feld}`.** One row per
   `(userId, steuerjahr)`; the GET returns the three field states plus the derived `zustand`
   (re-entry, the same "server decides what is true" seam as the interview). The PUT
   is an upsert of ONE field. `@RequiresAccount()` (no guest path), WRITE audit atomic with the
   upsert (REQ-004), READ audit only when a row exists.

5. **Catalog entries: one walker, one registry (ADR-0031 §3).** `ENTRIES['lebenslagen']` and
   `ENTRIES['sonderausgaben']` are entries of the same `CatalogueEntry` type; only the
   amount follow-ups carry name prefixes (`dhf-miete`, `umzug-kosten`, `spenden-betrag`, …), the
   top-level ids (`dhf`, `umzug`, `spenden`, …) are deliberately bare — that is a naming trait,
   not a namespace. Collision safety against the parallel Grenzgänger CH vertical (Ticket 09) comes
   structurally from the closed `EntryStepId` union plus the `buildStepIndex` throw (D3), not
   from the naming: a second claim of the same id cannot be built that way. The server derives the
   owning entry from the bare `questionId` (`entryForStep`, D3 in `interview.ts`),
   instead of trusting a client-supplied scope — the same admission, only the entry
   differs. The `eintrag` query on the GET is the re-entry surface; an
   unknown id is a 400.

## Consequences

- **Honesty is structural:** an unreadable LStB value cannot be
  presented as "forgotten" and a contradiction cannot be presented as corrected — both are a named state,
  not a default.
- **One calculation path:** the `LstbZustand` (and later the `AngestelltenStand`/the
  `Plausibilitäts-Prüfung`) is computed exclusively in `packages/core`; the API only maps.
- **The client stays dumb:** mobile-web renders the form from the GET; no second state logic in the
  client (ADR-0033). MSW handlers are generated (orval), never handwritten.
- **Deliberately NOT here:** scan/OCR (product ADR-045), the tax formulas (tariff, Fünftelregelung (one-fifth rule),
  Progressionsvorbehalt (progression proviso), zumutbare Belastung (reasonable burden)), wiring the working days / Pendlerpauschale (commuter allowance) to the
  API, and the real cockpit data — those are later slices; this slice captures and folds honestly
  what can be captured and folded (the same "partial truth as partial truth" cut as
  `berechnung.ts`).
- **Migration:** one additive `Lstb` table, `@@unique([userId, steuerjahr])`; no change to
  existing tables (Interview/TaxYear/Beleg untouched) — the interview changes (R2) are
  purely additive in the catalog layer.
