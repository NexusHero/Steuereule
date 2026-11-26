# ADR-0027 — better-auth's session freshness gate is disabled (`session.freshAge: 0`)

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Robin (engineering); reviewed by Musti (lead) — see *Decision history* below, this
  ADR exists because his review found the original justification wrong, not merely under-written.
- **Builds on** [ADR-0009](0009-better-auth-as-auth-server.md) (better-auth is the auth server),
  [ADR-0013](0013-dsgvo-export-and-account-deletion.md) §6 *Trust boundary* (`DELETE /v1/account`'s
  own, independent fresh-auth window), [ADR-0021](0021-controls-are-proven-by-breaking-them.md)
  ("a control is not established until it has been observed to fail" — its actual Decision, not
  restated further; see *Context* below for this ADR's own, separate point about a completeness
  claim), [ADR-0024](0024-qr-device-authorization-endpoints.md) (the precedent this ADR does *not*
  yet follow — see *Alternatives*).
- **Context tags:** security, auth
- **Introduced by:** `steuereule#299` (stakeholder bug report — the device list stayed empty for a
  returning, genuinely signed-in user), REQ-014

## Context

`GET /api/auth/list-sessions` — the real data source behind Profil's "Angemeldete Geräte" device
list (`useDeviceSessions.ts`) — was 403ing `SESSION_NOT_FRESH` for any session older than
better-auth's default `session.freshAge` (86400s/24h, `context/create-context.mjs:148`), even
though the session was otherwise entirely valid (its own `expiresIn` default is 7 days) and every
other endpoint touching it (`GET /v1/profile`, `GET /api/auth/get-session`) kept working. A
returning user — the ordinary case, not an edge case — could never see their own device list again
without a fresh sign-in.

**A claim of completeness must itself be checked, not assumed — this ADR's own point, not a
restatement of ADR-0021's.** ADR-0021 requires a control to be observed to fail; it says nothing
about how a list of a control's *consumers* should be established. The first version of this
decision (see *Decision history*) named "the only other consumer" from memory-adjacent reading of
the source rather than an exhaustive search, and was wrong. The fix applied here is a search, not a
recollection:

**The exhaustive consumer list, measured against the installed dist, not assumed.** `grep -rn
"use: \[freshSessionMiddleware\]" <better-auth>/dist --include=*.mjs` (better-auth 1.6.24) returns
exactly two endpoints:

| Endpoint | Site | What it does |
|---|---|---|
| `GET /list-sessions` | `dist/api/routes/session.mjs:378` | Lists the caller's own active sessions — the bug this ADR's decision fixes. |
| `POST /unlink-account` | `dist/api/routes/account.mjs:229` | Unlinks a social provider (e.g., Google) from the account. |

**A third, adjacent site that reads `session.freshAge` directly is not in that list and does not
matter here.** `POST /delete-user`'s own handler body (`update-user.mjs:329`) checks
`sessionConfig.freshAge` to decide whether a password must be supplied to delete the account
without a fresh session — but the endpoint itself throws `NOT_FOUND` unconditionally
(`update-user.mjs:288`) unless `options.user.deleteUser.enabled` is configured, and this app
configures no `user.deleteUser` key at all (`grep -n 'deleteUser' apps/api/src/auth/
better-auth.ts` → no hits). `/delete-user` is unreachable regardless of `freshAge` — this app's own
`DELETE /v1/account` (REQ-011/ADR-0013 §6) is the real account-deletion path, and it was already
built with its own, independent, much shorter freshness window (`fresh-auth.ts`'s
`ACCOUNT_DELETE_FRESH_WINDOW_MS`, 5 minutes) specifically because 24h is sized for "routine
sensitive-but-reversible actions", not an irreversible one.

