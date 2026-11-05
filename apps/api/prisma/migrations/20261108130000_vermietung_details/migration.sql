-- Anlage V: Umlagen (Z. 20), Schuldzinsen (Z. 46/48), Wohneinheiten (Z. 13), Anteil Person A (Z. 86).
ALTER TABLE "Vermietungsobjekt" ADD COLUMN "umlagen" TEXT;
ALTER TABLE "Vermietungsobjekt" ADD COLUMN "schuldzinsen" TEXT;
ALTER TABLE "Vermietungsobjekt" ADD COLUMN "einheiten" TEXT;
ALTER TABLE "Vermietungsobjekt" ADD COLUMN "anteilA" TEXT;
