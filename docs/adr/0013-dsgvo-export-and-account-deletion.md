# ADR-0013 — DSGVO data export & account deletion: irrecoverable erasure reconciled with the append-only audit log

**Status:** Accepted · 2026-07-23 · stakeholder decision (escalated by the lead during the REQ-011
technical grill; both open calls ruled by the stakeholder). Realises **REQ-011** (#48), the hard gate
before any real, non-synthetic user is let onto Slice 2. **Extends** [ADR-0008](./0008-profile-persistence-encryption.md)
(field-encryption + append-only audit) and [ADR-0012](./0012-session-guard-coexistence-and-guest-upgrade.md)
(the atomic `userId` re-key precedent, guard seam). References product **ADR-011** (Löschschutz) and
**ADR-020** (server-side deletion + pre-delete export offer).

## Context

Every account holder must be able to **export** their full data (DSGVO Art. 15/20) and **delete** their
account (Art. 17), with the mandatory pre-delete export offer and the "you lose your Finanzamt evidence"
warning (product ADR-011). This is a **hard sequencing gate**: it must be Done before real users touch
Slice 2 (register §sequencing; ADR-0012 §Stakeholder-asks).

The technical grill surfaced three realities that shape the design, and two questions that were not the
lead's to settle and were escalated:

1. **Erasure collides with the append-only audit log.** `TaxDataAccessLog` (ADR-0008, REQ-004) is
   append-only — the repository exposes only `append()`, no update/delete, so "no mutation surface" is
   structural. Art. 17 "right to erasure" cannot both hard-delete those rows *and* preserve the
   immutable Art. 30 accountability record. **Escalated.**
2. **Crypto-shredding is not available at the per-user level.** ADR-0008's field-encryption key is
   **app-wide, not per-user**, so deleting a key to shred one user's ciphertext would shred every
   user's. Per-user keys would be a far larger, forward-looking change and are **not** needed: a plain
   hard-delete of the `Profile` row removes the ciphertext irrecoverably.
3. **No tax-data / filing / Löschschutz model is persisted yet.** The only user-owned data today is
   `Profile` (encrypted), `TaxDataAccessLog` (audit), and the better-auth tables (`User`, `Session`,
   `Account`, `Verification`). "Export all my tax data" is honestly an **empty set** for now, and the
   Löschschutz exemption is currently **vacuous** — but the acceptance test (`REQ-011`) exercises
   "delete with and without an active Löschschutz record", so the *mechanism* must be real and testable.
4. **Export format** — the DS reference (`Profil.jsx`) promises a "PDF-Bericht + Belege (ZIP)"; Art. 20
   requires a **machine-readable** representation (JSON). Which to build was **escalated.**

## Decision

### 1. Erasure vs. audit — **anonymise-and-retain** (stakeholder ruling, option A)

On account deletion the `TaxDataAccessLog` rows are **anonymised, not deleted**: their `userId` is
severed to an **irreversible tombstone** (a random `deleted:<uuid>`-class value), keeping the
person-unlinkable event (`action` / `resource` / `createdAt`) as the Art. 30 processing record. This is
the **same UPDATE-on-`userId` shape** already sanctioned as the single structural exception to
app-layer append-only in ADR-0012 §4 (guest→account re-key). Once the `userId` link is severed the rows
are no longer personal data (DSGVO Recital 26), so retaining them is Art. 17-clean while append-only and
Art. 30 accountability both hold.

Rejected alternative (option B, hard-delete the audit rows): maximises erasure but sacrifices the
immutable accountability record and any retention duty. Rejected by the stakeholder in favour of A.

### 2. Erasure of the encrypted profile — **hard-delete the row**

The `Profile` row is **hard-deleted** (not a soft-delete flag) — genuine, irrecoverable server-side
erasure of the encrypted `steuerId`/`steuernummer` ciphertext (Art. 17; issue "Irrecoverability"
quality attribute). Crypto-shredding is unavailable under the app-wide key (Context #2) and unnecessary
given hard-delete.

### 3. Account teardown — **one Prisma `$transaction`, all-or-nothing**

Deletion runs as a **single `$transaction`** on the plain (non-field-encryption) client — it only
deletes rows and re-keys the audit `userId`, never reads/writes the encrypted fields, mirroring
`guest-account-upgrade.ts`:

1. Hard-delete `Profile` for the userId (except any `Profile`/tax-data row under active **LegalHold** —
   see §5).
2. Anonymise `TaxDataAccessLog` for the userId → tombstone (§1), **except** rows under active LegalHold.
3. Delete the better-auth `User` row — the schema's `onDelete: Cascade` removes `Session` and `Account`
   automatically; delete `Verification` rows by the account email.

All-or-nothing: no partial teardown is ever observable. A mid-transaction failure rolls the whole thing
back (proven by an injected-failure test).

**Reuse boundary vs. better-auth:** better-auth is reused for the **re-authentication / confirmation**
step (fresh-session or password re-verification via `auth.api`), but the **teardown transaction is
ours** — the audit anonymisation is a domain concern better-auth cannot see, and a single transaction is
the only true all-or-nothing guarantee. Delegating teardown to better-auth's `deleteUser` would split it
across two transactions and leave the audit reconcile outside atomicity.

### 4. Export — **JSON *and* PDF-Bericht, both shipped** (stakeholder ruling)

The export ships **both** representations from one assembled data set (single source, two renderings):

- the **Art. 20 machine-readable JSON** document, and
- a **human-readable PDF-Bericht** rendered from the same data.

Scope of "all my data": decrypted `Profile` (over the authenticated channel, via `ENCRYPTED_PRISMA`),
the subject's **own** `TaxDataAccessLog` rows, and better-auth account identity. **Secrets are never
exported** — no password hash, no session/verification tokens, no other user's anything. `taxData` is an
honest **empty array** until a tax-year model exists. Each export **appends a `READ` audit entry**
(ADR-0008: every read of the sensitive field is logged).

### 5. Löschschutz — a minimal `LegalHold` seam, consulted by the delete

A minimal **`LegalHold`** model (expand-only migration: `userId`, `resource`, `holdUntil`) records
active legal holds. The delete transaction consults it and **exempts** matching rows from erasure/
anonymisation (product ADR-011: already-submitted filings under Löschschutz require the
full-account-deletion path, and are retained under legal obligation rather than deleted). Filing data
itself is **future scope** — today the exemption set is empty, but the mechanism is real and the `REQ-011`
acceptance test seeds a synthetic hold to exercise both the exempt and non-exempt branches.

### 6. Trust boundary — the existing guard seam, unchanged

Both endpoints sit behind `UserContextGuard` and read **only** `@CurrentUser()` userId — never a
client-asserted id from body/query/path/header (ADR-0007). There is no id parameter to forge; export/
delete of another user's data is structurally impossible, exactly as `ProfileController` already relies
on. The destructive path additionally requires: the mandatory pre-delete export offer + the ADR-011
Löschschutz warning + explicit confirmation + fresh-auth re-verification, and is **rate-limited by
reusing the existing DB-backed `RateLimit` table** (ADR-0012 §5) — no new mechanism.

> **Maintenance note (added post-implementation).** The fresh-auth password check calls
> `auth.api.verifyPassword()` **in process**, which bypasses better-auth's own rate limiter — that
> limiter only runs in the mounted `/api/auth/*` router's `onRequest` hook. To honour the "no new
> mechanism" rule above, `apps/api/src/auth/verify-password-rate-limit.ts` consults the same
> `RateLimit` table directly, hand-mirroring better-auth's internal `consume` algorithm (same key
> shape, same 10s window, max 3, same conditional-increment-then-reset semantics). That algorithm is
> **internal and un-exported**, so it is not covered by better-auth's public API contract:
> **re-verify this mirror whenever better-auth is version-bumped.** If it ever drifts, the deletion
> path silently loses its rate limit while the login path keeps its own — the tests that prove the
> 429 are the tripwire.

### 7. PDF generation — reuse the Chromium we already have, behind a `PdfRenderer` seam

The PDF-Bericht is produced by **server-side HTML→PDF using the Chromium already present via Playwright**
(ADR-0004), driven through a small **`PdfRenderer` seam** (the same shape as ADR-0012 §6's `EmailSender`
seam). The report HTML is a template built from the **same assembled export data** that produces the
JSON — one data path, two representations, reusing the existing i18n copy and a print stylesheet. This is
**reuse, not a new heavy PDF dependency**: no `pdfkit`/`pdf-lib`/`puppeteer`-class dependency is added,
so no separate `ask-matt` is required.

**Honest infra note (follow-up, not a design blocker):** Chromium is currently a *test-time* dependency;
the API **runtime image** must carry the Chromium binary for the renderer to run in production. That is a
build/infra follow-up. The `PdfRenderer` seam keeps the concrete engine swappable — if bundling Chromium
into the API image proves too heavy at deploy time, a lighter renderer slots in behind the seam with no
controller change. Dev/test uses the Playwright Chromium directly.

### 8. Honesty — the UI copy matches the real semantics

The DS `Profil.jsx` delete-Sheet copy ("Alle Belege … auch auf unseren Servern … nicht rückgängig") and
the export label ("PDF-Bericht + Belege (ZIP)") are **corrected, not ported verbatim**. The UI must state
precisely: profile + account are permanently erased server-side; the access-log record is **anonymised
and retained** as a legally-required, person-unlinkable processing record; anything under active
Löschschutz is retained under legal obligation. The export offers **JSON and PDF** (no "Belege ZIP" until
a receipts model exists). This is the standing honesty invariant (Slice-1 retro): a change must not leave
the product claiming something now untrue.

## Contract (frozen — pin before either track starts, #70 lesson)

Base: `@Controller('v1/account')`, `@UseGuards(UserContextGuard)`, userId only from `@CurrentUser()`.

- **`GET /v1/account/export?format=json`** (default) → `200 application/json`,
  `Content-Disposition: attachment; filename="steuereule-export-<YYYY-MM-DD>.json"`.
- **`GET /v1/account/export?format=pdf`** → `200 application/pdf`,
  `Content-Disposition: attachment; filename="steuereule-export-<YYYY-MM-DD>.pdf"`.
  - One route, representation selected by the `?format=` query param (chosen over `Accept`
    content-negotiation because a browser file-download `<a href>` cannot set an `Accept` header
    reliably). Both branches append a `READ` audit entry (`resource: "export"`).

  JSON body shape:

  ```jsonc
  {
    "schemaVersion": "1.0",
    "exportedAt": "<ISO-8601>",
    "account":  { "email", "name", "emailVerified", "createdAt", "authProviders": ["credential", ...] },
    "profile":  { "firstName", "lastName", "steuerId", "steuernummer", "createdAt", "updatedAt" } | null,
    "taxData":  [],                                          // honest empty set until a tax-year model exists
    "accessLog": [ { "action", "resource", "createdAt" } ]  // the subject's own audit rows
  }
  ```

  The PDF-Bericht renders the same fields in human-readable German. Never included in either
  representation: password hash, session/verification tokens, other users' data.

- **`DELETE /v1/account`** → confirmation payload `{ confirm: true }` + fresh-auth proof (password or a
  fresh-session assertion). `200` with an honest summary
  `{ deleted: { profile: boolean, account: true }, retainedAnonymisedAuditRows: <n>, retainedUnderLegalHold: <n> }`.
  Client clears the session on success. Rate-limited via the existing `RateLimit` store.

Freeze this via the OpenAPI document so orval regenerates the FE client — the FE builds against the real
typed client, no mock (ADR-0003/0005).

## Consequences

- **T1 rigor.** Red-first ATDD acceptance test `apps/api/test/acceptance/req-011-export-delete.test.ts`
  (tag `REQ-011`) against the real seeded compose stack: full export round-trip (JSON + PDF), then delete
  with and without an active LegalHold. Plus: trust-boundary negatives (A cannot export/delete B),
  irrecoverability, atomicity/rollback (injected mid-transaction failure), Löschschutz exemption,
  audit-count preserved under anonymisation, secrets-excluded assertions.
- **Compliance tests run in CI against real Postgres** (ADR-0010); the boot-smoke job covers the new
  routes. The lead's `APPROVE` is an *enforced* invariant only once branch protection (#71) requires
  these checks — until then it is a personal promise (Slice-1 retro).
- **Expand-only migration** adds one `LegalHold` table; no alteration to `Profile` / `TaxDataAccessLog`
  shape. The audit `userId` anonymisation is the **second** sanctioned structural exception to
  app-layer append-only (after ADR-0012 §4's guest re-key); any future DB-level append-only enforcement
  must whitelist both the re-key and the deletion-anonymise path.
- **PDF adds a runtime Chromium footprint** to the API image — tracked as an infra follow-up; the
  `PdfRenderer` seam keeps it swappable.
- **Sequence diagram** of the delete transaction is authored as PlantUML source
  ([`0013-account-deletion-transaction.puml`](./0013-account-deletion-transaction.puml)); SVG export is a
  tracked follow-up (no PlantUML renderer in the current toolchain — same tracked-inconsistency
  convention as `index.md`).

## Alternatives considered

- **Hard-delete the audit rows (option B)** — rejected by the stakeholder: loses the immutable Art. 30
  accountability record.
- **Crypto-shred the encrypted fields** — rejected: the field-encryption key is app-wide (ADR-0008), so
  per-user shredding is impossible without a per-user-key re-architecture that hard-delete makes
  unnecessary.
- **Soft-delete flag** — rejected: not genuine erasure; the issue requires real server-side deletion.
- **better-auth `deleteUser` owns the teardown** — rejected: splits teardown across two transactions and
  leaves the audit anonymisation outside atomicity; we reuse better-auth for re-auth only.
- **JSON-only export** — superseded by the stakeholder's "JSON *and* PDF, both now" ruling.
- **A new PDF dependency (`pdfkit` / `pdf-lib` / standalone `puppeteer`)** — rejected: the Chromium
  already present via Playwright renders HTML→PDF as reuse, avoiding a new heavy dependency and the
  `ask-matt` it would otherwise require.
- **`Accept`-header content negotiation for JSON vs PDF** — rejected in favour of `?format=` because a
  browser download link cannot set `Accept` reliably.
