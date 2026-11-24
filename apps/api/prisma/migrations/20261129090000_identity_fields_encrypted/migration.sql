-- ADR-0109: User.email/name and Session.ipAddress/userAgent are encrypted at rest (prisma-field-encryption).
-- Expand-only: one nullable column. The e-mail is found by this hash, because its ciphertext is random.
-- Rows are converted by `pnpm --filter @steuereule/api backfill:identity` (see ADR-0109 for the order).
ALTER TABLE "User" ADD COLUMN "emailHash" TEXT;
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");
