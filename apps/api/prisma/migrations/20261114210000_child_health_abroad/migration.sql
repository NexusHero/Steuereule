-- ADR-0090: whether the child's health insurance is foreign (e.g. Swiss basic insurance), so the printout
-- uses Anlage Kind Kz 89 instead of Kz 66/67. Expand-only, nullable.
ALTER TABLE "Kind" ADD COLUMN "kvAusland" BOOLEAN;
