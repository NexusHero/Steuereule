-- #450 Teil 6F (ADR-0063): church tax withheld per LStB, Zeilen 6 und 7. Expand-only, nullable.
ALTER TABLE "Lstb" ADD COLUMN "kirchensteuer" TEXT;
ALTER TABLE "Lstb" ADD COLUMN "kirchensteuerEhegatte" TEXT;
