# ADR-0054 — Zusammenveranlagung (joint assessment): one joint tax return, Person A also enters data for Person B

- **Status:** Accepted (stakeholder decision 2026-11-05, grilling after the 4-person test run)
- **Date:** 2026-11-05
- **Deciders:** NexusHero (stakeholder)
- **Amends** [ADR-0050](0050-paper-filing-instead-of-elster-in-1-0.md) (printout, unlock per tax year)
- **Context tags:** product scope, data model, payment, test gate

## Context

The test run of 05.11.2026 with four people showed that married couples do not get a
fileable tax return in the app:

1. **Linking only for the current year.** Zusammenveranlagung can only be set for the current
   year (`CURRENT_TAX_YEAR`), not for the selected tax year.
2. **No way to accept the invitation.** Person B has nowhere in the app to redeem the
   invitation code.
3. **Two tax returns instead of one.** Each account prints its own ESt 1 A and lists itself
   as Person A. The partner's income is missing from both tax returns.
4. **No place for B's income without an account.** If Person B has no account of her own, there
   is no place for her income.
5. **The estimate calculates as single.** It does not ask for marital status and calculates
   married people as single until the master data is filled in.

Three of the four test scenarios (Grenzgänger (cross-border commuter) couple with children, wife
as Grenzgängerin, DE couple with real estate and capital) therefore cannot be passed.

## Decision

1. **One tax return per couple and tax year, printed by Person A.** The PDF contains
   - the ESt 1 A,
   - A's Anlagen (schedules),
   - B's Anlagen (N, N-Gre, Vorsorgeaufwand, KAP, V with person marking),
   - the Anlage Kind (child schedule) with the parent-child relationship to A and B.

   Person B sees the tax return read-only. The unlock applies once per couple and year.
2. **Person A also enters data for Person B.** For B there are the same screens as for A:
   Lohnsteuerbescheinigung (wage tax certificate) or CH Lohnausweis (Swiss salary certificate),
   commute, provision. The data lives in a separate record for B. As soon as B links an account
   via the invitation code, B maintains this data herself, and A only sees it read-only.
3. **Linking per tax year.** Every screen works with the selected tax year, never with
   `CURRENT_TAX_YEAR`. There is a dedicated screen for redeeming the invitation code.
4. **Assignment of capital and real estate.**
   - Per securities account: belongs to A, B or both.
   - Per rental property: co-ownership share in percent, default 50/50.
5. **Marital status in the minimal gate.** It is the fourth question, after the children. The
   master data takes over the value. The estimate never again calculates married people as
   single. It uses
   - the splitting tariff,
   - the Günstigerprüfung (most-favorable check) Kindergeld versus Kinderfreibetrag,
   - church tax as a range,
   - capital with Günstigerprüfung and rental income as income.
6. **Acceptance via the four test scenarios.**
   - The scenarios from the test run become a Playwright test that runs entirely through the
     UI.
   - It runs on every PR and must be green before the merge.
   - The expected values are kept as fixtures in the repo:
     - income tax, Soli and church tax from the BMF income tax calculator,
     - the lines for N-Gre, AfA and the commuter allowance as a documented manual calculation.

## Consequences

- **Data model:** Inputs that hang off `userId` today (LStB, Lohnausweis, commute,
  provision) get a person role (A/B) within the link. Account deletion, the
  DSGVO (GDPR) export and the list of encrypted fields must cover the B record.
- **Completing the printout:** The printout is only completed once B's required fields are
  complete as well.
- **Pipeline duration:** The acceptance test makes every PR longer. In return, gaps such as a
  missing screen show up immediately and not only in the manual test run.
- **Scope boundary:**
  - Separate assessment (§ 26a EStG) and an automatic comparison of Einzelveranlagung versus
    Zusammenveranlagung are not part of this decision.
  - Losses from capital assets and crypto honestly remain „nicht unterstützt“ ("not supported").
