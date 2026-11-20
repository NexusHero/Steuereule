-- ADR-0101 §18: an entry posted from an accepted booking draft keeps the draft (encrypted by the app), so the
-- draft can be undone by a Storno. Set on INSERT only; the append-only trigger still refuses any UPDATE.
ALTER TABLE "Buchung" ADD COLUMN "entwurf" TEXT;
