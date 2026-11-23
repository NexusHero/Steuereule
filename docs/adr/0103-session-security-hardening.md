# ADR-0103 — Session-security hardening: `/v1` CSRF, an absolute session cap, token rotation, stronger registration defaults

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** engineering; proven by breaking each control (ADR-0021).
- **Builds on** [ADR-0009](0009-better-auth-as-auth-server.md) (better-auth is the auth server),
  [ADR-0011](0011-cors-credentialed-cross-origin.md) (the session cookie is `SameSite=None; Secure`
  because the web app is genuinely cross-site), [ADR-0012](0012-session-guard-coexistence-and-guest-upgrade.md)
  (the `UserContextGuard` seam, the one shared `trustedOrigins` allowlist, and §5's note that `SameSite=None`
  removes the cookie's own CSRF defence), [ADR-0027](0027-session-freshness-gate-disabled.md)
  (`session.freshAge` stays 0 — the device list depends on it), and
  [ADR-0052](0052-agenten-zugang-mcp.md) (the MCP/OAuth bearer path, which carries no ambient cookie).
- **Context tags:** security, auth
- **Component:** `apps/api` · better-auth 1.7.15

## Context

An audit of `apps/api/src/auth` against better-auth 1.7.15 found four session-security gaps. Each was
confirmed against the installed `better-auth` dist before a line was changed, and each fix is pinned by a
test that fails against the attack and passes with the fix (ADR-0021).

### Vulnerability 1 — no CSRF protection on the app's own `/v1` routes

The session cookie is `SameSite=None` so the web app works cross-site (ADR-0011). better-auth's own origin
check (`advanced.disableOriginCheck: false`) runs only inside its mounted handler, which serves `/api/auth/*`
(`mount-better-auth.ts`); the NestJS `/v1` controllers sat behind `UserContextGuard`, which establishes a
`userId` but never checked the request's origin. CORS does not close this: it stops a foreign page from
*reading* a response, not from *sending* a credentialed request. A plain cross-site form POST — for example
`multipart/form-data` to `POST /v1/belege/upload` — would arrive with the victim's session cookie attached.

ADR-0012 §5 named "origin-based CSRF via `trustedOrigins`" as the primary defence given `SameSite=None`, but
that control only ever covered better-auth's own routes; the app's routes had no equivalent. This ADR closes
that gap, not a regression.

### Vulnerability 2 — unbounded session lifetime

`session.expiresIn` defaults to 604800s/7 days (`context/create-context.mjs:148`) and is slid forward on use
every `updateAge` (86400s/1 day, `:147`): `getSession` rewrites `expiresAt` to `now + expiresIn` while
keeping the row's `createdAt` (`api/routes/session.mjs:179-200`, `db/internal-adapter.mjs` `updateSession`).
There is no absolute maximum age, so an actively-used session — including a stolen cookie in active use —
renews indefinitely.

### Vulnerability 3 — the session token is never rotated

`getSession`'s slide extends `expiresAt` but does not mint a new token. better-auth's `/change-password`
(`api/routes/update-user.mjs`) rotates the current token and revokes the account's other sessions **only when
the caller passes `revokeOtherSessions: true`**; its default (`false`/absent) updates the password hash and
does neither — the current token stays valid and every other session stays live. The API cannot rely on the
web client to send the flag.

(The guest→account upgrade is *not* a gap: sign-in/sign-up always creates a brand-new better-auth session
(`api/routes/sign-in.mjs`, `sign-up.mjs` `createSession`), and the guest identity is a separate HMAC cookie
retired by the upgrade hook (`guest-account-upgrade.prisma.ts`) — there is no stale token to rotate there.)

### Vulnerability 4 — weak registration defaults

`emailAndPassword.minPasswordLength` was 8, and `requireEmailVerification` was `false`. Flipping verification
on is not safe here: guest-first onboarding relies on an account being usable immediately after sign-up
(ADR-0012 `autoSignIn`), and ADR-0030 sweeps accounts that are *never* verified — both presuppose that
unverified accounts exist and work.

## Decision

### 1. Origin-based CSRF guard on every `/v1` route (`OriginCsrfGuard`)

A global Nest guard (`auth/origin-csrf.guard.ts`, registered as `APP_GUARD` in `AuthModule`). On a
state-changing request (POST/PUT/PATCH/DELETE) it requires, **when an `Origin` header is present**, that the
origin be one of the configured `trustedOrigins`:

- **Bearer-authenticated requests are exempt** — the MCP/OAuth path (ADR-0052) carries no ambient cookie and
  cannot be driven by a cross-site page.
- **A request with no `Origin` header is allowed** — a browser attaches `Origin` to every cross-site
  state-changing request (fetch/XHR and modern form POSTs alike), so its absence means a non-browser client:
  a native app (whose token is read from SecureStore, ADR-0012 §3) or server-to-server. This matches
  better-auth's own origin check and keeps the device/QR flow and the native app working.

The allowlist is the **same** set better-auth is given — the CORS origins plus the web-app origin — computed
once by `auth/trusted-origins.ts` (`mergeTrustedOrigins`) and used in both places, honouring ADR-0012 §5's
"one allowlist, no second drifting copy" rule.

`Sec-Fetch-Site` is deliberately not the decision signal: the deployment is genuinely cross-site (ADR-0011),
so a legitimate web-app call and an attacker's call are *both* `Sec-Fetch-Site: cross-site` — only the Origin
value distinguishes them.

### 2. An absolute session cap, enforced on both session boundaries

better-auth's config cannot express a maximum age independent of the sliding window, so the cap
(**30 days** from `createdAt`, `SESSION_ABSOLUTE_MAX_AGE_MS`) is enforced in two places — because there are
two session readers, and the mounted better-auth handler (`/api/auth/*`, `mount-better-auth.ts`) runs
*outside* `UserContextGuard`:

- **`UserContextGuard`** (the `/v1` routes): a session whose `createdAt` is over the cap is refused like an
  expired one — the guard falls through to the guest path. This is immediate, including for a pre-existing
  session that has not been slid since this shipped.
- **A `databaseHooks.session.update.before` clamp** (`session-absolute-cap.ts`): every expiry slide
  better-auth performs is clamped to `createdAt + cap`. Once a session is past the cap the clamp is a time
  in the past, so better-auth's own `expiresAt < now` check (`session.mjs`) expires and **deletes** the
  session on its next read — on *every* route, better-auth's own endpoints included. This is what forces a
  **stolen, actively-used** cookie to re-authenticate: clamping the server-side `expiresAt` invalidates the
  row for whoever holds the cookie, where merely clearing the legitimate user's cookie would not.
  *Residual:* a slide happens at most once per `updateAge` (1 day), so a session that was already over the
  cap when this shipped keeps working on `/api/auth/*` until its next slide (≤1 day of use) catches it; the
  guard already blocks it on `/v1` immediately, and every session created from here on is clamped before it
  can ever exceed the cap.

The sliding idle window is pinned explicitly at its existing values (`expiresIn` 7 days, `updateAge` 1 day)
so they are reviewed decisions rather than inherited defaults, and **`freshAge` stays 0** (ADR-0027 — the
device list depends on it; this ADR does not touch that).

30 days balances the "stay signed in" expectation of a consumer tax app against bounding a stolen
`SameSite=None` cookie's lifetime: well beyond the 7-day idle window, so an ordinary active user is never cut
off mid-session, yet a hard ceiling where before there was none.

### 3. Rotate the token and revoke siblings on every password change

A matcher in better-auth's `hooks.before` forces `revokeOtherSessions: true` onto the `/change-password`
request body whatever the client sent (`auth/force-session-rotation.ts`). better-auth then performs the full
rotate-and-revoke through its own supported path — a fresh token is issued (the old one dies) and the
account's other sessions are deleted. No bespoke session surgery is added.

### 4. Stronger registration defaults, verification gated at the sensitive action

`minPasswordLength` is raised to **12** (paired with the existing Have I Been Pwned breach check, ADR-0012
§5). `requireEmailVerification` stays **false** so guest-first onboarding and the ADR-0030 sweep keep working;
instead, the most sensitive outward action — filing the return, `POST /v1/steuerjahre/:jahr/abgabe`
(ADR-0098 §8) — now carries `@RequiresVerifiedEmail()`. A signed-in account whose email is unverified is
refused there; a guest is already refused by `@RequiresAccount()`, and a bearer/assistant caller is allowed
through (it acts for an account that completed OAuth consent and cannot verify an email itself, ADR-0052).

## Consequences

- A cross-site POST to a `/v1` route with a victim's cookie is rejected unless its `Origin` is trusted; the
  legitimate cross-origin web app and the native app are unaffected.
- A session cannot outlive 30 days from login however actively it is used; past that, the user re-authenticates.
- Changing a password logs out the account's other devices and invalidates the old token — standard behaviour,
  now enforced server-side rather than left to the client.
- Sign-up still works without a verified email, but filing a return requires one.
- These are additive controls on the existing `UserContextGuard`/better-auth wiring; no controller or service
  changed except the one `@RequiresVerifiedEmail()` on the submission endpoint.

## Alternatives considered

- **Use `Sec-Fetch-Site` instead of the Origin allowlist for CSRF.** Rejected: the web app is legitimately
  cross-site (ADR-0011), so it and an attacker both send `Sec-Fetch-Site: cross-site`; only the Origin value
  separates them.
- **A non-zero `freshAge` as the lifetime bound.** Rejected: `freshAge` is a per-action freshness gate, not a
  session cap, and ADR-0027 disabled it precisely because any finite value re-breaks the device list; the cap
  belongs in the guard, measured from `createdAt`.
- **Require email verification globally (`requireEmailVerification: true`).** Rejected: it breaks guest-first
  onboarding (ADR-0012 `autoSignIn`) and contradicts ADR-0030's sweep of never-verified accounts; gating the
  sensitive action is the honest middle.
- **Rotate the token with bespoke session code in a Nest layer.** Rejected: forcing better-auth's own
  `revokeOtherSessions` flag reuses its tested rotate-and-revoke path instead of duplicating session handling.
