-- #476: message lifecycle, reasoning summary, run id, feedback and usage of a chat answer.
-- Expand-only (ADR-0055): one column with a constant default, the rest nullable.
ALTER TABLE "BeraterNachricht" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE "BeraterNachricht" ADD COLUMN "gedankengang" TEXT;
ALTER TABLE "BeraterNachricht" ADD COLUMN "laufId" TEXT;
ALTER TABLE "BeraterNachricht" ADD COLUMN "bewertung" TEXT;
ALTER TABLE "BeraterNachricht" ADD COLUMN "bewertungGrund" TEXT;
ALTER TABLE "BeraterNachricht" ADD COLUMN "verbrauch" TEXT;
