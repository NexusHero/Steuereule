# ADR-0082 — The owl changes entered values only on request

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/advisor-overwrite-guard.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Builds on:** ADR-0066 (field catalog), ADR-0073 (Person B)

## Context

In the 2025 real case the user answered a follow-up question only by saying that the partner pays
nothing toward the Krankentaggeld (sickness daily allowance) herself. The owl then created new
drafts for all of the partner's premium fields. One of them set the NBU premium, read from the
employer's confirmation, to ten times its value. Anyone who applies the drafts without reading each
one thus loses a correct value.

## Decision

1. **The owl may fill empty fields**, including fields that are still at 0. That is the state of an
   untouched form.
2. **An entered value changes only on request.** A draft for a field with a different value stays
   only if the user's message names the new value (in any usual notation: „5.120“,
   „5’120,00“) or asks for a change („ändern“, „korrigieren“, „falsch“, „statt“ ("change",
   "correct", "wrong", "instead of") …).
3. **A draft that writes the existing value again is dropped.**
4. **The answer says what stayed unchanged:** which field, the entered value and what the owl would
   have proposed. One sentence invites the user to state the correct value.
5. The rule applies to the model's drafts, both for the live display and for the stored answer.
   Drafts from documents remain exempt, because there the document is the request. It also does not
   apply to the fixed rules without a model, because they read their values from the message itself.

## Consequences

- 2025 real case: the NBU premium would stay at the value read. The owl would have stated its
  differing proposal instead of silently preparing it.
- A value the owl derives from information (e.g. days driven converted into vacation days) goes
  only into an empty field or one at 0. If the user wants to change an entered value this way, they
  say so.
