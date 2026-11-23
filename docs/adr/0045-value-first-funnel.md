# ADR-0045 — Value-first funnel: a guest may use the minimal gate, the Steuer-ID becomes optional, the upgrade carries interview answers along

- **Status:** Accepted — decided by the user (stakeholder) on 2026-10-25; promotion of the
  text in review
- **Date:** 2026-10-25
- **Deciders:** NexusHero (stakeholder decision „Stufe 2 Value-First-Funnel" ("Stage 2 value-first funnel")) — implementation:
  Suhay (agent)
- **Context tags:** funnel, onboarding, identity, data-ownership, honesty principle

## Context

Until now the app required an account + Steuer-ID (tax identification number) BEFORE the user sees any value. The
stakeholder decided („Stufe 2 Value-First-Funnel"): the user should experience value first —
guest → minimal gate (three questions) → cockpit range → only THEN the account wall (registration/
login) → profile, and the Steuer-ID may initially be missing (it is added later in the profile).
In the same move the stakeholder decided the license: **PolyForm Noncommercial 1.0.0** (LICENSE
replaces MIT) — a stakeholder decision, referenced here, not technically justified.

The consequences for the data flow: a guest who answers the minimal gate already has
InterviewAnswer and TaxYear rows under their guest UserId; the guest→account upgrade (REQ-006)
must take these over instead of losing them.

## Decision

1. **A guest may use the minimal gate (segment 1), nothing else.** `InterviewController` loses the
   blanket `@RequiresAccount`; `InterviewService` lets a guest read/write ONLY the entry
   `minimal-gate` — every other catalog entry stays 401 (the same error shape
   as before, ADR-0031 §4: access protection stays server-side, not in the client).

2. **The Steuer-ID becomes optional.** `Profile.steuerId` becomes nullable (migration
   `profile_steuer_id_optional`); `PutProfileDto.steuerId` optional, if missing → `null`
   ("not provided yet", never an empty string); the export template and profile DTOs handle
   `null` honestly („—"). Validation (`isValidSteuerId`) still applies to every
   value provided — optional only means "may be missing", never "may be anything".

3. **The upgrade carries the guest answers along.** `upgradeGuestToAccount` re-keys
   `InterviewAnswer` and `TaxYear` rows per tax year to the account UserId; on conflict
   the account wins (idempotent — a second run changes nothing). Audit entries of the
   interview move along; the rest of the guest audit stays with the guest context.

4. **Account wall as a screen.** `KontoWandScreen` sits in the funnel path (guest → interview →
   cockpit range → account wall → profile); the „Später" ("Later") path stays honestly visible (the user
   can go back to the cockpit range, the account prompt comes back when the funnel
   provides for it).

## Consequences

- REQ-015 (minimal gate) P3 flips deliberately: the guest may use the minimal gate — the acceptance test
  (real socket) proves the new guest path AND that catalog entries stay 401 for guests.
- REQ-006 (guest→account, atomic) grows by the carry-over cases: InterviewAnswer + TaxYear per
  tax year re-keyed, idempotent, conflict rule documented.
- License: LICENSE is now PolyForm Noncommercial 1.0.0 — a legal stakeholder
  decision that touches no gate (no build impact, text only).
- The Steuer-ID nullability reaches through the profile repository, export report, onboarding mapping
  and the generated clients — `null` is the new honest "not provided yet" state.

## Alternatives considered

- **Lock guests out fully (status quo).** Rejected by the stakeholder: exactly the value-before-account
  entry is missing.
- **A guest may use the whole catalog.** Rejected: segment 2 is not yet permitted server-side,
  and every further guest access would be a security and data-hygiene risk
  without a product reason.
- **Steuer-ID as an empty string "not provided".** Rejected: `null` is the one honest
  state; an empty string would bypass validation and the export.
- **The upgrade discards guest answers.** Rejected: that would be exactly the loss of value the
  funnel showed the user first.
