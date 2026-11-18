-- ADR-0098: the Besteuerungsgrundlagen of a Bescheid, the tax year's state and the frozen filing.
-- Additive only: existing rows keep their values; the new Bescheid columns start as "not read".

-- AlterTable
ALTER TABLE "Bescheid"
  ADD COLUMN "bruttoarbeitslohnA" TEXT,
  ADD COLUMN "bruttoarbeitslohnB" TEXT,
  ADD COLUMN "fahrtwegA" TEXT,
  ADD COLUMN "homeofficeA" TEXT,
  ADD COLUMN "arbeitsmittelA" TEXT,
  ADD COLUMN "sonstigeWerbungskostenA" TEXT,
  ADD COLUMN "werbungskostenA" TEXT,
  ADD COLUMN "fahrtwegB" TEXT,
  ADD COLUMN "homeofficeB" TEXT,
  ADD COLUMN "arbeitsmittelB" TEXT,
  ADD COLUMN "sonstigeWerbungskostenB" TEXT,
  ADD COLUMN "werbungskostenB" TEXT,
  ADD COLUMN "sonderausgaben" TEXT,
  ADD COLUMN "aussergewoehnlicheBelastungen" TEXT,
  ADD COLUMN "zuVersteuerndesEinkommen" TEXT,
  ADD COLUMN "steuerermaessigung35a" TEXT,
  ADD COLUMN "solidaritaetszuschlag" TEXT,
  ADD COLUMN "kirchensteuer" TEXT,
  ADD COLUMN "erlaeuterungen" TEXT;

-- AlterTable
ALTER TABLE "TaxYear" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'entwurf';

-- CreateTable
CREATE TABLE "Fassung" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL DEFAULT 1,
    "veranlagungsart" TEXT NOT NULL,
    "eingereichtAm" TEXT NOT NULL,
    "positionen" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fassung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fassung_userId_steuerjahr_nummer_key" ON "Fassung"("userId", "steuerjahr", "nummer");

-- CreateIndex
CREATE INDEX "Fassung_userId_idx" ON "Fassung"("userId");
