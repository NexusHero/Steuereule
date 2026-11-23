# ADR-0059 — Separate keystore database for document keys (crypto-shredding down into the backups)

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/keystore/`, `apps/api/src/receipt/storage/`, `apps/api/prisma/keystore/`, `infra/gcp/`
- **Supplements:** ADR-0008 (encryption at rest), ADR-0013 (DSGVO (GDPR) export and account deletion)

## Context

#444 stores original documents encrypted: AES-256-GCM per file, with one data encryption key
(DEK) per user, wrapped under a master key. On account deletion the
DEK is deleted. Without it the files are unreadable (crypto-shredding). Ticket #444 explicitly
requires that this **also applies to backups**.

The first draft put the wrapped DEK in **the same database** as the encrypted
files. A backup then contains both. Together with the master key (derived from the
field encryption), every deleted file stays recoverable from every backup.
The promise „auch Backups unlesbar“ ("backups unreadable too") was therefore not kept.

## Decision

1. **Separate database.** The wrapped DEKs live in a separate keystore database
   (`prisma/keystore/schema.prisma`, table `NutzerSchluessel`, its own Prisma client, its own
   migrations). The tax data database now contains only ciphertext, IV, auth tag and a MAC.
2. **Shorter backup retention.** In production the keystore is a **separate Cloud SQL instance**
   (backups apply per instance) with 2 backups and 1 day of PITR, versus 7/7 for the tax data.
   After a deletion, a file is therefore unreadable in **every** backup at the latest once the
   keystore retention has expired, including the longer-retained tax data backups.
3. **Separate master key.** `KEYSTORE_MASTER_KEY` (rotation via
   `KEYSTORE_MASTER_KEY_PREVIOUS`) replaces the derivation from `PRISMA_FIELD_ENCRYPTION_KEY`.
4. **Deletion order.** Account deletion destroys the key **before** the
   tax data transaction. If the transaction fails, the files are already unreadable and a
   retry completes the deletion. The reverse case (rows gone, key alive,
   backups readable forever) is thereby ruled out. A legal hold on tax data keeps the
   key.
5. **No plaintext hash.** Instead of SHA-256 over the plaintext, `BelegDatei.inhaltsMac` stores an
   HMAC under a key derived from the DEK. A third party therefore cannot check whether a
   document known to them is present.
6. **No extra effort outside production.** Dev, CI and E2E derive
   `KEYSTORE_DATABASE_URL` as a neighbor database `<name>_keystore` on the same server.
   `migrate:deploy` creates it if needed and migrates both databases. The boot guard
   refuses to start if either of them is not migrated.

## Consequences

- The deploy gains a second Cloud SQL instance, with small fixed costs, as well as two secrets
  (`KEYSTORE_DATABASE_URL`, `KEYSTORE_MASTER_KEY`) and the repo variable
  `GCP_KEYSTORE_SQL_INSTANCE`. `scripts/infra/gcp-setup.sh` creates everything. If the variable is
  missing, the deploy skips (as with any missing variable).
- If the keystore is lost, all original documents are lost. The tax data itself stays
  untouched, because it is field-encrypted with its own key. That is why the keystore has its own,
  if short, backups.
- Keys and tax data are not in one transaction. That is deliberate (point 4), but
  requires the fixed order.
