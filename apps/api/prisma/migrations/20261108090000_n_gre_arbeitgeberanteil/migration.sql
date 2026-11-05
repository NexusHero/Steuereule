-- N-Gre Zeilen 18/19, 95–98: who pays the Krankentaggeld / NBUV premium.
ALTER TABLE "ChLohnausweis" ADD COLUMN "krankentaggeldArbeitgeberProzent" TEXT;
ALTER TABLE "ChLohnausweis" ADD COLUMN "krankentaggeldArbeitgeberChf" TEXT;
ALTER TABLE "ChLohnausweis" ADD COLUMN "nbuvArbeitgeberProzent" TEXT;
ALTER TABLE "ChLohnausweis" ADD COLUMN "nbuvArbeitgeberChf" TEXT;
