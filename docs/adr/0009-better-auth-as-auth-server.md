# ADR-0009 — better-auth as the auth server (Keycloak dropped); supersedes ADR-0007

**Status:** Accepted · 2026-07-23 · stakeholder decision (auth epic grilling, Epic #8) ·
**supersedes ADR-0007** · honours the `UserContextGuard` seam (REQ-002/ADR-0007 phase 1) ·
implements REQ-003…REQ-011 · relates to product ADR-046/027/020/006

## Context

ADR-0007 settled the auth *engineering* build as **Keycloak (IdP) + better-auth (OIDC relying
party)**: a hardened JVM IdP owning users/credentials/MFA/social brokering, with better-auth
federating to it over OIDC. The `UserContextGuard` (REQ-002, done) was built as the single seam that
establishes `userId` for a request — phase 1 mints an opaque, HMAC-signed **guest** session; the guard
is the *only* place identity is resolved, so the identity system behind it can change without touching
any controller or service.

Re-grilling the auth epic before Slice 1, the stakeholder reconsidered the operational cost of running
and patching a separate Keycloak service against the value it adds for our 1.0 scope. The conclusion:
for this product and team, better-auth **on its own** — as the auth *server*, not an OIDC client to
Keycloak — carries the identity surface we actually need (guest, email/password, social Google/Apple,
2FA/passkeys, DB-backed sessions) with a single TypeScript stack and first-class Expo/RN support, while
the `UserContextGuard` seam preserves the exact property Keycloak was meant to protect: an external,
verified IdP can slot in **later** behind the guard without controller/service changes. This decision
**supersedes ADR-0007**. Per the log's immutability rule we supersede rather than rewrite: ADR-0007
stays on record (its `UserContextGuard` seam — phase 1 — remains live and correct; only its Keycloak
choice is replaced here).

## Decision

- **better-auth is the auth server** (not an OIDC relying party to Keycloak). It owns users,
  credentials, social sign-in, MFA/passkeys, session issuance and revocation, mounted on the existing
  NestJS + Fastify API (product ADR-046). **Keycloak is dropped** — no separate JVM IdP for 1.0, and
  no Keycloak container in the compose/dev stack.
- **The `UserContextGuard` seam is unchanged and load-bearing.** `userId` is established **only** by
  the server, inside the guard — never from a client-set header, body, query, or path (ADR-0007 phase
  1, REQ-002). Today the guard verifies an opaque HMAC-signed **guest** cookie; better-auth plugs in
  **behind** this seam so that swapping guest → authenticated `userId` (and, later, an external
  verified IdP) needs no change in any controller or service. This seam is the whole reason dropping
  Keycloak carries no downstream cost.
- **Phased scope** (each phase lands behind the same seam):
  1. **Guest** — the live phase: a lightweight anonymous session, `userId` available immediately for
     the vertical slices (Onboarding/Cockpit). Slice 1 persists the encrypted Steuer-ID onto the
     **guest `userId`**.
  2. **Email + password + guest→account upgrade** — real accounts; the guest's data carries over
     **atomically** to the account `userId`, then the guest session is retired (REQ-005/006).
  3. **Social (Google, Apple) + 2FA/passkeys** — Google in 1.0; Apple Sign-In built and wired but
     flagged off until an Apple Developer account + shipped iOS build exist; TOTP 2FA and WebAuthn
     passkeys as opt-in factors (REQ-007/008).
- **Session model** — **DB-backed sessions** (better-auth, in our EU Postgres, ADR-047): server-
  verified and revocable, multi-device with no device registry (product ADR-027). Transport of the
  session token is **per platform**: **web** keeps it only in an `httpOnly` + `Secure` +
  `SameSite=strict` cookie; **Expo/React-Native** keeps it only in **SecureStore** (REQ-009). No
  session token in `localStorage`/AsyncStorage.
- **Authorization** — `userId` scopes every profile, tax year and document (product ADR-006); guest
  data is reachable only by its own session until claimed. **ELSTER submission still requires a
  verified real identity** (product ADR-005/027) — a gate above ordinary login, out of scope for the
  1.0 read/onboarding slices.
- **Data residency & secrets** — better-auth's user/session tables live in **our EU Postgres**
  (ADR-047). All `BETTER_AUTH_*` / social-provider client secrets come from the vault/sealed secrets
  (12-Factor III), never hard-coded.

## Security hardening

The hardening posture from ADR-0007 carries over, now owned by better-auth + the API rather than
Keycloak (non-exhaustive, tracked toward the infra/compliance ADR line and CI gates):

- **Transport:** TLS 1.3, HSTS, modern ciphers, auto-renewed certs (k3s ingress, ADR-049).
- **Auth server:** email verification/OTP, per-route **login rate limiting**, **CSRF** protection,
  strict redirect/origin allowlist, short session TTLs with server-side revocation, opt-in **TOTP +
  WebAuthn passkeys**, a **known-breached-password** check at signup/change (REQ-010).
- **App/API:** strict CORS allowlist, input validation (class-validator), security headers/CSP
  (helmet), and **audit logging of tax-data access** (REQ-004 / ADR-0008).
- **DSGVO:** data minimization, retention & deletion paths, **no real PII in non-prod** (ADR-0003 §4.2),
  export/delete as first-class (Art. 15/17/20, REQ-011).
- **SDLC:** dependency scanning (SCA), SAST, secret scanning in CI; the `security-review` gate runs on
  auth-touching changes; pen-test before ELSTER go-live.

## Consequences

- **One TypeScript stack** for app + auth server; no JVM IdP to run, patch, or containerize for dev.
  Operational surface shrinks materially versus ADR-0007.
- We **own the identity hardening** that Keycloak would have provided audited (MFA, brute-force
  lockout, social brokering) — now our responsibility on better-auth. This is the accepted trade and
  is why REQ-010's hardening baseline is first-class, not optional.
- The `UserContextGuard` seam keeps the swap-cost near zero: should we ever want an external verified
  IdP (or re-introduce one), it mounts behind the guard without reworking controllers/services.
- Social OAuth apps (Google, Apple) are configured against **better-auth** directly (not Keycloak
  brokering); Apple Sign-In still brings App Store obligations when the iOS build ships.
- Guest→account upgrade must migrate guest-owned data atomically to the account `userId`
  (REQ-006); for the encrypted profile this is an atomic `Profile.userId` re-assign — the encryption
  key is app-wide, so **no re-encryption** is needed (ADR-0008).

## Alternatives considered

- **Keep ADR-0007 (Keycloak IdP + better-auth OIDC RP)** — audited MFA/brute-force/social brokering
  out of the box, but a separate JVM service to run, patch, secure and containerize for every dev.
  Rejected for 1.0: the hardening it buys is reproducible on better-auth for our scope, and the seam
  keeps the door open to re-introduce a hardened IdP later at low cost.
- **Auth0 / Clerk** — fastest, but US-based SaaS: identity PII leaves the EU and our control, per-MAU
  cost. Wrong fit for data sovereignty (unchanged from ADR-0007).
- **Auth.js (NextAuth)** — web/Next-centric; weaker first-class Expo/RN and server-session story.
- **Roll our own** — rejected: auth is the last place to hand-roll security. better-auth is a vetted
  library carrying the primitives; it is not hand-rolled auth.
