# ADR-0007 — Authentication: Keycloak IdP + better-auth (OIDC RP), EU-resident, TLS everywhere

**Status:** Accepted · 2026-07-22 · implements product ADR-046, honours ADR-027/020/006

## Context

The product decided the auth *surface* already: Google & Apple, email + password, and a guest mode
(`auth.html`, #61), with **identity only required at submission** and multi-device without device
management (ADR-027), on EU-resident infra (ADR-020/047/049). SteuerEule handles tax data — a
high-value target — and is also a portfolio piece, so demonstrating a hardened, industry-standard
identity setup is a first-class goal. Open for the *engineering* build: which identity system, how it
mounts on the NestJS + Fastify API (ADR-046), where data lives, which session model spans an Expo app
**and** web, and how the walking skeleton gets a user context before full login exists.

## Decision

- **Keycloak is the Identity Provider (IdP)** — self-hosted on our k3s in the EU (ADR-049). It owns
  users, credentials, MFA, social federation (Google/Apple), brute-force protection, token issuance
  and the admin surface. A mature, audited IdP carries the security-critical parts instead of
  hand-rolled code.
- **better-auth is the application relying party (RP)** — it federates to Keycloak over **OIDC
  (Authorization Code + PKCE)** and provides the TypeScript DX, the **Expo/React-Native** integration,
  and app-session handling. Keycloak is the source of truth for identity; better-auth is its client on
  the NestJS API. (This revises ADR-046's "better-auth alone" and this ADR's earlier draft, which had
  wrongly dismissed Keycloak as overkill — for a tax product the hardened IdP is worth the JVM service.)
- **TLS everywhere, mandatory.** Keycloak requires HTTPS in production; the k3s ingress terminates
  **TLS 1.3 + HSTS** (cert-manager + Let's Encrypt), and service-to-service traffic may use mTLS.
- **Methods, phased:**
  1. **Guest** first — a lightweight app session (no Keycloak account yet) so the walking-skeleton
     Cockpit read (T4) has a `userId` immediately; guest data is anonymous until claimed.
  2. **Email + password** (Keycloak realm, email verification/OTP; `registrierung.html`'s demo code
     becomes a real one).
  3. **Google** and **Apple** via Keycloak identity brokering (Apple Sign-In is mandatory on iOS once
     another social provider ships). A guest **upgrades** to a real Keycloak account, carrying its data
     over — the concrete shape of "Identität erst bei Abgabe" (ADR-027).
- **Sessions/tokens:** short-lived **access tokens + refresh-token rotation with reuse detection**
  (Keycloak). Web keeps the session in `httpOnly` + `Secure` + `SameSite=strict` cookies; **Expo/RN**
  keeps the refresh/session token in **SecureStore** (better-auth Expo integration). Server-verified,
  revocable, multi-device with no device registry (ADR-027).
- **Authorization:** `userId` (Keycloak `sub`) scopes every tax year and document (product ADR-006);
  guest data is reachable only by its own session until claimed. **ELSTER submission requires a
  verified real identity** (ADR-005/027) — a gate above ordinary login, out of scope for 1.0 reads.
- **Data residency & secrets:** the Keycloak realm DB and app data both live in **our EU Postgres**
  (ADR-047). All `AUTH_*` / `BETTER_AUTH_*` / Keycloak client secrets come from the vault/sealed
  secrets (12-Factor III), never hard-coded.

## Security hardening ("wirklich sicher")

Non-exhaustive, tracked toward the infra/compliance ADR line and CI gates:

- **Transport:** TLS 1.3, HSTS, modern ciphers, auto-renewed certs; optional mTLS between services.
- **IdP:** enforce **MFA** (WebAuthn/passkeys + TOTP), brute-force lockout, password policy, PKCE,
  strict redirect-URI allowlist, short token TTLs, refresh rotation + reuse detection.
- **App/API:** CSRF protection, strict CORS allowlist, per-route rate limiting (login + API), input
  validation (class-validator), security headers/CSP (helmet), audit logging of tax-data access.
- **Data:** encryption at rest, **field-level encryption for the most sensitive tax fields**,
  least-privilege DB roles, encrypted backups, KMS/vault-managed keys.
- **DSGVO:** data minimization, retention & deletion paths, **no real PII in non-prod** (§4.2),
  export/delete as first-class (Art. 15/17/20, `datenschutz.html`).
- **SDLC:** dependency scanning (SCA), SAST, secret scanning in CI, and a pen-test before ELSTER
  go-live; the `security-review` gate runs on auth-touching changes.

## Consequences

- One TypeScript stack for the app + RP; Keycloak is a separate JVM service we run and patch —
  accepted operational cost for audited security and standard SSO/MFA.
- We own identity and tax data in the EU → strong DSGVO posture and native data-subject rights, but we
  carry the security burden (IdP hardening, session hygiene, breach handling).
- OAuth apps (Google, Apple) are configured **in Keycloak** as identity providers; Apple Sign-In
  brings App Store obligations. Local dev needs a Keycloak container in the compose stack.
- Guest→account upgrade must migrate anonymous data atomically to the new `sub`.

## Alternatives considered

- **better-auth alone (no Keycloak)** — lighter, fewer moving parts, but we'd hand-roll MFA,
  brute-force protection and social brokering that Keycloak provides audited. Chosen against for a
  tax product; better-auth stays, now as the OIDC RP.
- **Auth0 / Clerk** — fastest, but US-based SaaS: identity PII leaves the EU and our control, per-MAU
  cost. Wrong fit for data sovereignty.
- **Supabase Auth** — couples auth to Supabase; we run our own Postgres + k3s.
- **Auth.js (NextAuth)** — web/Next-centric; weaker first-class Expo/RN and server-session story.
- **Ory (Hydra/Kratos)** — capable, cloud-native, but a larger surface to assemble than Keycloak's
  batteries-included realm for our 1.0 needs.
- **Roll our own** — rejected: auth is the last place to hand-roll security.
