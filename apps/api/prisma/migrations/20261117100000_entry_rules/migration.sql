-- ADR-0093: fixed entry rules. Expand-only, every column nullable (ADR-0055).
-- LStB Zeilen 22–27 line by line, Zeile 24c and Zeile 5.
ALTER TABLE "Lstb" ADD COLUMN "rvArbeitnehmer" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "rvArbeitgeber" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "kvArbeitnehmer" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "pvArbeitnehmer" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "avArbeitnehmer" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "zuschussPv" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "solidaritaetszuschlag" TEXT;
-- Swiss health insurance: supplementary part, entitlement to subsidies, family allowance inside Ziffer 8.
ALTER TABLE "ChLohnausweis" ADD COLUMN "krankenkasseZusatzChf" TEXT;
ALTER TABLE "ChLohnausweis" ADD COLUMN "kvZuschussAnspruch" BOOLEAN;
ALTER TABLE "ChLohnausweis" ADD COLUMN "familienzulagenImBruttolohn" BOOLEAN;
-- Way to work: days actually travelled and the shortest-route confirmation, per way.
ALTER TABLE "Arbeitsweg" ADD COLUMN "fahrtage" INTEGER;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegFahrtage" INTEGER;
ALTER TABLE "Arbeitsweg" ADD COLUMN "kuerzesteStreckeBestaetigt" BOOLEAN;
ALTER TABLE "Arbeitsweg" ADD COLUMN "zweiterWegKuerzesteStreckeBestaetigt" BOOLEAN;
