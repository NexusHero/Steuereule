-- ADR-0101 §22: the counterparty's foreign VAT id on an entry (Zusammenfassende Meldung, § 18a UStG) and
-- the person's Voranmeldung facts (period, Dauerfristverlängerung), the sale or giving up of the business
-- (§ 16, § 34 EStG) and the Thesaurierung (§ 34a EStG) on the business profile, and the payroll runs of the
-- business's employees. Additive.
ALTER TABLE "Buchung" ADD COLUMN "ustIdNr" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "ustVaAngaben" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "veraeusserung" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "thesaurierung" TEXT;

CREATE TABLE "Lohnlauf" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "person" TEXT NOT NULL DEFAULT 'A',
    "betrieb" INTEGER NOT NULL DEFAULT 1,
    "monat" INTEGER NOT NULL,
    "art" TEXT NOT NULL,
    "arbeitnehmer" TEXT NOT NULL,
    "betraege" TEXT NOT NULL,
    "buchungsnummer" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lohnlauf_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lohnlauf_userId_steuerjahr_person_betrieb_idx" ON "Lohnlauf"("userId", "steuerjahr", "person", "betrieb");
