-- P7: legal holds on single rows, paid unlocks outlive the account, the unverified-account sweep (ADR-0030).

-- LegalHold: a hold on one row (resourceId) besides the category holds; the sweep finds expired holds by date.
ALTER TABLE "LegalHold" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "LegalHold" ADD COLUMN "reason" TEXT;
CREATE UNIQUE INDEX "LegalHold_resource_resourceId_key" ON "LegalHold"("resource", "resourceId");
CREATE INDEX "LegalHold_holdUntil_idx" ON "LegalHold"("holdUntil");

-- Unlock: a paid row is a Buchungsbeleg (§ 147 AO); it may not cascade away with the User while held.
ALTER TABLE "Freischaltung" DROP CONSTRAINT "Freischaltung_userId_fkey";

-- User: the ADR-0030 warnings, so the deletion is gated on the warning having been sent (§3a).
ALTER TABLE "User" ADD COLUMN "unbestaetigtWarnungAm" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "unbestaetigtLetzteWarnungAm" TIMESTAMP(3);

-- TaxDataAccessLog: the retention sweep finds old rows by date (RETENTION.auditLogYears, H2-7).
CREATE INDEX "TaxDataAccessLog_createdAt_idx" ON "TaxDataAccessLog"("createdAt");
