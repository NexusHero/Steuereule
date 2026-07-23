# ADR-0008 — Profile persistence: server-side, sensitive fields field-encrypted at rest

**Status:** Accepted · 2026-07-23 · stakeholder decision (escalated by the lead during REQ Onboarding);
**refined 2026-07-23** with the concrete cipher/library/key-seam decided in the auth-epic grilling
(Slice 1, REQ-003) · relates to [ADR-0009](./0009-better-auth-as-auth-server.md)

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
  sensitive tax identifier) is stored **encrypted**, not plaintext — encryption/decryption happens
  transparently at the persistence boundary, invisible to controllers and callers. Non-sensitive
  fields (e.g. name) may be stored normally. This is defence-in-depth on top of disk/DB encryption at
  rest.
- **Library & cipher (refined):** the field encryption is provided by **`prisma-field-encryption`**, a
  Prisma **client extension** driven by an `/// @encrypted` annotation on the schema field. The cipher
  is **AES-256-GCM, randomized (non-deterministic)** — authenticated, and with a fresh IV per write so
  identical plaintexts yield different ciphertexts. We deliberately do **not** use a deterministic /
  searchable ("hash") mode: we never need a DB lookup or index on the Steuer-ID — `userId`-scoping is
  the only access path — so randomized is strictly safer with no functional cost.
- **Key management & swap-seam (refined):** the app-wide data-encryption key comes from a
  **rotation-ready sealed-secret / env** (`PRISMA_FIELD_ENCRYPTION_KEY`, 12-Factor III), never
  hard-coded, never in the repo. **No managed KMS yet** — but the key is resolved behind a **swap-seam**
  (a single resolver, not scattered `process.env` reads) so moving env → KMS later needs **no
  re-encryption** and no schema change. `prisma-field-encryption`'s keychain format supports key
  rotation (new writes use the current key; old ciphertexts stay readable via retired keys) — we adopt
  that format from day one so rotation is a config change, not a migration.
- **Scope of identity** stays as decided: a profile is bound to the `userId` / guest session
  (ADR-0007 phase-1 seam, now behind better-auth per ADR-0009); full identity verification is still
  only required at ELSTER submission (product ADR-027). Persisting the prefill early is a convenience,
  and it is protected accordingly.
- **Guest → account migration is a `userId` re-assign, no re-encryption.** Because the key is
  **app-wide** (not per-user), upgrading a guest to a real account is an **atomic `Profile.userId`
  re-assign** (REQ-006) — the ciphertext is untouched, so there is no decrypt/re-encrypt step and no
  window where plaintext is handled.

## Consequences

- Robin's **Profile model** stores ciphertext for the Steuer-ID via the `/// @encrypted` annotation;
  the `prisma-field-encryption` **client extension** encrypts on write / decrypts on read at the
  Prisma boundary, so `ProfileService` and the controller stay unchanged (they still handle plaintext
  in memory only). The `steuerId` column type/shape is unchanged (`String`) — the migration is
  **expand-only** (no new column, no backfill; existing dev rows are synthetic per ADR-0003). The
  **OpenAPI contract** exposes plaintext fields to the authenticated owner only.
- The encrypted field is **not indexable/queryable** (randomized ciphertext) — accepted, because the
  only access path is `userId`-scoped (`@unique`), never a lookup on the Steuer-ID itself.
- Every read/write of this sensitive field is recorded in the **immutable audit log** (REQ-004), which
  logs *who/what/when* — never the plaintext value — and is surfaced to the data subject in their own
  export (REQ-011).
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
