# ADR-0047 — Deadline/Verspätungszuschlag warning mode: filing deadline rule set, 60-day banner, no `verspätet` status (Draft)

- **Status:** Draft — promotion needs Musti review (ticket 10.7 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, ticket 10.7) — draft; promotion needs Musti review
- **Implements** product ADR-022 (annual rule sets: the UI shows the rules of the selected year,
  never "current" values), product ADR-023 (deadlines are critical → sober and precise), ADR-0039
  (a missed deadline is NOT a status: stays `entwurf` + warning banner)
- **Builds on** ADR-0039 (tax year state machine), ADR-0004 (pure core), the
  date discipline of bescheid.ts (ISO yyyy-mm-dd, UTC arithmetic)
- **Context tags:** architecture, fristen, verspaetungszuschlag, determinism boundary, honesty
  principle

## Context

The warning mode (M6) warns **from 60 days before the filing deadline** about the late-filing surcharge
(§ 152 AO). Product ADR-018/engineering ADR-0039 decided: the missed deadline is
NOT a status of its own — the tax year stays `entwurf`, and a warning banner is added (a
technical/temporal state must never look like a tax status). Product ADR-022
requires annual rule sets: the filing deadline is a configuration PER YEAR, never a date derived from
"current" values. Product ADR-023 requires the sober tone: what
happened, what to do, no punchline, never blame on the user.

## Decision

A pure, UI-free module `packages/core/src/deadlines.ts` (ADR-0004, no I/O), a
read-only API module, a banner in the cockpit:

1. **Filing deadline as an explicit rule set (`abgabefristFuer`)** — § 149 Abs. 2 AO: 31 July of the
   following year (generally since assessment period 2018). An explicit table per year (2024 → 31.07.2025,
   2025 → 31.07.2026, 2026 → 02.08.2027, because 31.07.2027 is a Saturday, § 108 Abs. 3 AO), cited, pinned in the test — never derived from "current" values
   (product ADR-022). A year outside the table THROWS (throw, don't approximate —
   the same rule as tarif.ts); the retroactive years (up to 4) are added with 10.8, then
   the table grows.

2. **Warning mode (`fristenWarnung`)** — a derived level `keine` | `warnung` | `abgelaufen`
   from whole remaining days (deadline − today, exclusive): `warnung` from 60 days (including
   the deadline day itself, 0 days), `abgelaufen` from the following day. The level is the BANNER INPUT,
   never a status (ADR-0039 — there is simply no `verspätet` value in
   steuerjahr-status.ts, so the missed deadline stays `entwurf`). The § 152 Abs. 2 AO figures
   (0.25 % per started month, at least €25) are cited constants that the banner
   states soberly (product ADR-023).

3. **"Today" belongs to the server** — the core computes with ISO yyyy-mm-dd dates (UTC, locale-
   independent, the same discipline as bescheid.ts's objection deadline). The API produces "today"
   in Europe/Berlin (`heuteInBerlin`, injectable `now` — the midnight case is unit-tested),
   never the client clock, which the user could change.

4. **API (`Fristen` module) + cockpit banner** — `GET /v1/steuerjahre/{jahr}/fristen` returns
   `{ abgabefrist, heute, stufe, verbleibendeTage, verspaetungszuschlag }`. No persistence,
   no audit (the deadlines are statutory facts, not user data — REQ-004 does not apply).
   An unsupported year is an honest 400 at the boundary, never the deadline of a
   neighboring year. The `FristenBanner` in the cockpit (empty AND loaded state) renders
   NOTHING on `keine` (honest absence, no permanent banner) and otherwise soberly with the deadline and
   the amount.

## Consequences

- **Honest limit, named once:** § 108 Abs. 3 AO (a deadline ending on Sat/Sun/public holiday moves
  to the next working day) is NOT here — the table states the calendar date of the
  regular deadline; the § 108 shift is a named follow-up (the same public-holiday limit as
  werktage.ts). The 60-day threshold is the product requirement from the ticket, not an invented one.
- **The level logic is tested core-pure**; the acceptance test checks the self-consistency of the
  response (verbleibendeTage = deadline − the server's today) instead of a fixed date — the level
  honestly depends on the real server day.
- **No new tax year status, anywhere** — the warning cannot touch the status flow;
  a "verspätet" (late) is unrepresentable (ADR-0039/ADR-0031 §4 instinct).
- **Register:** REQ-027; 10.5/10.6 occupy 025/026 on the parallel branches — check for
  collisions on merge (REQ numbers are stable and never reused).

## Alternatives considered

- **`verspätet` as a tax year status.** Rejected: product ADR-018/ADR-0039 explicitly
  ruled that out — a temporal state must never look like a tax status.
- **Derive the deadline from "current" values (today + X).** Rejected: product ADR-022 requires
  annual rule sets; a derivation drifts silently at the turn of the year and with changes in the law.
- **"Today" from the client.** Rejected: the client clock is manipulable and time-shifted; the
  server reference date in Europe/Berlin is the one honest source.
- **The banner in its own tax year status area.** Rejected: the banner is
  derived UI truth above the status, not a status itself — the separation is the control.
