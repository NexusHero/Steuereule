# ADR-0039 — Steuerjahr-Zustandsmaschine (Entwurf) <!-- adr-check-ignore -->

- **Status:** Draft — not yet promoted to `docs/adr/`
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 04) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-018 (Zustandsmaschine: vier Randzustände, zwei davon echte Zustände)
- **Context tags:** architecture, state machine, honesty principle

## Context

Produkt-ADR-018 fixed the Steuerjahr lifecycle: the happy path is Entwurf → Prüfung → Eingereicht →
Bescheid da → Abgeschlossen, and of four edge cases exactly **two** become real states — "Rückfrage"
(Finanzamt requests documents) and "Extern erledigt" (user files directly via ELSTER) — while two
deliberately do **not**: a technical submission failure (stays `pruefung` + a toast, a technical
error must never look like a tax status) and a missed deadline (stays `entwurf` + a warning banner).

The state machine needs to live in the shared core so the API can validate every transition
server-side and web/mobile render the same statuses — the same instinct as ADR-0033 for the
interview graph.

## Decision

**`steuerjahr-status.ts`** — a pure transition table:

- `SteuerjahrStatus` = `entwurf | pruefung | eingereicht | rueckfrage | bescheid | abgeschlossen | extern-erledigt`.
- `istUebergangErlaubt(von, nach)` and `naechsteZustaende(von)` over a closed transition map:
  `entwurf → pruefung|extern-erledigt`, `pruefung → eingereicht|entwurf|extern-erledigt`,
  `eingereicht → rueckfrage|bescheid`, `rueckfrage → eingereicht|bescheid`,
  `bescheid → abgeschlossen`; `abgeschlossen` and `extern-erledigt` are terminal.

The two non-states (technical failure, missed deadline) are enforced by **absence**: there is no
`failed` and no `verspätet` status, so neither can be reached — the same "unrepresentable to
violate" instinct as ADR-0031 §4.

## Consequences

- The API can validate a status write against `istUebergangErlaubt` before persisting; web/mobile
  derive the same legal-next-states for their UI.
- **Open for promotion review (the honest caveat):** ADR-018 names the states and the main flow
  but not the full transition matrix. The exact edges above — in particular `pruefung → entwurf`
  (reopen to edit), and `extern-erledigt` being reachable only from `entwurf`/`pruefung` (never
  after `eingereicht`) — are this slice's interpretation and need product confirmation before
  promotion.

## Alternatives considered

- **Model the four edge cases as four statuses.** Rejected: ADR-018 explicitly ruled two of them
  are NOT states; encoding a `failed`/`verspätet` state would make a technical failure look like a
  tax status, the exact defect ADR-018 names.
