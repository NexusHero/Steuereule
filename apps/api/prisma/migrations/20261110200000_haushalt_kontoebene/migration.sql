-- #452 / ADR-0062: household at account level. Expand only (ADR-0055): new tables, nothing existing
-- changes, so every calculation reads exactly what it read before.

CREATE TABLE "HaushaltPerson" (
    "id" TEXT NOT NULL,
    "haushaltNutzerId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "versiegelt" TEXT NOT NULL,
    "verknuepftesKonto" TEXT,
    "nichtMehrDabeiAb" INTEGER,
    "geaendertVon" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HaushaltPerson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HaushaltPerson_haushaltNutzerId_idx" ON "HaushaltPerson"("haushaltNutzerId");

CREATE TABLE "HaushaltJahr" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "kindId" TEXT,
    "partnerNutzerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HaushaltJahr_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HaushaltJahr_kindId_key" ON "HaushaltJahr"("kindId");
CREATE UNIQUE INDEX "HaushaltJahr_personId_steuerjahr_key" ON "HaushaltJahr"("personId", "steuerjahr");
CREATE INDEX "HaushaltJahr_steuerjahr_idx" ON "HaushaltJahr"("steuerjahr");
ALTER TABLE "HaushaltJahr" ADD CONSTRAINT "HaushaltJahr_personId_fkey" FOREIGN KEY ("personId") REFERENCES "HaushaltPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PartnerVerknuepfung" (
    "id" TEXT NOT NULL,
    "personANutzerId" TEXT NOT NULL,
    "personBNutzerId" TEXT NOT NULL DEFAULT '',
    "partnerPersonId" TEXT,
    "gueltigAb" INTEGER NOT NULL,
    "beendetAb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerVerknuepfung_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerVerknuepfung_personANutzerId_key" ON "PartnerVerknuepfung"("personANutzerId");
CREATE INDEX "PartnerVerknuepfung_personBNutzerId_idx" ON "PartnerVerknuepfung"("personBNutzerId");

CREATE TABLE "HaushaltDublette" (
    "id" TEXT NOT NULL,
    "haushaltNutzerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "anderePersonId" TEXT NOT NULL,
    "antwort" TEXT,
    "beantwortetAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HaushaltDublette_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HaushaltDublette_personId_anderePersonId_key" ON "HaushaltDublette"("personId", "anderePersonId");
CREATE INDEX "HaushaltDublette_haushaltNutzerId_idx" ON "HaushaltDublette"("haushaltNutzerId");
