# ADR-0110 — Per-user keys for the field-encrypted columns

- **Status:** Proposed
- **Date:** 2026-11-24
- **Deciders:** the product owner (goal, keystore durability, timing); engineering (design).
- **Builds on** [ADR-0008](0008-profile-persistence-encryption.md) (field encryption),
  [ADR-0059](0059-document-keystore-crypto-shredding.md) (keystore, one wrapped key per user),
  [ADR-0107](0107-pentest-round-3-fixes.md) (finding H4), [ADR-0109](0109-security-report-hardening.md).
- **Context tags:** security, encryption, data-protection
- **Component:** `apps/api/src/prisma`, `apps/api/src/keystore`, `apps/api/prisma`, `infra/gcp`

## Context

193 columns in 30 models carry `/// @encrypted?mode=strict` and are encrypted by
`prisma-field-encryption` 1.6 under one key, `PRISMA_FIELD_ENCRYPTION_KEY`. Two consequences:

- Deleting an account destroys the user's keystore key, which makes receipt files and
  `HouseholdPerson.sealed` unreadable in every backup (ADR-0059). The field-encrypted columns stay
  readable from a backup taken before the deletion until that backup expires (ADR-0107 H4).
- Whoever holds the tax-data database and that one key reads every account.

The keystore already holds one wrapped data key per user in a separate database with its own master
key and short backup retention. Every model with an encrypted column has a `userId`. One column has a
companion hash for lookup. The library cannot choose a key per row.

## Decision (proposed)

Decided by the product owner on 2026-11-24:

1. **Both goals count:** deleted accounts are unreadable in backups, and the database plus one key no
   longer opens every account.
2. **The keystore keeps its short retention** (2 backups, 1 day of point-in-time recovery) and gets a
   regional replica, because after this change losing it loses all tax data, not only the documents.
3. **Work starts after PRs 577 to 580 are merged and the security audit has been repeated**, on a clean
   `main`. It needs a running instance to verify (the throwaway production instance), not only tests.

Design:

4. **The row owner's key encrypts the row.** A Prisma client extension of our own replaces
   `prisma-field-encryption`. On write it takes the `userId` of the row, on read the `userId` the row
   carries. The key is a subkey derived (HKDF, label `field-encryption`) from the user's keystore key, as
   the receipt MAC key already is. Rows a spouse reads through `householdOwner` decrypt with the owner's
   key, because the key follows the row, not the caller.
5. **The annotations stay.** `/// @encrypted` keeps marking the columns, so the schema, the existing
   guard test (`prisma-encrypted-fields.test.ts`) and the list of columns do not change.
6. **Ciphertext says which scheme wrote it.** New values carry their own prefix. During the migration the
   extension reads both: the old prefix with the global key, the new one with the user's key. It writes the
   new scheme only.
7. **Keys are fetched once per request and user** and cached in the process for a short time; a cache
   entry dies with the key on deletion.
8. **Guests get a key** on their first write, like accounts. The guest sweep (ADR-0109) destroys it.
9. **A legal hold keeps the key**, as it does today for documents.
10. **Lookup hashes** use a key derived from the keystore master key, not from the user's key, so the one
    hashed column stays searchable without knowing the owner.

Migration, each step its own change:

- **Step 0, spike.** Prove the extension against every query shape the code uses: nested writes,
  `include`/`select`, `createMany`, `upsert`, transactions, the transaction-aware client. Measure the cost
  of a request that touches many rows. Stop here if a shape cannot be carried.
- **Step 1.** Ship the extension reading both schemes and writing the old one. No behaviour change.
- **Step 2.** Switch writes to the new scheme. Rows migrate as they are written.
- **Step 3.** Backfill the rest, user by user, idempotent, resumable, with a count of rows left per model.
- **Step 4.** Remove the library and `PRISMA_FIELD_ENCRYPTION_KEY`. From here deletion shreds field data.
- **Infrastructure.** The regional replica of the keystore instance, before step 2.

## Consequences

- Account deletion makes all of a user's stored data unreadable in backups once the keystore retention has
  passed (1 day), not only the documents.
- A leak of the tax-data database and any single secret no longer reads accounts: it also needs the
  keystore database and its master key.
- Losing the keystore loses everything. That is the reason for decision 2, and for an alert on the keystore
  instance.
- Every read of encrypted data needs the keystore. A keystore outage becomes an outage of the app, where
  today only documents are affected.
- The backup of a deleted account cannot be restored, also not on request.
- Between step 2 and step 4 the database holds both schemes; a rollback to the library is possible until
  step 4 only if writes are switched back first and migrated rows are converted back.

## Open questions

- Columns in tables better-auth writes through its own client (`Passkey` has one encrypted column).
- Whether shared household rows should be readable after the owner's deletion while the spouse's account
  lives. Today the spouse loses access with the row.
- Cost of the replica, and whether the keystore moves to a dedicated-core tier with it.

## Alternatives considered

- **Rotate the global key on every deletion.** Re-encrypts every account for one deletion.
- **Keep the library and add a second layer per user.** The same work as replacing it, with two schemes
  forever.
- **Per-user salt with the global key (HKDF) instead of the keystore key.** Shreds on deletion, but the
  global key still opens every account whose salt is in a backup; it meets only the first goal.
