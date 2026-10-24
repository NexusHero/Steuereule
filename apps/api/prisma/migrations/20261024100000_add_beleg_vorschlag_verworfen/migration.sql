-- AlterTable
-- ADR-008 "bei meinem Jahr bleiben": persist the explicit dismissal of a contradicting
-- date-derived suggestion, so the derived `konflikt` can resolve to `zugeordnet` on the
-- user's own confirmed year without silently overwriting the dates.
ALTER TABLE "Beleg" ADD COLUMN "vorschlagVerworfen" BOOLEAN NOT NULL DEFAULT false;
