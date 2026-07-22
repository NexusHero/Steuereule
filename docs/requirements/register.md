# Requirements Register

The living source of truth for delivered requirements (ultimate-dev-process §1.1). Each requirement
is *discussed* in its issue on the **SteuereuleBoard** GitHub Project and *tracked* here. Numbers are
stable (`REQ-NNN`) and never reused.

Status values: `Proposed` → `Ready` → `In progress` → `In review` → `Done` (has a green
acceptance-tier test against the real artifact, §3.5).

| REQ | Statement | Status | Issue | Acceptance test |
|-----|-----------|--------|-------|-----------------|
| REQ-001 | Cockpit shows the refund estimate **range** and open-items count, read from the API, with honest empty/loading/error states, i18n copy (de) and formatted numbers. | Ready | [#3](https://github.com/NexusHero/Steuereule/issues/3) | _pending (written red before implementation)_ |

## Traceability

Every `REQ-NNN` maps to at least one acceptance-tier test (§3.5). The matrix is filled as slices are
implemented; a requirement reaching `Done` without a green acceptance test against the real deployed
artifact is not done.

| REQ | Acceptance test (Given–When–Then) | Location | State |
|-----|-----------------------------------|----------|-------|
| REQ-001 | Given a seeded tax year, when the Cockpit opens, then the estimate range + open-items count render from the API with honest states. | _tbd (Playwright, e2e overlay)_ | not yet written |
