-- ADR-0090: tax-free employer subsidies to health and care insurance per LStB, Zeile 24. Expand-only, nullable.
ALTER TABLE "Lstb" ADD COLUMN "zuschuesseKvPv" TEXT;
