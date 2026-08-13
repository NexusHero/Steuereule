# ADR-0035 — Stamp the socket peer into a self-owned header; fix IP resolution, not the limiter

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Musti (lead, technical design ruling — §C of #350's refinement block), Stakeholder
  (NexusHero — the rate-limit ceiling numbers, #350's addendum comment); implemented by Robin.
- **Builds on** [ADR-0007](0007-authentication.md) (identity is server-established — this extends
  that instinct to the caller's own address),
  [ADR-0012](0012-session-guard-coexistence-and-guest-upgrade.md) §5 (the DB-backed `RateLimit` table
  this seam does not replace), [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (a control is
  proven by breaking it — the whole proof shape below), and #241's own `trusted-proxies.ts` (the
  `resolveTrustedProxies()` resolver this ADR reuses unchanged, wiring it into a second consumer).
  Complements #339's account-keyed limiter (ADR-0035's own predecessor number was reassigned when
  that PR's branch had not yet merged; see the *Relationship to #339* note under Consequences) —
  not a replacement for it.
- **Context tags:** security, auth
- **Introduced by:** `steuereule#350` (REQ-010's rate-limiting clause, the register's only outright
  *not met* line)

## Context

better-auth's own rate limiter (`api/rate-limiter/index.mjs`) is correct: it keys on
`${resolvedIp}|${path}`, backed by the same DB-backed conditional-UPDATE shape this app already
reuses elsewhere (`db-rate-limit.ts`). What is broken is the ONE function every consumer of "who is
calling" shares — `getIp()` (`@better-auth/core/utils/ip`) — read in full:

```js
const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS // ['x-forwarded-for']
for (const key of ipHeaders) { ... if (ip) return ip }
if (isTest() || isDevelopment()) return LOCALHOST_IP
return null
```

It reads **request headers only** and never the socket. With `TRUSTED_PROXIES` unset/`none` (today's
actual posture — no deployment exists yet, #292), a single-value `X-Forwarded-For` is trusted
verbatim; a caller who sends a fresh, rotating value on every request gets a fresh, unaccumulated
rate-limit bucket every time — measured directly:
`apps/api/test/acceptance/trusted-proxies-ip-resolution.test.ts`'s old A1 case produced a
byte-identical `[401,401,401,401,401,401]` whether the limiter was configured correctly or deleted
outright, because a spoofable global fallback answers a real per-caller attacker identically to no
control at all.

**No `TRUSTED_PROXIES` value repairs this**, because `getIp()` never consults the one thing that is
actually trustworthy: Fastify's `request.ip`. `main.ts` constructs `new FastifyAdapter()` with no
`trustProxy` option, so `request.ip` already **is** the real socket peer today — the repo already
relies on this fact once, for `DeviceCode.requestRegion` (`device.controller.ts`). Fixing IP
*resolution* therefore fixes every consumer of `getIp()` at once — the built-in rate limiter AND
`Session.ipAddress` — not just one.

## Decision

**(a) Stamp the socket peer into a self-owned header, and point `ipAddressHeaders` at it exclusively.**
Rejected alternative: **(b)** own the IP dimension in-house, a second `db-rate-limit.ts`-shaped
limiter in front of the auth routes with better-auth's own limiter disabled there — see
*Alternatives*.

### The mechanism

1. `apps/api/src/auth/client-address.ts` — a **pure** function,
   `resolveClientAddress(peer, headers, policy) -> string | null`, framework-free and directly
   unit-tested for every branch:
   - `policy.trustedProxies` empty (`TRUSTED_PROXIES` unset/`none`, today's posture): returns `peer`
     alone. **Overwrites, never appends** — nothing inbound is read on this branch at all, so a
     caller sending `x-forwarded-for` or even our own header name cannot influence the result. This
     is the non-forgeability property, and it holds by construction, not by validating input.
   - `policy.trustedProxies` non-empty (a real deployment's proxy CIDR, once #277/#292 exist):
     **appends** `peer` to whatever `X-Forwarded-For` chain was received, so better-auth's own
     `getIPFromHeader` — not reimplemented here — keeps peeling trusted hops from the right exactly
     as it does today. This is where `TRUSTED_PROXIES` lands once a real proxy exists (the exact
     seam the stakeholder's addendum asked for).
   - No peer at all (defensive only): returns `null`; the caller removes any stale header rather than
     writing one that lies.
2. `apps/api/src/auth/stamp-client-address.ts` — the thin Fastify `onRequest` hook. Calls the pure
   function and writes the result to **`request.raw.headers`**, then `mount-better-auth.ts` registers
   it in the same child plugin scope the better-auth catch-all is mounted in, *before* that route.
3. `better-auth.ts`: `advanced.ipAddress.ipAddressHeaders: [CLIENT_ADDRESS_HEADER]` — this **replaces**
   better-auth's own default (`['x-forwarded-for']`), so `x-forwarded-for` is never read by
   better-auth again, under any configuration. `trustedProxies` stays wired exactly as #241 left it.

### The trap this decision explicitly avoids

Fastify 5's `request.headers` is an accessor whose **setter** stores into a Fastify-side overlay,
`this.additionalHeaders` (`fastify@5.10.0/lib/request.js:276-285`) — merged back in by the **getter**,
but never written to `request.raw`. `mount-better-auth.ts:56` hands better-auth **`request.raw`**
directly (`toNodeHandler(auth)(request.raw, reply.raw)`). A stamp written via
`request.headers[...] = value` would therefore be **invisible to better-auth** while still passing
any test that only ever reads back through `request.headers` — declared, not connected, ADR-0021's
exact failure shape. `stamp-client-address.ts` writes `request.raw.headers` directly, and reads the
inbound chain from `request.raw.headers` too, so there is no path through this file where "looks
stamped" and "is stamped" can diverge. `test/stamp-client-address.test.ts` includes a permanent
control-proof of this specific trap (`registerClientAddressStamp — control: writing via
request.headers (the wrong way) would NOT reach request.raw.headers`).

### Why (a) over (b)

Fixing resolution fixes the limiter **and** `Session.ipAddress` **and** anything that reads `getIp()`
later, from one place. (b) fixes one consumer, leaves `Session.ipAddress` broken, and reimplements a
working limiter — including a second, hand-maintained copy of better-auth's own per-path rule table
(`getDefaultSpecialRules()`), which drifts the moment either copy changes. That reinvention is exactly
what this crew's craft standard sends back (see this ADR's own author's operating principle: reach
for the existing seam, justify a new one).

## Consequences

- **`Session.ipAddress`, and every path better-auth's built-in limiter protects, are now keyed on the
  real caller — proven by breaking it, not by watching it pass** (ADR-0021). Three separate breaks,
  each restored and re-verified green afterward:
  - **Existence** — the stamp registration call
    (`registerClientAddressStamp(authScope, clientAddressPolicy)`) deleted entirely: the resolved key
    reverted to a single literal shared across every caller
    (`127.0.0.1|/sign-in/email` — this test harness's own `NODE_ENV=test`-driven localhost fallback in
    `getIp()`, the sibling of production's `no-trusted-ip` fallback; both are the same "one shared
    bucket" shape), and an unrelated second real peer's very first attempt came back `429` instead of
    succeeding.
  - **Forgeability (validity)** — `resolveClientAddress`'s no-trusted-proxy branch changed to trust an
    inbound value under our own header name instead of overwriting: an attacker sending
    `x-steuereule-client-address: 203.0.113.9` got exactly that value back as their `RateLimit.key`
    (`203.0.113.9|/sign-in/email`), fully attacker-chosen.
  - Both reverted; `test/client-address.test.ts`, `test/stamp-client-address.test.ts`, and
    `test/acceptance/trusted-proxies-ip-resolution.test.ts` re-ran green immediately after each
    restore.
- **`trusted-proxies-ip-resolution.test.ts` is rewritten, not merely re-passed.** Its old A1 case
  documented the single-value-`X-Forwarded-For` bypass as *permanently unfixed*, gated on #292's
  still-missing deployment (`@documents-defect #292`). That specific gap is now closed **in code**,
  independent of #292/#277 — the marker is dropped (register-check's check 5 would otherwise assert an
  open issue against a now-closed gap) and the file's two describe blocks are rewritten to prove the
  fix with a **genuine second loopback peer** (`test/support/raw-request.ts`'s `localAddress` option
  — real TCP source addresses, not a header value standing in for one), matching the actual anchor
  this seam trusts. What #292/#277 still gate is unchanged: whether a real deployment exists to
  configure a real `TRUSTED_PROXIES` CIDR value, and the residual "attacker bypasses the real proxy
  and connects directly" case once a real range is configured (see `client-address.ts`'s own header
  comment) — a network property, not something any header-based resolver can close by itself.
- **`req-010-security-hardening.test.ts`'s "same account" test was misleadingly named.** better-auth's
  built-in limiter has no account dimension at all — it would trip identically against twelve
  different accounts from one caller. The existing test is renamed to say what it actually proves
  (caller+path, not account identity) and now asserts the literal key; a new sibling test makes the
  twelve-different-accounts case explicit rather than leaving it as an untested blind spot.
- **`useDeviceSessions.ts` / `DeviceListSection.tsx` / `i18n/resources.ts`'s device-list comments
  updated, not their behaviour.** They asserted "the only deployment-config candidate for a
  trustworthy client IP still returns a spoofable address" as the reason no region is shown. That
  premise is **partly** retired: `Session.ipAddress` is trustworthy now. The region still does not
  appear, for an unrelated reason that was always true independently — there is no `Session.region`
  column to derive one from. Whether to add that column is a product decision for #351, out of this
  ticket's scope; only the comment's stated reasoning changes here, not the shipped list.
- **Relationship to #339 / the account-keyed limiter.** Complementary, not overlapping: this seam
  makes the *IP* dimension honest; #339 (`login-rate-limit.ts`, not yet on `main` as this ADR lands)
  covers an attacker who rotates addresses deliberately. Once both land, sign-in carries two
  independent limiters — IP-keyed (this ADR) and account-keyed (#339). Do not merge them into one.
- **`/verify-password` and `/device` are pinned at their current numbers, but not unaffected.** Their
  thresholds do not change (see §D of #350's refinement — `/verify-password` guards ADR-0013 §6's
  fresh-auth step before account deletion; `/device` is ADR-0024's guessable 40-bit code; neither
  question was put to the stakeholder, and both are destructive/security-sensitive enough that a
  sign-in convenience decision should not silently move them). But the seam changes their behaviour
  regardless of the pinned number: today both are shared-bucket ceilings; after this lands, both are
  per-client. In aggregate that permits strictly more requests across the whole caller population —
  and it is nonetheless the correct control, because a per-client 3 (or 10) is what each guard was
  always meant to be; a shared bucket was never protecting the account or the code, only throttling
  the product as a whole. Stated here so it is argued, not merely left to be noticed.
- **`device-pending-rate-limit.ts` is deliberately untouched.** It already keys on `request.ip`
  directly — the real socket peer, already per-client — and is not rerouted through this seam. Doing
  so "for consistency" would be a double-stamp for no benefit.
- **IPv6 callers are rate-limited per-/64, not per-address** — `getIPFromHeader`'s own
  `ipv6Subnet ?? 64` normalisation, unchanged by this seam. Usually the right unit (one household);
  recorded here, not fought.

## Re-evaluation triggers

- When #292's real deployment exists and #277 supplies a real `TRUSTED_PROXIES` CIDR value: revisit
  whether the residual "attacker bypasses the proxy, connects directly" gap (see `client-address.ts`)
  is actually closed by the deployment's own network topology (the app unreachable except through the
  real proxy) — that property, not this resolver, is what closes it.
- If a consumer other than better-auth ever needs the resolved client address (#351, the device-list
  region, is the first candidate), reconsider whether `registerClientAddressStamp`'s scope should
  widen from the better-auth mount's child plugin context to the whole app — not assumed here.

## Alternatives considered

- **(b) An in-house limiter in front of the auth routes, better-auth's own disabled there.** Rejected
  — see *Context*/*Decision*: fixes one consumer, leaves `Session.ipAddress` broken, reimplements and
  duplicates better-auth's own per-path rule table (drift risk), and is strictly more code for a
  narrower fix.
- **A global `onRequest` hook stamping every route, not scoped to the better-auth mount.** Rejected for
  now: nothing outside the better-auth mount reads `CLIENT_ADDRESS_HEADER` today, so a global hook
  would be a wider footprint than anything currently consumes. Revisit if/when #351 needs it (see
  *Re-evaluation triggers*).
- **A production-reachable test override letting a caller declare its own address.** Rejected outright
  — that backdoor is exactly the defect this ADR closes; distinct real loopback peers
  (`127.0.0.1`/`127.0.0.2`/…) are sufficient to prove the seam end to end without one.
