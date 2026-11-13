-- N-Gre Zeile 20 (employer Überobligatorium, from the employer total) and Zeilen 9/76 (tax-free Krankentaggeld), ADR-0072.
ALTER TABLE "ChLohnausweis" ADD COLUMN "pkArbeitgeberGesamtChf" TEXT;
ALTER TABLE "ChLohnausweis" ADD COLUMN "steuerfreiesKrankentaggeldChf" TEXT;
