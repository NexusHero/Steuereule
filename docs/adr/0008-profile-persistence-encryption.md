# ADR-0008 — Profile persistence: server-side, sensitive fields field-encrypted at rest

**Status:** Accepted · 2026-07-23 · stakeholder decision (escalated by the lead during REQ Onboarding)

## Context

The Onboarding flow collects a **Steuer-ID** (11-digit German tax identification number), a name, and
optionally a Steuernummer. The Steuer-ID is **highly sensitive personal data** under the DSGVO. The
design-system reference persists the whole profile — including the Steuer-ID — to browser
`localStorage` (`funke.onboarding.profil`), which is plaintext data-at-rest and a leak vector. The
lead (Musti) refused to silently port that; he kept the Onboarding slice **in-memory** for the ticket
and **escalated the persistence question** to the stakeholder (per our governance: architecture +
security/DSGVO decisions go to the human, captured as an ADR). The stakeholder decided.

## Decision

- **Profile data is persisted server-side**, in our managed **EU Postgres** (ADR-047), via the API's
  Profile endpoints (ADR-046). **No sensitive profile data is persisted on the client** — the
  Onboarding screen holds values in-memory and sends them to the API over TLS; nothing goes to
  `localStorage`/AsyncStorage.
- **Sensitive fields are encrypted at rest, field-level.** The **Steuer-ID** (and any equally
  sensitive tax identifier) is stored **encrypted**, not plaintext — encryption/decryption happens in
  the API service layer, transparent to the caller. Non-sensitive fields (e.g. name) may be stored
  normally. This is defence-in-depth on top of disk/DB encryption at rest.
- **Key management** is externalised: the data-encryption key comes from a vault/KMS (or a
  `PROFILE_ENC_KEY`-style secret in dev, 12-Factor III), never hard-coded, and is rotatable. The
  cipher is a vetted authenticated scheme (e.g. AES-256-GCM); the concrete library/KMS is Robin's
  implementation choice within this constraint, recorded when built.
- **Scope of identity** stays as decided: a profile is bound to the `userId` / guest `sub` (ADR-0007);
  full identity verification is still only required at ELSTER submission (product ADR-027). Persisting
  the prefill early is a convenience, and it is protected accordingly.

## Consequences

- Robin's **Profile model** stores ciphertext for the Steuer-ID; the **ProfileService** encrypts on
  write and decrypts on read; migrations stay expand-only. The **OpenAPI contract** exposes plaintext
  fields to the authenticated owner only.
- The frontend Onboarding screen is wired to the API (the vertical slice): `PUT /v1/profile` on
  completion, `GET /v1/profile` for prefill — **no mock data, no client persistence** of the Steuer-ID.
- We carry the key-management burden (storage, rotation, access control) — tracked toward the infra
  ADR line. Losing the key must not expose the data; leaking the DB alone must not either.
- No real PII in non-prod: seed/test fixtures use **synthetic** Steuer-IDs only (ADR-0003 / §4.2).

## Alternatives considered

- **Plaintext `localStorage` (the DS demo)** — rejected: sensitive PII at rest in the clear on the
  client.
- **In-memory only, no persistence** — safe but not a real vertical slice; the prefill wouldn't
  survive, and the decision would only be deferred.
- **Persist non-sensitive fields only, Steuer-ID never at rest until submission (ADR-027-strict)** —
  considered; rejected in favour of encrypted server-side persistence so the prefill works end-to-end
  while the sensitive field is still protected.
