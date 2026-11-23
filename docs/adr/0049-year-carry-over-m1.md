# ADR-0049 — Year carry-over: source `uebernahme`, unconfirmed items count toward the range, marking layer (Draft)

- **Status:** Draft — promotion needs Musti review (ticket 10.8 review)
- **Date:** 2026-10-25 (M2: carry-over of ALL facts; M3: year selection + notice + 4-prior-years validation)
- **Deciders:** Suhay (agent, ticket 10.8) — draft; promotion needs Musti review
- **Implements** product ADR-021 (year carry-over: copy everything, but marked as "unconfirmed"),
  product ADR-022 (year reference of the provenance)
- **Builds on** ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0037 (tax year model),
  ADR-0014/015 (provenance/partial truth), ADR-0008 (field encryption)
- **Context tags:** architecture, uebernahme, determinism boundary, honesty principle, security

## Context

Product ADR-021: a new tax year COPIES everything from the prior year, but every copied item
carries the provenance „Übernahme aus {Vorjahr}" ("Carried over from {prior year}") and counts as **unconfirmed** until it is tapped or
covered by a document; unconfirmed items count toward the range, not toward the point value — a
calm, grey tone, never a conflict (ADR-008 is there for contradictions). The ticket scope
(year carry-over + up to 4 prior years + prominent year selection + annual rule sets) is too large for
one slice — this draft fixes the slices: M1 (LStB tracer, merged) → M2 (all
facts + cockpit sums, this state) → rest (ADR-022 UI, named follow-ups).

## Decision

1. **The core carries the carry-over state (`berechnung.ts`)** — `Quelle` grows by
   `{ art: 'uebernahme'; vorjahr: number }` (the provenance with year reference, ADR-022), `Posten` by
   `unbestaetigt?: boolean` (absent = confirmed). `berechne` COUNTS unconfirmed items in the
   buckets (they are real numbers), but withholds the point value and names them calmly in the `offen` branch:
   `unbestaetigte` (count) + `unbestaetigteSumme` (income sum) — never as a conflict.
   `cockpitSpanne` carries `unbestaetigteSumme` as uncertainty into the range.

2. **The copy/confirmation contract (`uebernahme.ts`)** — `uebernommenerPosten(posten,
   vorjahr)` (source `uebernahme`, `unbestaetigt: true`), `bestaetigePosten(posten)` (flag removed,
   provenance STAYS — a confirmed fact does not change its provenance, ADR-0012 §4 instinct),
   `uebernahmeHerkunft(vorjahr)` (the provenance chip).

3. **One generic marking layer instead of unbestaetigt columns in every fact model**
   — `UebernahmeKennzeichnung { userId, steuerjahr, vorjahr, postenKey, bestaetigt }` with
   `@@unique([userId, steuerjahr, postenKey])`. The facts stay in their models (Lstb/…);
   the marking is the layer that says what was copied from where and whether it is confirmed.
   A second copy attempt is a 409 (DB unique as a second control), a confirmation without
   a marking is a 404.

4. **M2 (the carry-over of ALL facts):** `POST …/uebernahme` copies LStB, pension, capital and
   every rental property — one marking per fact (`lstb`, `rente`, `kapital`,
   `vermietung-<objektId>`); a year already carried over is a 409 (never a half copy), a
   prior year without A SINGLE fact that can be carried over is a 404 ("Nothing to take over" — the fact
   counts, not the form). The cockpit range sums ALL unconfirmed captured amounts
   (LStB gross + pension annual amount + capital income + rental income per property); an open
   copied field carries no sum — open stays open, never a fabricated zero (ADR-032).

5. **M3 (ADR-022 UI):** the cockpit app bar carries a prominent year selection (chips, current
   year + up to 4 prior years) — screen state, the cockpit query runs per selected year (never
   "current" values); the calm carry-over notice appears in the cockpit as soon as unconfirmed
   markings exist — the sum carried by the range is quoted honestly, every row
   carries its provenance with year reference („Lohnsteuerbescheinigung · Übernahme aus 2025"
   ("wage tax certificate · carried over from 2025"),
   `uebernahmeHerkunft` from the core) and is confirmed individually (PUT bestaetigen → refetch,
   the notice disappears honestly). The carry-over validates `von >= steuerjahr - 4`
   (MAX_RUECKJAHRE = 4, an older year is a 400 — never a silent old copy).

6. **Remaining limit (named honestly):** the year-selection entry in ONBOARDING (the chips live
   only in the cockpit so far), the collected review-screen collection, the provenance chips in the
   detail screens (LStB/pension/capital/rental income) and the annual-rule-set UI (lump sums/
   allowances per year — the pattern has been in place since 10.7: per-year tables, never "current" values)
   are named follow-ups; the marking layer already carries their keys.

## Consequences

- **Honest limit, named once:** unconfirmed items are neither "open required fields" nor
  conflicts — a third, calm state; the point value stays withheld, the range carries the
  carried-over sum as uncertainty (ADR-021 verbatim).
- **No denormalized unbestaetigt columns:** a new fact model needs no
  schema change — it needs a `postenKey` and the service read path.
- **Security posture:** the marking carries no amounts/PII (only userId + years + key),
  plaintext is justifiable (like Beleg.art); the copied facts stay in their
  field-encrypted columns (ADR-0008) — the copy moves encrypted field strings unchanged,
  never recomputed; WRITE audited (REQ-004).
- **Register:** REQ-028 (next free number after 027).

## Alternatives considered

- **`unbestaetigt` column in every fact model.** Rejected: five schema changes for a
  state that lives more cheaply, generically and with a year reference via the marking layer.
- **Treat unconfirmed items like conflicts.** Rejected: ADR-021 prescribes the calm tone; a
  conflict hard-blocks the submission, a carry-over only waits for a tap.
- **The carry-over ignores the open/unclear state of the prior year.** Rejected: the copied
  field strings travel UNCHANGED — open stays open (no fabricated zero, ADR-032).
