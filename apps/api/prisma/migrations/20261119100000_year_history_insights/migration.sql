-- ADR-0099: Verlauf — Hinweise, Lebensereignisse, Gruppen. Additive only; no existing value changes.

-- AlterTable: „Schon abgegeben?“ for a year without data (§1).
ALTER TABLE "TaxYear"
  ADD COLUMN "abgabeAnderswo" TEXT,
  ADD COLUMN "abgabeAnderswoAm" TEXT;

-- AlterTable: the employer on the Lohnsteuerbescheinigung (§8), encrypted by the app.
ALTER TABLE "Lstb" ADD COLUMN "arbeitgeber" TEXT;

-- AlterTable: a stable key per rental object, its purchase date and the repairs of the year (§8).
ALTER TABLE "Vermietungsobjekt"
  ADD COLUMN "objektKennung" TEXT,
  ADD COLUMN "anschaffungsdatum" TEXT,
  ADD COLUMN "erhaltungsaufwand" TEXT;
-- Every existing row is its own object: the rows of earlier years were never linked, so nothing can be
-- told apart better than one key each (the Jahresübernahme carries the key from now on).
UPDATE "Vermietungsobjekt" SET "objektKennung" = gen_random_uuid()::text WHERE "objektKennung" IS NULL;
ALTER TABLE "Vermietungsobjekt" ALTER COLUMN "objektKennung" SET NOT NULL;

-- AlterTable: date and outcome of an Einspruch (§8).
ALTER TABLE "Bescheid"
  ADD COLUMN "einspruchDatum" TEXT,
  ADD COLUMN "einspruchErgebnis" TEXT,
  ADD COLUMN "einspruchBetrag" TEXT;
