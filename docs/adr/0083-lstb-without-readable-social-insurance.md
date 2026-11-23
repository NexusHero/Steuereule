# ADR-0083 — Lohnsteuerbescheinigung without readable social insurance

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/lstb/lstb.service.ts`, `apps/api/src/lstb-scan/`, `apps/mobile-web/src/screens/lstb/scan/`
- **Builds on:** ADR-0008 (applying values), adding a further certificate (scan robustness)

## Context

In the 2024 real case there was a second Lohnsteuerbescheinigung (wage tax certificate) from the
same employer (payment after leaving, tax class 6). Gross salary and wage tax were readable, the
social insurance lines in the scan were not. „Werte übernehmen“ ("Apply values") required all three
values, so the salary and tax of this certificate were missing entirely.

## Decision

1. **The social insurance may be missing.** Gross salary and wage tax are applied. If the social
   insurance stays empty, it counts as open.
2. **For a further certificate** the salary and tax are added to the existing total. The social
   insurance total stays in place with its provenance.
3. **A further certificate counts as the same certificate** only if all values read are the same.
4. **Form:** an empty social insurance field does not block „Werte übernehmen“. A hint says what
   then happens and that the user can also enter the amount themselves. The plausibility check
   treats the missing social insurance as 0.

## Consequences

- 2024 real case: salary and wage tax of both certificates appear together in the
  Lohnsteuerbescheinigung, as with the tax advisor.
- The owl's drafts for a scanned certificate stay as they are; values are applied via the form.
