-- ADR-0097: the facts of a Beleg's last read. Expand-only, four nullable clear columns; the processing
-- state is derived from them and the owl drafts, never stored.
ALTER TABLE "Beleg" ADD COLUMN "gelesenAm" TIMESTAMP(3);
ALTER TABLE "Beleg" ADD COLUMN "leseErgebnis" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "leseGrund" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "entwurfSteuerjahr" INTEGER;
