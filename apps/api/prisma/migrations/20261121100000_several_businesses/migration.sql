-- ADR-0101 §22: a person may have more than one business (a Freiberuf beside a Gewerbe, two
-- Gewerbebetriebe). Every existing profile, book and asset becomes business 1; nothing else changes.
ALTER TABLE "Betrieb" ADD COLUMN "betrieb" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Buch" ADD COLUMN "betrieb" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Anlagegut" ADD COLUMN "betrieb" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "Betrieb_userId_steuerjahr_person_key";
CREATE UNIQUE INDEX "Betrieb_userId_steuerjahr_person_betrieb_key" ON "Betrieb"("userId", "steuerjahr", "person", "betrieb");

DROP INDEX "Buch_userId_steuerjahr_person_key";
CREATE UNIQUE INDEX "Buch_userId_steuerjahr_person_betrieb_key" ON "Buch"("userId", "steuerjahr", "person", "betrieb");
