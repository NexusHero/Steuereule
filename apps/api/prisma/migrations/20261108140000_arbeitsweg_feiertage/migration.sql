-- Confirmed public holidays on working days and their region (F4).
ALTER TABLE "Arbeitsweg" ADD COLUMN "feiertage" INTEGER;
ALTER TABLE "Arbeitsweg" ADD COLUMN "feiertageRegion" TEXT;
