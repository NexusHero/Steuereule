-- ADR-0101 §6: a business receipt records whether it is an expense or an income, so its parse drafts the
-- booking in that direction. Additive; no existing value changes.
ALTER TABLE "Beleg" ADD COLUMN "richtung" TEXT;
