# ADR-0035 — An account-keyed sign-in rate limiter closes REQ-010's IP-spoofable gap, and leaves one trade-off open

- **Status:** Accepted (mechanism) · **the residual named in Consequences is OPEN, pending stakeholder ruling**
- **Date:** 2026-08-11
- **Deciders:** Robin (design/implementation); the residual trade-off below is explicitly **not**
  decided by this ADR — see Consequences.
- **Builds on** [ADR-0012](0012-better-auth-mounting-guard-guest-session-coexistence.md) §5 (the
  DB-backed `RateLimit` table this reuses), [ADR-0013](0013-dsgvo-export-and-account-deletion.md) §6
  (`consumeDbRateLimit`'s reuse instruction), [ADR-0021](0021-controls-are-proven-by-breaking-them.md)
  (how the fix below is proven).
- **Context tags:** security, auth
- **Introduced by:** `steuereule#248`, `steuereule#292`; refuted and refined by Musti's §4 review of
  PR #339 (three blocking findings — attempts vs. failures, an unbounded key, a non-deterministic
  test — all fixed in the same PR this ADR ships alongside).

## Context

REQ-010 requires: *"given repeated **failed** logins from the same account, when a configured
threshold is exceeded, then further attempts are rate-limited rather than unbounded."* better-auth's
own built-in limiter (`better-auth.ts`'s `rateLimit` block) keys on `${ip}|${path}`
(`createRateLimitKey`). Two independently-measured shapes make that key untrustworthy today, neither
closable without a real deployment (#292 — successor to the closed #246):

- **A1** — a caller who sends `X-Forwarded-For` controls its value outright; a fresh value per request
  buys a fresh IP-keyed bucket every time, regardless of `advanced.ipAddress.trustedProxies` (that
  option only strips *known* hops from the *left* of a chain — it cannot invent a second value where
  the caller sent only one).
- **A0** — a caller who sends **no** `X-Forwarded-For` at all (the actual shape of every request in
  this project's own CI, since no reverse proxy sits in front of `node --import tsx dist/main.js`
  there) makes `getIp()` return `null`; better-auth's own fallback for that is a single literal key
  shared by every caller regardless of target account.

Neither shape is closable by any `TRUSTED_PROXIES` value today — both need the real deployment
topology (#292) before the question "which hop do we trust" is even askable. What CAN be built without
it: a second limiter keyed on something an attacker cannot rotate per request the way they can rotate a
header — the account being attacked.

## Decision

**A second, independent rate limiter, keyed on the target account, wired via better-auth's
`hooks.before`/`hooks.after`, reusing the existing DB-backed `consumeDbRateLimit` algorithm
(ADR-0013 §6 — no new mechanism).**

### 1. Key: `login-attempts|sha256(normalized-email)`, not the email verbatim

`RateLimit.key` (`schema.prisma`) has no unique constraint, no index, and nothing prunes it. Keying on
the raw request-supplied email would let an unauthenticated caller write an arbitrarily long string
into that column before the endpoint's own zod schema ever validates the body — measured directly:
a 5000-character non-email string produced a 5015-character key row and still 400'd (Musti's review,
PR #339, blocking finding 2). Hashing removes the size dimension entirely: every key this design can
produce is exactly 15 + 64 = 79 characters, so the only growth vector left is "one row per distinct
normalized email tried," the same shape every other account-scoped table in this system already has.

An index on `RateLimit.key` was considered and deliberately **not** added in the same change — Musti's
review asked for it to be "its own ticket rather than folding it in here." Filed as
[#342](https://github.com/NexusHero/Steuereule/issues/342), alongside a pruning story (nothing expires
old rows today, on either the IP-keyed or account-keyed key space).

### 2. Two hooks, not one: only a FAILURE counts, and a SUCCESS clears the bucket

The first version of this control counted every attempt in `hooks.before`, before credential
validation had even run — so it could not tell a failure from a success. Two consequences fell out,
both real defects (Musti's review, PR #339, blocking finding 1), not judgement calls:

1. It counted successes, which REQ-010's own wording does not ask for ("repeated **failed** logins").
2. A legitimate account holder's own correct sign-ins consumed quota and nothing ever gave it back —
   two devices, a re-auth, a reinstall in the same minute could lock a real user out of their own
   account.

Fixed by splitting the control across both of better-auth's hook phases:

- **`hooks.before`** only ever **peeks** (`peekDbRateLimit`, `db-rate-limit.ts`) at the current count
  and blocks (429) if already at/over quota — it never writes, so it cannot itself be the thing that
  locks someone out.
- **`hooks.after`** inspects the real outcome (`ctx.context.returned` — an `APIError` on failure, the
  session/user payload on success, per `dispatchAuthEndpoint`) and only then writes: a failure
  increments the bucket (`consumeDbRateLimit`); a success clears it outright (`resetDbRateLimit`).

A request the before-hook already blocked never reaches the endpoint or the after-hook at all
(better-auth's own dispatch pipeline short-circuits on a before-hook response), so a blocked attempt
cannot double-count.

### 3. Threshold: 60s / max 5 — looser than better-auth's own IP-keyed special rule (10s/max 3)

This bucket is shared by every caller regardless of source, honest or not — an attacker cannot rotate
the *account* the way they rotate a header, but neither can a legitimate user's own retries be told
apart from an attacker's at this layer. A looser threshold than the IP-keyed one is deliberate: it
still bounds a sustained credential-stuffing run against one account to roughly 5 guesses/minute
regardless of how many source IPs (real or spoofed) the attempts are spread across, while tolerating a
handful of mistyped passwords from a shared/rotating network (mobile carrier NAT, corporate egress)
without becoming a denial-of-service tool by itself. See Consequences for what this threshold does
**not** protect against.

### 4. Not gated on #292

Unlike the IP-keyed clause, this closes today: it never asks "is this IP real," so it needs no
deployment topology, no `TRUSTED_PROXIES` value, and no proxy CIDR ranges (#277). REQ-010's own GWT
wording — "repeated failed logins from the same account" — is met by this control alone, independent
of the IP-keyed clause's continued open status.

## Consequences

### What this closes

An attacker who fully defeats the IP-keyed limiter (a fresh `X-Forwarded-For` on every request — A1's
exact shape) still cannot make repeated guesses against one known account stop counting. Proven at
acceptance tier (`trusted-proxies-ip-resolution.test.ts`, the account-keyed describe block) and by hand
against the real compiled server.

### What this does not close — named plainly, not discovered later

- **A stolen-credential-list run** (many different, attacker-known account+password pairs, tried once
  each) defeats both limiters equally — a different threat than the one REQ-010 names.
- **It does not make the IP-keyed bucket or `Session.ipAddress` trustworthy.** Musti's ADR-0021 finding
  on `useDeviceSessions.ts` stands unchanged: configuring `trustedProxies` for a single-value header
  removes the check rather than replacing it. This design deliberately does not try to work around
  that — a rate limiter keyed on a spoofable address would be worse than an honestly-global one,
  because it would look like a control.

### OPEN — the lockout residual, awaiting stakeholder ruling

**Fixing "successes count" does not remove every availability cost this control has.** An attacker who
already knows (or guesses) a victim's email can still make **5 deliberate wrong-password attempts**
against that account and, for the rest of the 60-second window, deny the *victim's own correct
password* too — because the bucket is shared by every caller, honest or not, by construction (§3
above). This is not a bug the fix above touches: it is the direct, structural cost of keying on
something the attacker doesn't need to authenticate as.

This is a genuine, user-visible availability trade-off on the sign-in path, and per Musti's review it
is explicitly **not Robin's or Musti's call to make silently** — it needs a stakeholder ruling. What
follows is the evidence for that ruling, not a recommendation:

| Option | What it costs the attacker | What it costs the victim | What it costs to build |
|---|---|---|---|
| **A — do nothing (today's shipped state)** | 5 requests/minute, sustained indefinitely, zero credential knowledge needed | Locked out of their own account for the window's duration, repeatedly, for as long as the attacker sustains it | None |
| **B — compound key: `account` **and** `IP`** | Must also hold (or spoof) a stable IP per attempt — raises the bar only as far as the IP-keyed control is trustworthy, i.e. **not at all today** (A0/A1, both open on #292) | Unaffected by an attacker who cannot also fix their apparent IP; but two *legitimate* devices signing in from different networks would now be tracked as two different buckets, diluting the very protection this control exists for | Small — reuse the existing IP resolution, key composition |
| **C — exponential backoff instead of a hard block** | Same total cost over a long-enough window, but the first few attempts stay cheap and fast — does not raise the bar against a patient attacker | Never fully locked out, only slowed — but a legitimate user still waits, just less predictably than today's fixed window | Small — replace the fixed 60s window with a growing one per consecutive failure |
| **D — CAPTCHA step-up after N failures** | Meaningfully raises the cost of automation; a manual attacker is unaffected | A legitimate user who mistyped their password a few times now solves a CAPTCHA — friction on a path REQ-005 requires to "work immediately" | Medium — a new UI affordance, a new provider dependency, no such seam exists yet |
| **E — notify the account holder on lockout** | No cost to the attacker at all — does not prevent the lockout | Still locked out, but now informed it is happening and that it wasn't their own mistake — turns a silent denial into a legible one | Small — reuses `EmailSender` (already an interface with a `LoggingEmailSender` dev implementation, ADR-0030's own precedent) |

None of these is free, and B is not even effective until #292 lands. This ADR takes **no position** on
which (if any) to build — that ruling, and the ADR amendment recording it, belongs to the stakeholder,
per Musti's review of PR #339. Until then, Option A (today's shipped state, with only the "successes
don't count" defect fixed) is what ships, and this section is the record that the residual was named,
not missed.

## Alternatives considered

| Option | Why not (for the mechanism decisions this ADR does make) |
|---|---|
| Key on the raw email, not a hash | Unbounded, attacker-controlled key length on an unindexed column (§1) |
| Count every attempt (original PR #339 draft) | Counts successes; locks out a legitimate user's own correct sign-ins (§2) |
| A third, hand-rolled limiter mechanism | `consumeDbRateLimit` (ADR-0013 §6) already exists, is concurrency-safe, and is reused by `verify-password-rate-limit.ts` and `/v1/device/pending` — a fourth copy would be the thing to justify, not the reuse |
| Same threshold as better-auth's IP-keyed special rule (10s/max 3) | Too tight for a bucket shared by every caller regardless of honesty — see §3 |
