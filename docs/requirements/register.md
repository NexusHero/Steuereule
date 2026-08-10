# Requirements Register

The living source of truth for delivered requirements (ultimate-dev-process §1.1). Each requirement
is *discussed* in its issue on the **SteuereuleBoard** GitHub Project and *tracked* here. Numbers are
stable (`REQ-NNN`) and never reused.

Status values: `Proposed` → `Ready` → `In progress` → `In review` → `Done` (has a green
acceptance-tier test against the real artifact, §3.5).

| REQ | Statement | Status | Issue | Acceptance test |
|-----|-----------|--------|-------|-----------------|
| REQ-001 | Cockpit shows the refund estimate **range** and open-items count, read from the API, with honest empty/loading/error states, i18n copy (de) and formatted numbers. | **Done** | [#3](https://github.com/NexusHero/Steuereule/issues/3) · PRs #119, #135 | `apps/api/test/cockpit.{http,service,integration}.test.ts`, `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`, `apps/api/test/openapi-contract.test.ts:65-107` (`describe('OpenAPI contract for GET /v1/steuerjahre/{jahr}/cockpit (REQ-001)')`) |
| REQ-002 | Every request is scoped to a **userId** established through one seam (`UserContextGuard`) — an anonymous, signed guest session before any account exists — so controllers/services never depend on which identity system issued it. | **Done** | [#29](https://github.com/NexusHero/Steuereule/issues/29) | `apps/api/test/guest-session.test.ts`, `apps/api/test/user-context.guard.test.ts` |
| REQ-003 | Sensitive profile fields (starting with the Steuer-ID) are persisted server-side, **field-encrypted at rest** (AES-256-GCM, randomized, rotation-ready key) — never in client-side storage. | **Done** | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) | `apps/api/test/profile.integration.test.ts` (REQ-003.1 round-trip, REQ-003.2 ciphertext-at-rest via raw SQL, REQ-003.4 cross-userId isolation, real Postgres, `.inject()` transport — integration tier) · `apps/api/test/acceptance/req-003-encryption-at-rest.test.ts` (the same clauses plus REQ-003.3 randomization and REQ-003.5 tamper-integrity, real Postgres, real socket — acceptance tier, #167; REQ-003.5 stays green under an encryption break — `apps/api/src/profile/profile.repository.prisma.ts:37`'s `isValidSteuerId` shape check is a second, encryption-independent guard, so this clause proves shape-rejection, not encryption) |
| REQ-004 | Every read/write of a user's sensitive tax/profile data is appended to an **immutable audit log**, visible to the data subject in their own export and to no one else. | **Done** | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) / [#10](https://github.com/NexusHero/Steuereule/issues/10) | Append-only `AuditRepository` + write-and-audit in one `$transaction`; **REQ-004-tagged tests:** `apps/api/test/profile.integration.test.ts:248-364` (`describe('REQ-004 — immutable audit log of tax-data access')`, REQ-004.1–.6, real Postgres, `.inject()` transport — integration tier) · `apps/api/test/acceptance/req-004-audit-log.test.ts` (the same REQ-004.1–.6 clauses plus the own-export/no-one-else visibility clause, real Postgres, real socket — acceptance tier, #167). Own rows are also surfaced in the Art. 15 export (see REQ-011). |
| REQ-005 | A guest can create a real account with **email + password**; the account works immediately, the email is verified async, and an unverified state is shown honestly rather than silently trusted. | **Done** | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) · PRs #116, #118, [#215](https://github.com/NexusHero/Steuereule/pull/215) + [#225](https://github.com/NexusHero/Steuereule/pull/225) (the "shown honestly" half — a snapshot read that kept asserting "please confirm your email" after verification had completed out of band; #215 fixed Registrierung, #225 fixed Login) · [#223](https://github.com/NexusHero/Steuereule/issues/223) promotes that manual proof into a standing CI gate on both screens | `apps/api/test/acceptance/req-005-email-signup.test.ts`, `apps/mobile-web/src/screens/RegistrierungScreen.test.tsx`, `apps/mobile-web/src/screens/LoginScreen.test.tsx`, `e2e/visibility/visibility-refetch.mjs` (real-stack live re-read, both screens, in CI) |
| REQ-006 | A guest upgrading to a real account (email/password or social) carries **all** their guest-owned data over **atomically** — never partially — and the guest session is retired. | **Done** | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) · PR #116 | `apps/api/test/acceptance/req-006-guest-upgrade.test.ts` |
| REQ-007 | An account holder can add **TOTP 2FA** and/or a **passkey (WebAuthn)** as opt-in additional sign-in factors. | Proposed — **1.0** _(see note below — updates ADR-027(b))_ | tbd (Epic [#8](https://github.com/NexusHero/Steuereule/issues/8)) | _not started_ |
| REQ-008 | A user can sign in/up with **Google** in 1.0; **Apple Sign-In** is built and wired but stays flagged off until an Apple Developer account + a shipped iOS build exist. | **Google: Done** · Apple: not started | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) · PRs #144, #148 | `apps/api/test/req-008-google-login.test.ts`, `apps/api/test/auth-capabilities.http.test.ts`, Login/Registrierung screen tests. **Correction:** Apple is *not* code-complete-but-flagged — it is **unbuilt**; see Notes. |
| REQ-009 | Sessions are server-verified and stored per platform: better-auth DB-backed sessions; web keeps the token only in an `httpOnly`+`Secure`+`SameSite=None` cookie (ADR-0011 §Interaction / ADR-0012 §3 explicitly supersede the original `SameSite=strict` wording for the deployed demo's genuine cross-site topology, compensated by ADR-0011's fail-closed CORS origin allowlist and ADR-0012 §5's origin-based CSRF check — see Status accuracy); Expo/RN keeps it only in `SecureStore`. | **Done (web)** · Expo/`SecureStore` half not built | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) · PR #116 | `apps/api/test/acceptance/req-009-session-model.test.ts` |
| REQ-010 | Login/account endpoints carry baseline hardening: per-route login rate limiting, CSRF protection, `helmet`/CSP security headers, and a known-breached-password check at signup/change. | **Done** (CSRF · helmet/CSP · breach-check) · **not met (rate limiting)** — IP-keyed only, bypassable by a single-value `X-Forwarded-For`; closes only once the network property from [#292](https://github.com/NexusHero/Steuereule/issues/292) exists | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) · PR #116, #247 | `apps/api/test/acceptance/req-010-security-hardening.test.ts` (rate-limit clause: proves IP-keyed counting, not failed logins — #248), `apps/api/test/breach-check.test.ts`, `apps/api/test/cors.acceptance.test.ts`, `apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts` (real Postgres; @documents-defect #292 — A1), `apps/api/test/trusted-proxies.test.ts` (unit), `apps/api/test/acceptance/auth-mount-cors.test.ts` (real Postgres — CORS on the `/api/auth/*` mount itself), `apps/api/test/acceptance/req-005-email-signup.test.ts:112-175` (nested `describe('the known-breach check (REQ-010, must land no later than REQ-005)')` — the breach-check clause, proven at acceptance tier against the real server: the HIBP call is stubbed and its hit count asserted, and the rejection asserts the exact `PASSWORD_COMPROMISED` code) |
| REQ-011 | Every account holder can **export** their full data (Art. 15/20) and **delete** their account (Art. 17, with the mandatory pre-delete export offer, ADR-011) — this REQ must be **Done before any real, non-synthetic user** is let onto the product. | **Done** | Epic [#8](https://github.com/NexusHero/Steuereule/issues/8) / [#10](https://github.com/NexusHero/Steuereule/issues/10) · PRs #137, #138, #153 · closed #129, #130 | `apps/api/test/acceptance/req-011-export.test.ts`, `apps/api/test/acceptance/req-011-export-delete.test.ts` — real Postgres + real Chromium; `apps/mobile-web/src/screens/DatenschutzScreen.test.tsx` — reached from Profil, wired to the real endpoints; `e2e/cross-origin/run.mjs` — proves the export filename is browser-readable cross-origin; `apps/api/test/openapi-contract.test.ts:109-221` (`describe('OpenAPI contract for DELETE /v1/account (REQ-011, ADR-0013)')` and `describe('OpenAPI contract for GET /v1/account/export (REQ-011/ADR-0013)')`). |
| REQ-012 | Onboarding is joined to the real backend end to end: a brand-new guest's form prefills from `GET /v1/profile` (the honest all-null empty state, never mock data) and completing it persists through `PUT /v1/profile`. | **Done** | [#53](https://github.com/NexusHero/Steuereule/issues/53) | `apps/mobile-web/src/screens/onboarding/req-012-onboarding-vertical-join.test.tsx` — proves the `GET`/`PUT /v1/profile` vertical join. Its no-client-storage assertion no longer uses the vacuous `vi.spyOn` pattern: #329 (merged `66a481b`) replaced it with `assertNoStorageWrites()`/`stubStorageSetItem()` (`apps/mobile-web/src/test-storage-guard.ts`), a `vi.stubGlobal`-based guard the jsdom `Storage` Proxy cannot defeat, now asserting both `localStorage` **and** `sessionStorage` (`AsyncStorage` is not a dependency of this repo). **The guard is not yet sound.** Musti's retroactive T1 review of #329 found three defects in `test-storage-guard.ts`, none fixed in any merged or open PR as of 2026-08-10: (1) `assertNoStorageWrites` cannot detect its own disconnection — it passes after a real `localStorage.setItem('leak','steuerid')` when handed an uninstalled `vi.fn()`, the same defect class #323 was meant to remove, one level up; (2) the stand-in's `{ ...window[storeName] }` spread copies stored **keys**, not the Storage API, so `getItem`/`removeItem`/`clear` throw on it; (3) `vitest.config.ts`'s coverage `exclude` hand-enumerates test infrastructure and misses this file. So this test proves the vertical join, and *attempts* to prove no-client-storage with an instrument that has known, open gaps in whether it would actually fail. Independent of any test: the property holds by **static absence** — zero call sites for `localStorage`/`sessionStorage`/`AsyncStorage` across shipped `apps/*/src`, `packages/*/src` (three matches, all comments, measured 2026-08-10). A real-browser gate for the same clause (#331) is in review and currently **refuted** (8 findings) — not cited as evidence. See Status accuracy — 2026-08-10 below. |
| REQ-013 | A user can view and edit their stored profile (name, Steuer-ID, Steuernummer) against the live `GET`/`PUT /v1/profile`, with honest loading/empty/error states and no client-side persistence (ADR-0008). | **Done** | [#95](https://github.com/NexusHero/Steuereule/issues/95) · PRs #126, #149 | `apps/mobile-web/src/screens/ProfilScreen.test.tsx` (incl. the shared-cache regression), reachable via the tab bar since #149 — proves the `GET`/`PUT` view-and-edit round trip. Its no-client-storage assertion no longer uses the vacuous `vi.spyOn` pattern: #329 (merged `66a481b`) replaced it with the same `assertNoStorageWrites()`/`stubStorageSetItem()` guard (`apps/mobile-web/src/test-storage-guard.ts`) described under REQ-012, now asserting both `localStorage` **and** `sessionStorage`. **The guard is not yet sound**, for the same reason as REQ-012's: Musti's retroactive T1 review of #329 found three defects in that shared helper — sharpest, it cannot detect its own disconnection (passes after a real leak when handed an uninstalled `vi.fn()`) — none fixed in any merged or open PR as of 2026-08-10. Independent of any test: the property holds by **static absence** — zero call sites for `localStorage`/`sessionStorage`/`AsyncStorage` across shipped `apps/*/src`, `packages/*/src` (three matches, all comments, measured 2026-08-10). A real-browser gate for the same clause (#331) is in review and currently **refuted** (8 findings) — not cited as evidence. See Status accuracy — 2026-08-10 below. |
| REQ-014 | An account holder already signed in on their phone can authorize a new desktop session by confirming a device-authorization code shown on the desktop, without the desktop ever seeing a password; the phone verifies the exact code (not a bare tap) against the requesting browser/OS/region/time before approving with a single tap — Decision 5's session-only/trusted-device choice was revoked mid-slice (#238): one grant, one fixed lifetime, no scope choice; authorized sessions are listed and individually revocable. | **Done** | [#238](https://github.com/NexusHero/Steuereule/issues/238) / [#239](https://github.com/NexusHero/Steuereule/issues/239) (merged to `main`) | `apps/api/test/acceptance/req-014-device-code.integration.test.ts` (task 0 — migration + plugin registration + `POST /v1/device/code`, real Postgres); `apps/api/test/acceptance/req-014-device-approve-token.integration.test.ts` (task 2 — `/v1/device/{pending,approve,token}` round trip against the real server: AC-3 match-verification payload is the real request's own browser/region/time, AC-5 a QR-authorized session is real and individually revocable, plugin's own approve/token routes stay unreachable, pending rate limiter fires, real Postgres); `apps/api/test/acceptance/req-014-device-list-session-freshness.test.ts` (regression — real cross-origin repro of a stakeholder report: `list-sessions` 403'd `SESSION_NOT_FRESH` on a session older than better-auth's own 24h `freshAge` default, even though it was still well inside its 7-day `expiresIn` and `GET /v1/profile`/`get-session` both kept working — the "listed" clause silently broke for any returning user; fixed by `session.freshAge: 0` in `apps/api/src/auth/better-auth.ts`, real Postgres — proves the mechanism, not that it caused the stakeholder's original report: that turns on whether a session row ≥24h old existed on his machine at screenshot time, unanswered as of #299) |
| REQ-015 | An account holder answers the Minimal-Gate's three interview questions (`job`, `ausland`, `kinder`) — one per screen — and the two hard branches (Gewerbe-Gate on self-employment, CH-only-Gate on foreign work) are enforced **server-side**, not merely shown by the client; each answer persists server-side, field-encrypted, keyed on `(userId, Steuerjahr, questionId)` in a new `InterviewAnswer` model — never in client storage — and the interview endpoints require a real account session (`@RequiresAccount()`, no guest path). This is **Segment 1 only** of ADR-0031's two-segment interview (the three-question Minimal-Gate); Segment 2 (the other six questions, arriving as the on-demand catalog's first entry) is out of scope here and gets its own REQ once its ticket (#321) is refined — ADR-0031 Consequences: "Two REQs, not one." | **Done** — #318 task 2 (wiring the screens to the real API) has landed. The GWT's closing clause — answering through the actual UI drops the Cockpit's open-items count — is now demonstrated three ways, and they are **not** of equal standing: (1) a committed, CI-gated integration test in `apps/mobile-web/App.test.tsx` (Cockpit CTA → Minimal-Gate → answering → open-items count drops; jsdom, mocked MSW transport) is the standing regression proof of the join; (2) `apps/api/test/acceptance/req-015-minimal-gate.test.ts` (unchanged, real Postgres + real socket) remains the standing API-side acceptance proof of persistence, the two server-side gates, ciphertext-at-rest, guest-401, and cross-user isolation; (3) a one-off manual verification — a real Chromium against the real exported web bundle and the real API, plus `curl` against a booted server, measuring the count fall `null → 2 → 1 → 0` and confirming `localStorage` empty after the whole flow — was **run by hand and is not committed as a gate**; it corroborates (1) and (2) but is not itself a standing check and is not cited as one. Every GWT clause now has a named, existing, standing test — ADR-0025's bar for `Done`. | [#318](https://github.com/NexusHero/Steuereule/issues/318) (Segment 1 of [ADR-0031](../adr/0031-the-interview-is-three-questions-and-a-catalog.md); parent Epic [#11](https://github.com/NexusHero/Steuereule/issues/11)) | `packages/core/src/interview.test.ts` (P1 — table-driven `nextStep`/`isReachable` graph coverage, pure, no I/O); `apps/api/test/acceptance/req-015-minimal-gate.test.ts` (19 tests, real Postgres + real socket via `buildApp()` — the GWT walk-through by identity, P2 server-side rejection of an unreachable/invalid/unknown answer with no row written, P3 guest-401 on both endpoints via `@RequiresAccount()`, P4 cross-user isolation on read and write, P5 ciphertext-at-rest checked by raw SQL with per-write randomized nonce, P6 vertical three-answer round-trip against `TaxYear.openItems`, plus the audit-trail clauses); `apps/api/test/interview.service.test.ts` (unit, 15 tests); `apps/api/test/requires-account.guard.test.ts` (unit — `RequiresAccountGuard` in isolation, the P3 seam); `apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx` (33 tests, up from 23 — #318 task 2 added the real GET/POST wiring itself: loading, load-error+retry, re-entry seeding from a stored answers set, the 400/409 "server disagrees with the local graph" resync path, a genuine network-failure revert, and the Cockpit query-invalidation side effect the GWT's closing clause depends on; still includes P7 no-`localStorage`); `apps/mobile-web/App.test.tsx` (new integration test, `"Cockpit's 'Fragen beantworten' reaches the Minimal-Gate, and finishing it drops the Cockpit open-items count"` — the GWT's closing clause walked end to end through the real app shell and router, jsdom + mocked MSW transport, CI-gated — the standing proof of the screen-to-Cockpit join); `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx` (17 tests, incl. the "Fragen beantworten" CTA reaching the Minimal-Gate from both the loaded and the empty state — also cited under REQ-001 above); `packages/ui/src/components/Option.test.tsx` (the DS `Option` ported into `packages/ui`, 8 tests); `apps/api/test/openapi-contract.test.ts:93-140` (`describe('OpenAPI contract for /v1/steuerjahre/{jahr}/interview (#318, REQ-015)')` — documents `GET`/`POST /v1/steuerjahre/{jahr}/interview[/antworten]` with the `jahr` path param, the `200`/`400`/`409` responses, and the four schemas (`InterviewStateDto`, `PostAnswerDto` with its required `questionId`/`value` fields, `PostAnswerResponseDto`, `StepDto`); proves the OpenAPI document's shape, not a live request — no real server, no Postgres, unchanged. **Manual verification (not committed, not CI-gated):** a real Chromium session against the real exported web bundle and the real API, plus `curl` against a booted server, measured the Cockpit open-items count fall `null → 2 → 1 → 0` across the three answers and confirmed `localStorage` empty after the whole flow — recorded as strong corroboration, not as a standing check. |

## Status accuracy — reconciled 2026-07-27

This register had drifted badly: REQ-003/004/005/006/008/009/010/011 still read `Proposed` with
"ticket not yet opened" while all of them were built and merged, and **REQ-012 and REQ-013 were
missing entirely** despite shipping with their own acceptance tests. Every status above is now set
from evidence — a named test file that actually exists in the repo — rather than from intent.

Three corrections worth calling out, because they change what the register *claims*:

- **REQ-011 was not Done at the time of that reconciliation** — both endpoints were merged and
  tested against real Postgres and real Chromium, but **no screen reached them**, so a user could
  not export or delete anything and saying "Done" would have hidden exactly that. That is now
  closed: the Datenschutz screen merged with #153 and the status above is **Done** on the same
  evidence standard (named test files that exist in the repo).
- **REQ-008's Apple half is unbuilt, not "code-complete but flagged off."** The note below described
  it as built-and-gated; no Apple integration exists in the codebase. Corrected in the table.
- **Correction (2026-08-03, Musti's REQ-010 ruling on PR #247):** the line above — carried at this
  reconciliation and repeated in the traceability matrix below — claimed **REQ-004 has no acceptance
  test of its own.** That was wrong **on the day it was written**: `apps/api/test/profile.integration.test.ts:248-364`
  already contained `describe('REQ-004 — immutable audit log of tax-data access')` with REQ-004.1
  through REQ-004.6 (one-entry-per-write, read logging, append-only/no-mutation-surface, cross-userId
  isolation, no plaintext/ciphertext value stored, failed writes append nothing), run against real
  Postgres, landed **2026-07-23** (`08099ac`) — five days before the reconciliation commit itself
  (`d650a03`, **2026-07-28** — one day later than the "reconciled 2026-07-27" heading above states)
  recorded the gap as genuine. No test was ever missing; the check that produced this note never
  looked. Re-verified by execution on 2026-08-03 (real Postgres): all 6 pass. The traceability matrix's
  REQ-004 row is corrected to cite this test directly.

## Status accuracy — reconciled 2026-08-03 (Musti's REQ-010 ruling on PR #247)

PR #247 (#241's trusted-proxies fix) appended its own test paths to REQ-010's row (`a5d053f`) without
re-reading the status/GWT/state above them — the row still read `Done`/`green` unconditionally, while
one of the tests just cited (`apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts`'s A1) is a **permanent regression
test that stays green *because* the bypass it documents is unfixed**. A pass through all 13 rows found
four more lines where the cited evidence proves something other than what the line claims — not a
missing file (that class was closed in the 2026-07-27 reconciliation above and has stayed closed), but
the file existing and being correct, while the register's summary of it drifted. Full ruling:
https://github.com/NexusHero/Steuereule/pull/247#issuecomment-5170258284

- **REQ-010's rate-limiting clause is corrected above to a composite status**, the same form already
  used for REQ-008 (Google/Apple) and REQ-009 (web/Expo): the three other clauses (CSRF, `helmet`/CSP,
  breach-check) are genuinely `Done`/`green` and **keep that credit** — #247 did not touch them and
  they are not in question. Only the rate-limiting clause moves off `Done`, labeled **`not met (rate
  limiting)`** — the same phrase in both the `Status` and traceability `State` columns (F5, Musti's
  review on this PR: the two columns had described the identical fact in two different words,
  `In progress` vs. `nicht erfüllt`, in a section whose whole subject is status accuracy) — gated on
  [#246](https://github.com/NexusHero/Steuereule/issues/246) (the still-missing deployment pipeline;
  without it there is no real `TRUSTED_PROXIES` value, and a single-value `X-Forwarded-For` bypasses
  the limiter regardless of any value that could be configured today — see the corrected GWT clause).
- **Labeling convention for regression tests that guard a known, unfixed defect (ADR-0021 keeps such
  tests standing on purpose, so this will recur):** an acceptance-test citation whose passing state
  *documents a bypass* rather than *proves a fix* must say so at the point it's cited, not just in the
  test's own comment. REQ-010's `apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts` citation and its traceability
  `State` column now both carry that flag ("A1 is green *as evidence of the bypass*"). **F4 (Musti's
  review on this PR): the rule wasn't applied to its own most important instance.**
  `apps/api/test/acceptance/req-010-security-hardening.test.ts` sat first, unmarked, in both citation columns while #248 (this
  same reconciliation) documents that its rate-limit test never reaches a real failed login. Fixed
  above: both citations now carry `(rate-limit clause: proves IP-keyed counting, not failed logins —
  #248)`. Any future REQ row citing a test in this class should do the same rather than relying on a
  reader to open the test file and notice.
- **R4, verified by real execution, not taken on faith (Musti could not run it — no Postgres/Docker in
  his session; this session has both).** Booted the real server (`node --import tsx`-style boot via
  `buildApp()`) against a native Postgres 16 instance and drove `apps/api/test/acceptance/req-010-security-hardening.test.ts`'s
  exact "repeated failed logins from the same account" scenario by hand, capturing every status code
  and body, plus checking the `user`/`RateLimit` tables directly:
  - `POST /api/auth/sign-up/email` with no `origin` header → **403 `MISSING_OR_NULL_ORIGIN`**; no
    `user` row created (`rate-limited@example.com` never exists).
  - The 12 subsequent `sign-in/email` attempts against that (nonexistent) account: the first 3 also
    **403 `MISSING_OR_NULL_ORIGIN`**, then attempts 4–12 **429**. **Musti's per-attempt prediction (all
    12 → 403) is corrected by this run: 3× 403, then 429 from attempt 4, once the limiter's own
    threshold trips ahead of the origin check.** (His original wording was internally inconsistent —
    twelve 403s would have left `toContain(429)` red, so both could never have held at once.) **His
    conclusion holds**: the rate limiter counts in better-auth's `onRequest` hook, which runs *before*
    `originCheckMiddleware`, so once the threshold trips it starts answering 429 before the origin check
    gets another chance to run; no credential validation is ever reached, and `toContain(429)` passes
    for a reason unrelated to its name. A section about "the evidence proves something other than the
    line claims" should not record a measurement as confirming a prediction it corrects — noted here so
    this line doesn't repeat that mistake about itself.
  - This test is the register's own cited evidence for REQ-010's rate-limiting clause and is now known
    to prove the wrong thing under its current name. Rebuilding it (send a trusted `origin` so it
    exercises real failed logins, per `apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts`'s A1/A2 pattern — or
    honestly rename it) is **its own ticket (ADR-0017: one finding, one ticket)**, not folded into this
    documentation pass. Filed as [#248](https://github.com/NexusHero/Steuereule/issues/248).
- **F5 — REQ-010's `Status` and GWT cells were in German; the register is English throughout**
  (`docs/process/README.md`: "the development process is **English**; the product/app language is
  **German**"). The wording traces back to Musti's own suggested replacement text, offered in a German
  review comment on PR #247 — adopting it verbatim there was the right call (his exact words, not a
  paraphrase); the mismatch was in his template, not in copying it. Both cells are now translated
  above and in the traceability row, including a fix to a half-sentence that was grammatically broken
  in the German original too ("the single-value form closes only the network property — the app
  unreachable except through the real proxy" had no verb connecting the two clauses; now reads "...is
  closed only by a network property — the app being unreachable except through the real proxy — which
  does not yet exist").
- **F3 — the evidence-tier system above is Musti's own technical determination, not a register-owner
  call.** This PR's first draft raised REQ-002's `.inject()`-only tier as an open tension while leaving
  REQ-003/REQ-004's `apps/api/test/profile.integration.test.ts` — measured: 32× `app.inject()`, 0× `fetch()` — at
  plain, untagged `green`. Both readings are individually defensible, but not in the same diff: if
  `.inject()` disqualifies a row, it disqualifies REQ-003 (unchanged `green` since the original
  reconciliation) and now REQ-004 too; if a real dependency (Postgres) is the bar instead, `.inject()`
  is irrelevant and REQ-002's actual gap is that its own tests carry no dependency at all, not their
  transport. Deciding which reading governs is a technical call about what §3.5 requires, not a
  register-state call — Musti's, not Suhay's (unlike R1 below). His ruling: the three-tier system
  above, applied consistently to REQ-002/003/004/010.
- **R1 — `SameSite=strict` → `SameSite=None` (REQ-002, REQ-009): confirmed (Musti).** He ruled on
  this in his report comment rather than on the line itself — his own noted process gap, since only
  line-anchored review threads trigger a reaction from me; he's flagged it for himself to anchor
  decisions to the line going forward. ADR-0011 (§Interaction) and ADR-0012 §3 both explicitly and
  deliberately supersede ADR-0007/ADR-0009's `SameSite=strict` wording with `SameSite=None; Secure`,
  reasoned from the deployed demo's genuine cross-site topology (web and API on distinct `*.fly.dev`
  registrable domains) — and the shipped code (`apps/api/src/auth/better-auth.ts:201`, `apps/api/src/auth/user-context.guard.ts:70`) and
  its own tests (`apps/api/test/acceptance/req-009-session-model.test.ts:78`, `apps/api/test/user-context.guard.test.ts:72`,
  `apps/api/test/cors.acceptance.test.ts:132`) all assert `None`, consistently. The three "pending Musti's
  confirmation" markers are removed from REQ-002's and REQ-009's statement/GWT text above; the
  requirement text now carries the substance of his confirmation directly rather than a footnote:
  - **The supersession trail** — ADR-0011 §Interaction and ADR-0012 §3, by name, as the two Accepted
    decisions that replaced `SameSite=strict`. Without naming them, the change reads as a silent
    weakening of a security-relevant cookie attribute rather than a decided, traceable one.
  - **The compensating controls** — ADR-0011's fail-closed CORS origin allowlist and ADR-0012 §5's
    origin-based CSRF check, which is *why* `SameSite=None` doesn't leave the session cookie
    unprotected: `SameSite=None` alone removes the cookie's own CSRF defence-in-depth, and these two
    controls are what carries that weight instead (ADR-0012 §3 says this plainly — "removes the
    cookie's own CSRF defence-in-depth, which is why REQ-010's origin-based CSRF check... is
    load-bearing, not optional" — it just wasn't in the requirement text these two REQ rows carry).

  **Why this was Musti's call, not the stakeholder's** (his own reasoning, recorded here): the two
  superseding ADRs are already Accepted, and the register is downstream of them, not a parallel
  decision surface. It would belong to the stakeholder only if the cookie policy itself were being
  changed here (it isn't — this is documentation catching up to a decision already made in 2026-07-23's
  ADR-0011/ADR-0012) or if the requirement text were itself a user-facing promise (it isn't — REQ-002
  and REQ-009 describe an internal session mechanism, not a claim made to the product's users).
- **R3 — REQ-002's traceability `Location` column cited source files (`apps/api/src/auth/guest-session.ts`,
  `apps/api/src/auth/user-context.guard.ts`), not tests; corrected above to the actual test files** (already named
  correctly in the summary row, line 13), **plus the two acceptance-tier tests that were sitting
  un-cited in this very paragraph's own draft: `apps/api/test/cors.acceptance.test.ts`'s guest `Set-Cookie`
  assertion and `apps/api/test/acceptance/req-009-session-model.test.ts:129-133`'s guest-vs-session precedence test.** The
  latter boots the real `buildApp()` on a real socket against real Postgres and asserts the guest
  cookie is minted on an unauthenticated request — a genuine acceptance-tier proof of REQ-002's mint
  clause against the real deployed artifact; it just wasn't cited under REQ-002. This was a citation
  fix, not a status question — both candidates were already named, just not linked. (Musti's
  correction, and the general point behind it: escalating to whoever owns the register state costs
  someone else a turn; when the candidates can be named, look them up first, and reserve escalation
  for what's still open *after* looking — unlike R1 below, where there genuinely is nothing to look up,
  only a call to make.) `State` is now `green (unit + acceptance)`, tier-tagged per the Evidence tiers
  table in the Traceability section.
- **A general process gap, not specific to any one row:** a status gets set when the slice that writes
  a REQ line lands, and is then read again only by whichever slice *next* touches that same line — never
  on its own schedule. #247 followed the letter of the existing process (append test paths on request)
  and still produced a wrong row, because nothing asked it to re-read the status/GWT/state above the
  citation it was adding to. **Proposed rule:** touching any part of a REQ row requires re-reading the
  whole row — statement, status, issue, acceptance test, and its corresponding GWT/state in the
  Traceability table — not just the cell being edited. This is the same principle as ADR-0022's
  "a push is a claim, resolving is my confirmation," applied to documentation instead of code review.

## Status accuracy — 2026-08-05: #246 closed, REQ-010's rate-limiting gate moves to #292

The stakeholder closed [#246](https://github.com/NexusHero/Steuereule/issues/246) by hand on
2026-08-05 at 16:56 UTC. **REQ-010's rate-limiting clause does not move with it**: the gap #246 named
— no path from a merged commit to a running deployment on k3s/Hetzner — is still real, so the clause
stays **not met**, for exactly the reason the 2026-08-03 section above records. Only the ticket it is
gated on changes, to [#292](https://github.com/NexusHero/Steuereule/issues/292), #246's successor.

- **#274 did not close the gap, and never claimed to.** It merged two minutes before #246 was closed,
  which makes the two easy to read as cause and effect. It delivers a **local** production-shaped
  Compose stack (ADR-0026); its own merge commit names what it leaves open: *"ADR-0026 records the
  reasoning, including what this deliberately does not resolve: #75 (@steuereule/core's production
  packaging) and #246 (the real … deployment pipeline) both stay open, architecture-gated decisions."*
  (The commit says "Fly.io" there — the stale premise #246's own 2026-08-05 correction retired in
  favour of ADR-049, k3s on Hetzner. The point holds either way.)
- **Why a successor ticket and not a reopen.** Three options were put to the stakeholder — reopen
  #246, re-point the marker at [#277](https://github.com/NexusHero/Steuereule/issues/277), or file a
  collecting successor. **He ruled: the closure of #246 stands, and #292 carries the remaining
  deployment gap** with every dependent #246 held (`WEB_APP_URL` from #238/#239, the real
  `trustedProxies` CIDRs via #277, #224's real-device preview pass, #279's liveness/readiness
  endpoint, #278's `k8s/`-vs-ADR-049 question, and #238 task 0b's DB-IP geo database). #277 is a
  single configuration value blocked on the deployment; it is not the gap itself, which is why the
  marker points at #292 and not at it.
- **The gate did its job, and that is the reason this section exists.** Minutes after #246 closed,
  `register-check` went red on every branch: *"apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts
  carries `@documents-defect #246`, but issue #246 is closed — this test's green state was documenting
  an unfixed defect against a ticket that no longer says 'unfixed'"* (check 5, CI run 31027645862 on
  `main`). That is the designed behaviour from ADR-0025 item 3: the day the defect ticket closes is the
  day the row goes red until a human re-reads it. Whoever eventually closes #292 should expect the same
  red and read it as the prompt, not as breakage.
- **Everything that mirrors the marker moved in one change**: the test's own comment
  (`apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts`, rewritten rather than
  renumbered — it explains *why* A1 is green), both citation columns (the summary row above and the
  traceability row below, which check 5 requires to carry the identical marker text), the summary
  `Status` column's gate, and the traceability GWT clause.
- **The 2026-08-03 section above is left as written**, including its reference to #246 as the gating
  ticket: it is a dated record of what was decided that day, not a live claim. The live claims are the
  table cells, and those now read #292.

## Status accuracy — 2026-08-10: REQ-012/REQ-013 evidence corrected (vacuous localStorage assertion, #323)

Musti reproduced and reported ([#323](https://github.com/NexusHero/Steuereule/issues/323)): the two
tests cited as REQ-012/REQ-013 evidence assert `expect(setItemSpy).not.toHaveBeenCalled()` against a
`vi.spyOn(window.localStorage, 'setItem')` spy. jsdom implements `Storage` behind a `Proxy` whose `get`
trap ignores the spy's own property, so the spy never intercepts — proven live with a same-line
`localStorage.setItem('leak','steuerid')` that still passed the assertion. **Neither test has ever
tested the client-storage clause it is cited for.**

He also measured the property directly, independent of the broken test: `localStorage|sessionStorage|
AsyncStorage` across every non-test file in `apps/*/src` and `packages/*/src` returns **three hits, all
comments, zero call sites**, and no `i18next-browser-languagedetector` (a common source of an incidental
`localStorage` write) is configured. The "nothing sensitive is written to client storage" property is
**true today, by static absence** — what is missing is a *regression* control, not correct behaviour.

**Ruling (register owner): status stays `Done`, evidence corrected.** Status tracks delivered
behaviour; the evidence column tracks proof. Here the delivered behaviour is genuinely correct and the
cited proof is genuinely hollow — the two can legitimately disagree, and downgrading `Done` to match
the evidence defect would make the register wrong in the other direction (the property the requirement
describes does hold, measured independently of the broken test). The Acceptance test / Location cells
above and in the Traceability table below are corrected to say so explicitly rather than cite the
vacuous assertion as proof.

**Not closed by this edit.** The fix — replacing the `spyOn` with a `vi.stubGlobal`-based stub the
Proxy cannot defeat, with each fixed test's red path actually run and recorded — is tracked in
[#323](https://github.com/NexusHero/Steuereule/issues/323) (Kaan, T1, ADR-0018 refinement complete
2026-08-10). This correction removes the false claim; it does not supply the missing control. When
#323 lands, these four cells should be re-read again and the "vacuous"/"unevidenced" language retired
in favour of citing the fixed, red-path-proven tests directly.

## Status accuracy — 2026-08-10 (re-read): #329 landed the control, the control has open defects

The paragraph above is now stale in one respect: #323's control **did** land, the same day, as
[#329](https://github.com/NexusHero/Steuereule/pull/329) (merged `66a481b`). The four cells above and
in the Traceability table below have been re-read and corrected accordingly rather than left saying
"until #323 lands a real control."

**What actually changed in `main`.** `vi.spyOn(window.localStorage, 'setItem')` is gone from both
`ProfilScreen.test.tsx` and `req-012-onboarding-vertical-join.test.tsx`. Both now go through a shared
helper, `apps/mobile-web/src/test-storage-guard.ts` (`stubStorageSetItem()` / `assertNoStorageWrites()`),
built on `vi.stubGlobal` — a mechanism the jsdom `Storage` Proxy cannot defeat — and both now assert
**`localStorage` and `sessionStorage`** (REQ-012's own comment always named a third, `AsyncStorage`,
which is correctly left unasserted: it is not a dependency of this repo, and stubbing it would be a
control over something that cannot happen). The old citation to `:185`/`:215-216` as a `vi.spyOn` call
is retired; those line numbers now fall inside a `describe` block and a closing `})` respectively.

**The new control is not yet trustworthy, and the register should not overstate it either way.** Musti
ran the T1 review #329 was owed but never got before merging (it merged on CI-green alone), and found
three defects in `test-storage-guard.ts` itself, all posted on #329, none fixed in any merged or open
PR as of this re-read:

1. `assertNoStorageWrites` treats a zero call count as proof of nothing-written, which is equally
   consistent with the guard never having been installed — measured: it passes after a genuine
   `localStorage.setItem('leak','steuerid')` when handed a disconnected `vi.fn()`. This is #323's own
   defect class, one level up, in the helper that replaced it.
2. The stand-in's `{ ...window[storeName] }` spread copies the store's **enumerable keys** (i.e. any
   data already written), not its API — `getItem`/`removeItem`/`clear`/`length` are `undefined` on the
   stand-in and a read throws.
3. `vitest.config.ts`'s coverage `exclude` hand-enumerates test infrastructure and misses this file.

**Ruling (register owner): status stays `Done` on both rows, unchanged from the 2026-07-27 evidence
basis.** Nothing above touches delivered behaviour. What it changes is which sentence is honest about
the evidence: the register no longer says "vacuous, holding by static absence only" (true before #329)
and does not say "proven by a working control" either (not true — the control exists but has not
itself been shown to fail correctly). The accurate sentence, now in all four cells: a real guard exists
and asserts both reachable stores, that guard has three open, unfixed defects including one that
mirrors #323's own class, and the underlying property is independently confirmed by static absence
(`localStorage|sessionStorage|AsyncStorage` — three matches across `apps/*/src`, `packages/*/src`, all
comments, zero call sites, measured 2026-08-10) and — for the calibration half only — by
[#331](https://github.com/NexusHero/Steuereule/pull/331)'s real-browser gate, which is **not** cited as
proof of the clause itself: it is open, draft, and Musti's review currently reads it **refuted** with
eight findings (the sharpest being that its own baseline/mid-flow dumps are printed but never
asserted, so its calibration claim — "the gate went red from the first dump" — does not yet hold as
written).

**Not closed by this edit, again.** This corrects the register's evidence claim a second time; it does
not fix `test-storage-guard.ts`. When Musti's three #329 findings and #331's eight findings are
resolved and merged, these four cells are due a third and hopefully final re-read, at which point the
"open defects" language should retire in favour of citing the fixed, calibration-proven controls
directly.

## Notes — 2026-07-23 auth/login direction

A stakeholder grilling session on login/auth settled the direction captured in REQ-002 through
REQ-011 above. Two provenance points worth flagging explicitly for traceability:

- **Supersedes engineering ADR-0007 in its IdP specifics.** ADR-0007 named Keycloak as the identity
  provider with better-auth as an OIDC relying party. The settled direction drops Keycloak: **better-auth
  is the auth server itself**, sitting behind the already-built `UserContextGuard` userId seam (REQ-002)
  so an external IdP could still slot in later without controller/service changes. This is an
  engineering/architecture call — the lead (Musti) owns writing the superseding ADR; this register only
  captures the resulting product requirements (REQ-003–REQ-011), which hold regardless of which system
  sits behind the seam.
- **REQ-007 (2FA/passkeys) updates product ADR-027(b).** ADR-027, part (b), reads "keine 2FA in 1.0"
  (Grilling R4, 2026-07-22). The 2026-07-23 stakeholder session explicitly settled 2FA (TOTP) and
  passkeys into 1.0 scope (Slice 2) — a day later, and more specific than the prior blanket call. I'm
  recording REQ-007 as the newer, explicit decision, but I am **not** editing ADR-027 myself (product
  ADRs are outside what I touch here per this task's scope); this needs a formal ADR-027 amendment and
  is flagged to the human/lead for that. Until that amendment lands, treat REQ-007 as the operative
  requirement and ADR-027(b) as superseded on this one point only — multi-device-without-management,
  part (b)'s other half, is untouched.
- **Sequencing gate — CLOSED (2026-07-28, #153).** REQ-011 (DSGVO export/delete) is 1.0 scope and had
  to be **Done** before Slice 2 (real accounts, REQ-005/006) could be opened to any real,
  non-synthetic user. It now is: both endpoints were already merged, and the user-facing half — the
  Datenschutz screen reached from Profil, real JSON/PDF export downloads, real deletion with
  fresh-auth re-verification and the corrected DSGVO copy — merged with #153, through both crew
  gates (T1 review + real-stack test). A user can now genuinely exercise Art. 15/20 and Art. 17 from
  the product.
  **What this gate does and does not license:** it removes the *DSGVO* block on letting real users
  onto Slice 2. It is not a blanket production-readiness statement — the deployment questions
  ADR-0013 flagged (the API runtime image must carry the Chromium binary the PDF renderer needs) and
  the CI-enforcement gap (#71, branch protection) are separate and still open.
- **Apple gate.** REQ-008's Apple half is **not built** (the earlier "code-complete but flagged off"
  wording was wrong). It must exist and flip on by the day an Apple Developer account and a shipped
  iOS build both exist — offering Google on iOS obligates Sign in with Apple per App Store rules.

## Traceability

Every `REQ-NNN` maps to at least one acceptance-tier test (§3.5). The matrix is filled as slices are
implemented; a requirement reaching `Done` without a green acceptance test against the real deployed
artifact is not done.

**Evidence tiers (Musti's REQ-010 ruling on PR #249)** — the `State` column's "green" needs a tier
suffix so §3.5's "against the real artifact" is checkable rather than a matter of each row's own
reading of "real":

| Tier | Meaning |
|------|---------|
| `green (unit)` | handler/module tested in isolation, no real dependency |
| `green (integration)` | a real dependency (Postgres), transport via `.inject()` |
| `green (acceptance)` | real `buildApp()` + a real socket + a real dependency |

`Done` (line 7–8 above) binds to the **acceptance** tier. Applied consistently below to REQ-002,
REQ-003, REQ-004, and REQ-010 — the four rows this and the prior reconciliation touched.

| REQ | Acceptance test (Given–When–Then) | Location | State |
|-----|-----------------------------------|----------|-------|
| REQ-001 | Given a seeded tax year, when the Cockpit opens, then the estimate range + open-items count render from the API with honest states. | `apps/api/test/cockpit.integration.test.ts`, `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`, `apps/api/test/openapi-contract.test.ts:65-107` | green |
| REQ-002 | Given a first-time visitor with no session cookie, when they make any user-scoped API request, then the server mints an opaque HMAC-signed guest `userId`, returns it as an `httpOnly` cookie (`Secure` in production, `SameSite=None` — ADR-0011 §Interaction and ADR-0012 §3 explicitly supersede the original `SameSite=strict` wording, compensated by ADR-0011's fail-closed CORS origin allowlist and ADR-0012 §5's origin-based CSRF check; see Status accuracy), and scopes all reads/writes to that `userId`; no controller/service reads `userId` from anywhere but this guard; guest data is reachable only by its own session until claimed by a real account. *Traces to: product ADR-027 ("Identität erst bei Abgabe"); engineering ADR-0007 phase 1 (the seam itself — its Keycloak specifics are superseded, see Notes above).* | `apps/api/test/guest-session.test.ts`, `apps/api/test/user-context.guard.test.ts` (unit); `apps/api/test/cors.acceptance.test.ts:124` (real HTTP, fake repositories — cited as what it is, not full acceptance tier); `apps/api/test/acceptance/req-009-session-model.test.ts:129-133` (nested under its own `describe('REQ-002 — ...')`, real `buildApp()`, real socket, real Postgres — mints the guest cookie for an unauthenticated request against the actual deployed artifact) | green (unit + acceptance) |
| REQ-003 | Given a caller (guest or account) `PUT`s a profile containing a Steuer-ID, when the API persists it, then the Steuer-ID (and any equally sensitive tax identifier) is stored as ciphertext from a vetted authenticated cipher (AES-256-GCM, randomized nonce, e.g. via `prisma-field-encryption`), encrypt/decrypt happens transparently in the service layer, the data-encryption key comes from a rotation-ready sealed secret (never hard-coded, never returned to any client), and no sensitive field is ever written to `localStorage`/`AsyncStorage` on any client; a DB or backup leak alone does not expose the Steuer-ID in the clear. *Traces to: engineering ADR-0008 (refined into a concrete, testable cipher/key requirement); product ADR-020 (EU-Cloud, encrypted); DSGVO Art. 5(1)(f); ADR-0003 (no real PII in non-prod).* | `apps/api/test/profile.integration.test.ts` (real Postgres, `.inject()` transport) · `apps/api/test/acceptance/req-003-encryption-at-rest.test.ts` (real Postgres, real socket via the actual `buildApp()` boot — #167; REQ-003.5 stays green under an encryption break — `apps/api/src/profile/profile.repository.prisma.ts:37`'s `isValidSteuerId` shape check is a second, encryption-independent guard) | green (integration + acceptance) |
| REQ-004 | Given a userId with a persisted profile, when any process (the owner's own session, or an authorized export path) reads or writes that profile's sensitive fields, then an append-only audit record is written (acting userId/session, field-class touched, operation, timestamp); the data subject sees their own access log as part of their Art. 15 export; no one can query another user's audit trail. *Traces to: engineering ADR-0007's hardening list ("audit logging of tax-data access"); DSGVO Art. 15/30.* | append-only `AuditRepository`; `apps/api/test/profile.integration.test.ts:248-364` (REQ-004.1–.6, real Postgres, `.inject()` transport) · `apps/api/test/acceptance/req-004-audit-log.test.ts` (REQ-004.1–.6 plus the own-export/no-one-else visibility clause, real Postgres, real socket via the actual `buildApp()` boot — #167); own rows also surfaced in the Art. 15 export (see REQ-011) | green (integration + acceptance) |
| REQ-005 | Given a visitor on the Login screen, when they submit a valid email + a password meeting policy, then the auth server creates the account, sends a verification email, and signs them in; while unverified, the UI honestly shows a "please verify" state without blocking basic use; when they follow the verification link/code, then the account is marked verified; a password matching the known-breach check (REQ-010) is rejected before account creation completes. *Traces to: product ADR-027(a) (email/Google/Apple sufficient for 1.0); engineering ADR-0007 methods (email+password); DSGVO data minimization.* | `apps/api/test/acceptance/req-005-email-signup.test.ts`, `apps/mobile-web/src/screens/RegistrierungScreen.test.tsx`, `apps/mobile-web/src/screens/LoginScreen.test.tsx`, `e2e/visibility/visibility-refetch.mjs` (CI-gated, real Chromium + real API + real Postgres — the "shown honestly" clause's live-re-read proof, both screens, #223) | green |
| REQ-006 | Given a guest `userId` with a persisted profile and/or tax-year data, when that guest completes sign-up (email/password or social) from the same session, then all guest-owned data migrates to the new account identity in a single atomic operation (no duplicate rows, no orphaned data, no partial state visible mid-flight), the guest session is invalidated, and the user continues under the new identity with everything intact; no identity verification is required at this step (that stays gated to real ELSTER submission, ADR-027(a)). *Traces to: product ADR-027; engineering ADR-0007 Consequences ("guest→account upgrade must migrate anonymous data atomically").* | `apps/api/test/acceptance/req-006-guest-upgrade.test.ts` | green |
| REQ-007 | Given a signed-in account holder, when they opt in from account/security settings, then they can register a TOTP authenticator (confirm one generated code) and/or a WebAuthn passkey; once at least one second factor is registered, a later login prompts for it after the primary factor succeeds; a factor can be removed after re-authenticating. 2FA/passkeys are opt-in, not mandatory, for 1.0. *Traces to: the 2026-07-23 stakeholder auth decision; supersedes product ADR-027(b)'s "keine 2FA in 1.0" clause on this point — see Notes above (ADR amendment pending, not made by this register).* | _tbd_ | not started |
| REQ-008 | **Google:** given a visitor taps "Weiter mit Google", when they complete Google's OAuth flow, then they land signed in (new or existing account), with REQ-006's upgrade atomicity if they arrived as a guest. **Apple:** given the Apple integration is code-complete and feature-flagged off, when no Apple Developer account and no shipped iOS build exist yet, then "Weiter mit Apple" stays hidden/disabled in production; the flag flips on once both preconditions are met, and no later than the first iOS build shipping Google login (App Store rule: Google on iOS obligates Sign in with Apple). *Traces to: engineering ADR-0007 methods (Google/Apple via social login); product ADR-027(a).* | `apps/api/test/req-008-google-login.test.ts`, `apps/api/test/auth-capabilities.http.test.ts` | green (Google) · Apple unbuilt |
| REQ-009 | Given a user signs in on web, when the session is issued, then the token is set as an `httpOnly`, `Secure`, `SameSite=None` cookie (ADR-0011 §Interaction and ADR-0012 §3 explicitly supersede the original `SameSite=strict` wording, compensated by ADR-0011's fail-closed CORS origin allowlist and ADR-0012 §5's origin-based CSRF check; see Status accuracy), unreadable by client JS, backed by a server-side, revocable DB session; given the same user signs in via Expo/React-Native, when the session is issued, then the token is written only to `SecureStore`, never `AsyncStorage`; in both cases, server-side revocation invalidates the client's stored token on its next use. *Traces to: the 2026-07-23 stakeholder decision (session model); engineering ADR-0007 (sessions/tokens — DB-session model replaces the Keycloak-refresh-token wording).* | `apps/api/test/acceptance/req-009-session-model.test.ts` | green (web) · Expo half unbuilt |
| REQ-010 | Given repeated failed logins from the same account/origin, when a configured threshold is exceeded, then further attempts are rate-limited rather than unbounded — **holds only as long as the caller's IP matches the real socket peer.** The limiter keys on `${ip}\|${path}` (better-auth's `createRateLimitKey`), and `getIp()` returns a **single-value** `X-Forwarded-For` verbatim regardless of `advanced.ipAddress.trustedProxies`: whoever sends a new value per request gets a new bucket per request (**A1 — documented, not fixed; the test is green *because* the bypass exists**). `trustedProxies` closes the **multi-hop** form (A2/A3); the single-value form is closed only by a network property — the app being unreachable except through the real proxy — which does not yet exist ([#292](https://github.com/NexusHero/Steuereule/issues/292), successor to the closed #246: still no deployment pipeline, and consequently no production `TRUSTED_PROXIES` value either); given a state-changing request to an auth endpoint, when it lacks a valid CSRF token/origin check, then it is rejected; given any API response, when inspected, then it carries `helmet`-set security headers and a CSP disallowing inline/unsafe script; given a new password at signup/change, when it matches a known-breached-password list, then it is rejected with a clear message before acceptance. *Traces to: engineering ADR-0007's "Security hardening" section; the 2026-07-23 decision list.* | `apps/api/test/acceptance/req-010-security-hardening.test.ts` (rate-limit clause: proves IP-keyed counting, not failed logins — #248), `apps/api/test/breach-check.test.ts`, `apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts` (real Postgres; @documents-defect #292 — A1), `apps/api/test/trusted-proxies.test.ts` (unit), `apps/api/test/acceptance/auth-mount-cors.test.ts` (real Postgres), `apps/api/test/acceptance/req-005-email-signup.test.ts:112-175` (breach-check clause, proven at acceptance tier against the real server: the HIBP call is stubbed and its hit count asserted, and the rejection asserts the exact `PASSWORD_COMPROMISED` code) | green (acceptance): CSRF, Header/CSP, Breach · **not met (rate limiting)** — A1 is green *as evidence of the bypass* |
| REQ-011 | Given a signed-in account holder, when they request an export from account/privacy settings, then they receive a complete, machine-readable export of their tax data, profile, and their own audit log (REQ-004), satisfying Art. 15/20; given the same user requests full account deletion, when they confirm after being shown the mandatory export offer and the "you lose your Finanzamt evidence" warning (ADR-011), then all their data (including encrypted fields, REQ-003) is irrecoverably deleted server-side (Art. 17), except data under active Löschschutz for already-submitted filings (ADR-011), which requires the full-account-deletion path rather than a partial delete. No account holding real (non-synthetic) personal data may go live before this REQ is Done. *Traces to: product ADR-011 (Löschschutz); ADR-020 (server-side deletion + export step); DSGVO Art. 15/17/20.* | `apps/api/test/acceptance/req-011-export.test.ts`, `apps/api/test/acceptance/req-011-export-delete.test.ts`, `apps/mobile-web/src/screens/DatenschutzScreen.test.tsx`, `e2e/cross-origin/run.mjs`, `apps/api/test/openapi-contract.test.ts:109-221` | green (API + UI + real-browser) |
| REQ-012 | Given a brand-new guest, when Onboarding mounts, then `GET /v1/profile` prefills the honest all-null empty state (never mock data), and completing the flow persists through `PUT /v1/profile`. | `apps/mobile-web/src/screens/onboarding/req-012-onboarding-vertical-join.test.tsx` — proves the vertical join; its `localStorage`/`sessionStorage` assertion now runs through `assertNoStorageWrites()`/`stubStorageSetItem()` (#329, merged `66a481b`), which the jsdom `Storage` Proxy cannot defeat — but that guard itself carries three open defects (Musti's retroactive T1 review of #329, not yet fixed on `main` or in any open PR), the sharpest being that it cannot detect its own disconnection | green — vertical-join clause proven; the "never written to localStorage/AsyncStorage/any client-side store" clause is proven by a **real but currently-defective** guard, and independently holds by static absence (zero call sites, measured 2026-08-10); a real-browser gate (#331) exists but is refuted (8 findings), not cited |
| REQ-013 | Given a stored profile, when the user opens Profil, then the live `GET /v1/profile` values render (honest loading/empty/error), edits save through `PUT`, and nothing sensitive is written to client storage (ADR-0008). | `apps/mobile-web/src/screens/ProfilScreen.test.tsx` — proves the `GET`/`PUT` view-and-edit round trip; its `localStorage`/`sessionStorage` assertion now runs through the same `assertNoStorageWrites()`/`stubStorageSetItem()` guard (#329, merged `66a481b`), the jsdom `Storage` Proxy cannot defeat it — but that guard itself carries three open defects (Musti's retroactive T1 review of #329, not yet fixed on `main` or in any open PR), the sharpest being that it cannot detect its own disconnection | green — view/edit clause proven; the "nothing sensitive is written to client storage (ADR-0008)" clause is proven by a **real but currently-defective** guard, and independently holds by static absence (zero call sites, measured 2026-08-10); a real-browser gate (#331) exists but is refuted (8 findings), not cited |
| REQ-014 | Given a phone with an existing valid session opens a device-authorization verification URL, when it matches the request's actual `user_code`/browser/OS/region/time against a static "never approve a code sent to you" warning, then approving is a single tap that grants one desktop session with one fixed lifetime — Decision 5's session-only/trusted-device split was revoked mid-slice (#238), so there is no scope choice — individually listed and revocable from Profil. *Traces to: engineering ADR-0024 (device-authorization surface: our `/v1/device/*` endpoints in front of the plugin) and ADR-0023 (routing).* | `apps/api/test/acceptance/req-014-device-code.integration.test.ts` (task 0 — migration + plugin registration + `POST /v1/device/code`, real Postgres); `apps/api/test/acceptance/req-014-device-approve-token.integration.test.ts` (task 2 — `/v1/device/{pending,approve,token}` round trip against the real server: AC-3 match-verification payload is the real request's own browser/region/time, AC-5 a QR-authorized session is real and individually revocable, plugin's own approve/token routes stay unreachable, pending rate limiter fires, real Postgres); `apps/api/test/acceptance/req-014-device-list-session-freshness.test.ts` (regression — real cross-origin repro of a stakeholder report: `list-sessions` 403'd `SESSION_NOT_FRESH` on a session older than better-auth's own 24h `freshAge` default, even though it was still well inside its 7-day `expiresIn` and `GET /v1/profile`/`get-session` both kept working — the "listed" clause silently broke for any returning user; fixed by `session.freshAge: 0` in `apps/api/src/auth/better-auth.ts`, real Postgres — proves the mechanism, not that it caused the stakeholder's original report: that turns on whether a session row ≥24h old existed on his machine at screenshot time, unanswered as of #299) | green (acceptance) — merged to `main` (#239) |
| REQ-015 | Given a signed-in, verified account holder with no interview answers for tax year 2026, when they open the Minimal-Gate and answer "Woher kam dein Geld 2026?" with "Angestellt", then "Gearbeitet im Ausland?" with "Nein", then "Hast du Kinder?", then each answer is persisted server-side against their own `userId` and tax year — **never** in browser storage — the next screen is exactly the step the question graph names for that answer path, and the Cockpit's open-items count falls to the number of remaining steps; and when question 1 is answered "Selbstständig", then the next screen is the Gewerbe-Gate; and when question 2 is answered "In ein anderes Land", then the next screen is the CH-only-Gate; and a request to persist an answer unreachable on that path is rejected **by the server** and not stored. *Traces to: engineering ADR-0031 (the three-question set for Segment 1 — precises product ADR-016, does not overturn it), ADR-0008 (field-encryption at rest, no client-side storage), ADR-0021 (a gate proven only client-side is not a control), ADR-0004 (the deterministic question graph is pure I/O-free logic living in `packages/core`); product ADR-016 (the Minimal-Gate itself, authoritative), ADR-028 (Gewerbe-Gate wording/pattern), ADR-029 (CH-only-Gate wording/pattern), ADR-034 (Rente is an answer value on `job`, not a branch/gate).* | `packages/core/src/interview.test.ts` (P1, pure graph); `apps/api/test/acceptance/req-015-minimal-gate.test.ts` (real Postgres, real socket — GWT walk-through + P2/P3/P4/P5/P6 + audit trail, 19 tests); `apps/api/test/interview.service.test.ts` (unit, 15 tests); `apps/api/test/requires-account.guard.test.ts` (unit, the P3 seam); `apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx` (33 tests, up from 23 — #318 task 2 added the real GET/POST wiring: loading, load-error+retry, re-entry seeding, the 400/409 resync path, a network-failure revert, and the Cockpit query-invalidation side effect); `apps/mobile-web/App.test.tsx` (new — the GWT's closing clause, Cockpit CTA → Minimal-Gate → three answers → Cockpit open-items count drops, walked through the real app shell/router, jsdom + mocked MSW transport, CI-gated); `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx` (17 tests, incl. the "Fragen beantworten" CTA reaching the Minimal-Gate); `packages/ui/src/components/Option.test.tsx` (ported DS component); `apps/api/test/openapi-contract.test.ts:93-140` (`describe('OpenAPI contract for /v1/steuerjahre/{jahr}/interview (#318, REQ-015)')` — OpenAPI schema/path documentation for both endpoints and their four DTOs, document-shape only) | green (unit + acceptance) on the API/graph half; green (CI-gated, jsdom + mocked MSW transport) on the frontend/App-shell join — the GWT's closing clause (the Cockpit's open-items count falls) is proven by `apps/mobile-web/App.test.tsx`'s new integration test walking the real app shell end to end, not merely by `core`-only rendering as before task 2; a one-off manual real-Chromium/real-API run corroborates the same clause but is not committed as a gate. `Done` |
