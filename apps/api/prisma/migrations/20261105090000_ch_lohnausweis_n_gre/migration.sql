-- AlterTable
ALTER TABLE "ChLohnausweis" ADD COLUMN "arbeitgeberName" TEXT,
ADD COLUMN "arbeitgeberStrasse" TEXT,
ADD COLUMN "arbeitgeberPlzOrt" TEXT,
ADD COLUMN "familienzulagenChf" TEXT,
ADD COLUMN "krankentaggeldChf" TEXT,
ADD COLUMN "pkArbeitnehmerChf" TEXT,
ADD COLUMN "pkArbeitgeberChf" TEXT,
ADD COLUMN "nGreSonderfaelle" BOOLEAN;
