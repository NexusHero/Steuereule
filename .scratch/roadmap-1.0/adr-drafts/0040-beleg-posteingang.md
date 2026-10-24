# ADR-0040 — Beleg-Posteingang-Schnitt (Entwurf) <!-- adr-check-ignore -->

- **Status:** Draft — not yet promoted to `docs/adr/`
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 04) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-007 (Upload ohne Jahresbindung, Zuordnung als Vorschlag),
  Produkt-ADR-008 (Posten-Konflikt sichtbar statt stilles Überschreiben)
- **Builds on** ADR-0008 (Feldverschlüsselung), ADR-0007/0012 (userId-Seam), REQ-004 (Audit)
- **Context tags:** architecture, receipt inbox, security, honesty principle

## Context

Produkt-ADR-007: users photograph receipts at the moment of receipt, not while filing — so a Beleg
lands **unbound** (no year); extraction *suggests* a year (payment date over invoice date, § 11 EStG
Zufluss/Abfluss) and a tap confirms. Produkt-ADR-008: conflicting sources become a **visible
conflict**, never a silent overwrite. Scan/OCR is out of scope here (ADR-036/045, later slices) —
this slice builds the **data interface** only.

## Decision

1. **`packages/core/beleg.ts`** — the pure model:
   - `BelegDaten`: the persisted *facts* (id, userId, filename, optional invoice/payment dates,
     confirmed year).
   - `steuerjahrVorschlag`: the § 11 rule — payment date's year, else invoice date's year, else
     none; carries the `herkunft` (`zahlungsdatum`|`belegdatum`) for the "Regel: Zahlungsdatum" chip.
   - `zuordnungAusDaten`: the **derived** state (`ungebunden | vorgeschlagen | zugeordnet |
     konflikt`). `konflikt` = a confirmed year contradicts the date-derived suggestion — **both
     years stay visible** (ADR-008).
   - `ordneZu`: the one assignment operation; it persists the year, and the conflict is *derived*
     on the next read, never a separate stored flag.

   The Zuordnung state is **derived, never stored** — same instinct as TaxYear's range being
   recomputed (ADR-014/048): a stored copy of a derivable state could only drift.

2. **`apps/api` Beleg module + Prisma migration** — `POST /v1/belege` (unbound create),
   `GET /v1/belege` (inbox), `POST /v1/belege/:id/zuordnung` (the tap). Guest-compatible
   (UserContextGuard, like Profile/Cockpit — receipts are collected "im Moment des Erhalts",
   possibly pre-account; REQ-006 carries them over). The `Beleg` table stores facts; `dateiname`
   is field-encrypted at rest (ADR-0008 — filenames carry PII, joinable to Profile's Steuer-ID);
   dates stay clear (the suggestion rule and the `(userId, steuerjahr)` index need them without
   decrypting). WRITE/READ access is audited (REQ-004).

## Consequences

- The conflict is honest and cheap: assigning a year that contradicts the dates *just works* and
  the derived state reports `konflikt` — nothing is silently overwritten, no extra column.
- The Posten-**amount** conflict (ADR-008's "Beleg sagt 480 €, Nutzer tippt 500 €") lives in the
  Berechnungs-Kern (`PostenKonflikt`, draft 0038) because it is triggered by OCR, which is not built
  yet — this slice's Beleg table therefore stores no `betrag` column (honest: no amount to store).
- **Security posture:** new persistent user data. `dateiname` field-encrypted (ADR-0008); access
  audited (REQ-004). The receipt *binary* storage is out of scope here (ADR-036/045) — when it
  lands, the storage-key field must join the encrypted set.
- **Open for promotion review:** whether the "conflict on the *year*" is even a product-visible
  state, or whether ADR-008's conflict is exclusively the Posten-**amount** conflict and the year
  reassignment should simply overwrite (the slice modelled the year-conflict because the ticket
  AC lists ADR-007/008 together — a product call, not a settled law).

## Alternatives considered

- **Store the Zuordnung state as a column.** Rejected: a derivable state is exactly what ADR-014/048
  says to recompute, never persist.
- **Require `@RequiresAccount()` (no guest).** Rejected: receipts are photographed at receipt time,
  possibly before account; Profile already establishes guest-compatible sensitive persistence
  (field-encrypted, REQ-006 carries it over).
