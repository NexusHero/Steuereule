-- A way to work with its period, and a second one after a change of job (ADR-0079).
ALTER TABLE "Arbeitsweg" ADD COLUMN "zeitraumVon" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zeitraumBis" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegKm" INTEGER;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegVerkehrsmittel" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegOrt" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegVon" TEXT;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegBis" TEXT;
