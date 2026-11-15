-- ADR-0092: whose a document is. Expand-only, two nullable columns; `inhaber` is field-encrypted.
ALTER TABLE "Beleg" ADD COLUMN "inhaber" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "inhaberSteuerjahr" INTEGER;
