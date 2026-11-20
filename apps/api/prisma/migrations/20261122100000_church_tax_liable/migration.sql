-- ADR-0052 amendment 3: liable to church tax or not, without the confession.
ALTER TABLE "Stammdaten" ADD COLUMN "kirchensteuerpflichtig" BOOLEAN;