**`/change-email` and `/change-password` do not use this gate at all.** Both are gated by
`sensitiveSessionMiddleware` — a plain "the session must be valid" check with no freshness
component (`update-user.mjs:93` (`/change-password`, declared `:75`) / `:406` (`/change-email`,
declared `:400`), confirmed directly against the dist). An earlier draft of
this decision (PR #299's first pushed commit) misattributed `update-user.mjs:329` — the
`/delete-user` branch above — to these two endpoints, and used that wrong citation as the load-
bearing justification for the whole change. Corrected here; the wrong version never merged.

## Decision

`session: { freshAge: 0 }` in `apps/api/src/auth/better-auth.ts`, disabling the freshness check
globally rather than raising it to some other, still-finite value (see *Alternatives* for why a
non-zero value does not actually solve this).

## Consequences

- **`GET /list-sessions` fixed** — a returning user can view their device list for the full life of
  their session (7 days), without re-authenticating.
- **`POST /unlink-account` loses its only protection — accepted, stated explicitly rather than left
  as an unexamined side effect.** Before this change, unlinking a social provider required a
  session established within the last 24h; after, any valid, non-expired session (up to 7 days old)
  can. `apps/mobile-web` calls no such endpoint today (no "disconnect Google" screen exists) — but
  `POST /api/auth/unlink-account` is registered unconditionally and directly reachable through the
  mounted better-auth catch-all regardless of what our own frontend calls, and this app configures
  a real Google provider whenever `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set
  (`better-auth.ts`'s `socialProviders`). **Accepted because:** (a) unlinking a provider is
  reversible — the account itself is not compromised, only a login method is detached, and the
  owner can re-link; (b) it still requires an already-valid session — this removes a *freshness*
  requirement, not authentication itself; (c) a non-zero `freshAge` would not have actually fixed
  the reported bug (see *Alternatives*), so the honest trade is "protect this narrow, reversible,
  currently-unused action" vs. "leave the device list broken for every returning user" — not a free
  win either way. Pinned by a test (`req-014-device-list-session-freshness.test.ts`) asserting
  unlink-account succeeds on an aged session, so a future accidental tightening has something
  concrete to break rather than this being silently re-discovered.
- **`/delete-user` unaffected** — already unreachable regardless of this setting (see *Context*).
- **`/change-email`/`/change-password` unaffected** — neither ever used this gate.

## Re-evaluation triggers

- If a "disconnect this social provider" screen is ever wired into `apps/mobile-web`, revisit: give
  it its own `fresh-auth.ts`-shaped re-verification window (mirroring `DELETE /v1/account`'s
  pattern) rather than continuing to rely on `freshAge: 0`'s blanket removal.
- If `user.deleteUser` is ever configured (switching to better-auth's own `/delete-user` instead of
  this app's bespoke `DELETE /v1/account`), re-check this decision against that endpoint's own
  freshness branch (`update-user.mjs:329`) before assuming it is still moot.

## Alternatives considered

- **Raise `freshAge` to some larger non-zero value instead of 0.** Rejected: any finite value
  reproduces the identical bug shape for a session older than that value — it only lengthens the
  window before the same ticket reopens. better-auth's config has no per-endpoint `freshAge`, so a
  non-zero value cannot protect `/unlink-account` without eventually re-breaking `/list-sessions`
  again at some larger session age.
- **Move the device list off better-auth's own `/list-sessions` onto this app's own
  `/v1/device/*`-shaped seam behind `UserContextGuard`, leaving `freshAge` at its default.** This is
  the architecturally cleaner fix, and matches the precedent ADR-0024 already set for every other
  device-authorization endpoint: our own controller sits in front of the plugin, the browser never
  calls the plugin's HTTP surface directly. It would let `/unlink-account` keep its default
  protection untouched. **Not done here** — it is materially more work (a new repository-backed
  endpoint plus a frontend change, and `apps/mobile-web` is not this PR's territory) than a live
  production bug justifies blocking on. This is the real long-term direction; tracked as its own
  ticket rather than silently becoming "just how it's always been" through this PR's shortcut.
- **A `hooks.before` matcher bypassing just this one endpoint's own declared middleware.**
  better-auth's endpoint-level `use: [...]` chain runs for every invocation path (HTTP router or an
  in-process `auth.api.*` call) — there is no supported seam to skip one specific plugin-owned
  endpoint's own middleware without forking the library. Rejected as unsupported and fragile.

## Decision history

The version of this change first pushed to `steuereule#299` justified `freshAge: 0` by citing
`update-user.mjs:329` as "the `/change-email`/`/change-password` gate" — wrong on both the endpoint
(it is `/delete-user`) and the claim (neither `/change-email` nor `/change-password` uses this gate
at all), and its "nothing here loses protection it actually had" omitted `/unlink-account`
entirely. Musti's review caught both; this ADR is the corrected record — not a comment in
`better-auth.ts` that the next reader would only find by already being in that file.

## Amendment (#303) — the better-auth routes the product calls, and the gate that visits each

The ADR's own point is that a completeness claim must be searched, not recalled. #303 asked the same question of
the *gates*: which better-auth routes does the product depend on, and does any gate visit them? The list below comes
from `grep -rnE "authClient\.|client\.(\$fetch|passkey|signIn)|/api/auth/" apps/mobile-web/src` (tests excluded).
"Gate" means a script that sends the request to the real booted stack, as the app does; a route that a gate only
intercepts with `page.route` to simulate a failure is marked *intercepted only*.

| Route (client call) | Caller in `apps/mobile-web/src` | Gate that sends it to the real stack |
|---|---|---|
| `POST /sign-up/email` (`signUp.email`) | `screens/RegistrationScreen.tsx` | `e2e/cross-origin/run.mjs` and many flow gates |
| `POST /sign-in/email` (`signIn.email`) | `screens/LoginScreen.tsx` | `e2e/cross-origin/run.mjs` and many flow gates |
| `POST /sign-out` (`signOut`) | `screens/profile/SignOutSection.tsx` | `e2e/cross-origin/run.mjs` |
| `GET /get-session` (`useSession`) | `auth/useAccountSession.ts` | `e2e/cross-origin/run.mjs`, `e2e/session/return-visit.mjs`, `e2e/visibility/visibility-refetch.mjs` |
| `GET /list-sessions` (`listSessions`) | `screens/device/useDeviceSessions.ts` | `e2e/device/device-authorization.mjs` (a cross-origin request carrying the web `Origin`; asserts the session list and its fields) and `e2e/account/beta-account-states.mjs` |
| `POST /revoke-session` (`revokeSession`) | `screens/device/useDeviceSessions.ts` | `e2e/account/account-security.mjs` |
| `POST /request-password-reset`, `POST /reset-password` | `screens/login/ForgotPasswordForm.tsx`, `screens/PasswordResetScreen.tsx` | `e2e/account/account-security.mjs` |
| `POST /two-factor/enable`, `/verify-totp`, `/verify-backup-code`, `/disable` | `auth/useTwoFactor.ts` | `e2e/account/account-security.mjs` |
| `POST /sign-in/social` (`signIn.social`) | `auth/useSocialSignIn.ts` | `e2e/account/beta-account-states.mjs` (Google host intercepted); `e2e/google-auth/google-login.mjs` is in no CI job yet (`docs/process/script-inventory.md`) |
| `POST /verify-password` | `auth/useStepUp.ts`, `screens/oauth/OauthConsentScreen.tsx` | `e2e/account/beta-account-states.mjs`, `e2e/harness/api-account.mjs` |
| `/passkey/*` (`passkey.addPasskey`, `/passkey/delete-passkey`, `signIn.passkey`, list) | `auth/usePasskey.ts`, `auth/StepUpOptions.tsx` | `e2e/account/beta-account-states.mjs` for the list route is *intercepted only* (failure and retry); the register and authenticate ceremonies need a WebAuthn authenticator and have **no gate** |
| `POST /send-verification-email` | `screens/shared/EmailVerificationBanner.tsx` | **none** |
| `GET /list-accounts` | `auth/StepUpOptions.tsx` | **none** |
| `POST /oauth2/consent` | `screens/oauth/OauthConsentScreen.tsx` | **none** |

Gaps named, not fixed here: `send-verification-email`, `list-accounts`, `oauth2/consent` and the passkey
ceremonies. Per the exhaustive search above only `/list-sessions` and `/unlink-account` sit behind the freshness
middleware; the product calls the first and not the second, so the freshness class itself is covered by the
`list-sessions` row. The gaps above are other better-auth routes with their own middleware, which is #303's general
point.

**Not yet proven (to be done in CI):** the mutant proof #303 asks for. The gate must go red when `session.freshAge`
is restored to better-auth's default and the session is aged past it. `device-authorization.mjs` asserts a real
session list, but no run has yet shown it failing under that mutant, and by ADR-0021 the check does not count until
it has. The run is a CI change on a throwaway branch (set `freshAge` back, age the `Session.createdAt`/`updatedAt` row
past 24h before the call, expect red), not something this amendment claims.


### Follow-up to the amendment (2026-11-26) — the named gaps, closed by reading and extending the gates

The table above is left as written; this paragraph corrects it. Reading `beta-account-states.mjs` and
`account-security.mjs` again showed that two of the four "gaps" were walked already and only not asserted on the
route itself. Every new assertion below is on what the booted stack answered; none intercepts the route under test.
None of it has run in CI at the time of writing (it was written without a local stack, see the CI runs of the PR
that carries it).

| Route | Gate and assertion |
|---|---|
| `POST /send-verification-email` | `e2e/prod-deploy/run.mjs` clicks "Mail erneut senden" on the registration's success step (the caller, `EmailVerificationBanner`), asserts the 200 `{ status: true }` and that a second verification mail with the verify link reaches the compose stack's Mailpit. It is the only gate stack with an inbox; the other CI stacks log the mail. |
| `GET /list-accounts` | `e2e/account/beta-account-states.mjs` Row D: the Sicherheit screen (`ChangePasswordSection`) reads it; the answer is a 200 listing the `credential` account. |
| `POST /oauth2/consent` | `e2e/account/account-security.mjs` Row D already walked authorize, consent and code; it now asserts the consent answers: 200 with the `access_denied` redirect for "Ablehnen", 200 with the redirect carrying the code the client exchanges for "Erlauben". |
| passkey ceremonies | `beta-account-states.mjs` Row D already ran register and authenticate through Chromium's virtual authenticator (CDP `WebAuthn`). The relying-party id is the host of `BETTER_AUTH_URL` and the origin is the web origin, both `localhost` in the gate stacks, which WebAuthn accepts over http. It now asserts the answers of `generate-register-options`, `verify-registration`, `list-user-passkeys` (a real 200 holding the passkey), `generate-authenticate-options`, `verify-authentication`, and `delete-passkey` (403 `FRESH_AUTH_REQUIRED` on the older session, then 200). |

The control proof is now a permanent test instead of a throwaway branch:
`apps/api/test/acceptance/adr-0027-fresh-age-control.test.ts`, which runs in the CI job "correctness: integration
(postgres)". It signs a real account up, ages the session row past 24 hours, and calls `/list-sessions` on two
instances over the same database and secret: the product's (`freshAge: 0`), which lists, and one built from the
product's own options (`buildOptions`, exported for this test) with `session.freshAge` removed, which refuses with 403
`SESSION_NOT_FRESH`. A control shows the second instance serves a session that is not aged. Still open: the browser
gate `device-authorization.mjs` has not itself been run under the mutant; the acceptance test pins the mechanism it
relies on, not that gate's reaction to it.
