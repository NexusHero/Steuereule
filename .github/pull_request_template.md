## What & why

<!-- One or two sentences: what this change does and why. No AI-assistant attribution. -->

## Definition of Done — Ticket/Slice (ADR-0036)

Tick each line before requesting review. The reviewer confirms each line, not just the tick.

- [ ] **TDD** — failing test written first, then the implementation; the test is green now.
- [ ] **Gates green** — `pnpm -r typecheck` and `pnpm lint` (oxlint `--deny-warnings`) pass locally.
- [ ] **Review gate** — opened as a draft PR for Musti (ADR-0017); no unresolved findings.
- [ ] **Acceptance test** exists on the tier the REQ demands (Musti's PR #249 ruling).
- [ ] **No bespoke machinery** — framework/library standard first; any deviation has an ADR.
- [ ] **Comments explain why, never what** — touched files trimmed.
- [ ] **Security/Performance posture line** — does this slice touch either axis?
  - [ ] **n/a** — neither axis touched, one-sentence reason:
  - [ ] **touched** — guarding test / measurement linked here:
- [ ] **ADR followed up** where an architectural decision was made; **register maintained** where a REQ was touched.

## Deviations (if any)

<!-- ADR-0036 D20: approved by Musti, recorded here **and** in the register with reason + follow-up ticket. -->
