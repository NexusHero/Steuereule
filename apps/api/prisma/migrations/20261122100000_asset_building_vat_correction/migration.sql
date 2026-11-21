-- ADR-0101 §22 (statute check, research §13): the facts of a building in the business assets (§ 7 Abs. 4, 5a
-- EStG) and the Vorsteuerberichtigung of an asset (§ 15a UStG), both JSON, field-encrypted. Additive.
ALTER TABLE "Anlagegut" ADD COLUMN "gebaeude" TEXT;
ALTER TABLE "Anlagegut" ADD COLUMN "vorsteuerberichtigung" TEXT;
