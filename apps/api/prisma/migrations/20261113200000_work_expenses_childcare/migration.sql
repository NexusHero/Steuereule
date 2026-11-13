-- Further Werbungskosten per person (Anlage N / N-Gre Kz 310, 320, 380) and childcare per child
-- (Anlage Kind Kz 51), ADR-0076. All encrypted at rest.
ALTER TABLE "Arbeitsweg" ADD COLUMN "berufsverbaendeEur" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "berufsverbaendeArt" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "arbeitsmittelEur" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "arbeitsmittelArt" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "kontofuehrungEur" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "sonstigeWerbungskostenEur" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "sonstigeWerbungskostenArt" TEXT;
ALTER TABLE "Kind" ADD COLUMN "betreuungEur" TEXT;
ALTER TABLE "Kind" ADD COLUMN "betreuungDienstleister" TEXT;
ALTER TABLE "Kind" ADD COLUMN "betreuungVon" TEXT;
ALTER TABLE "Kind" ADD COLUMN "betreuungBis" TEXT;
