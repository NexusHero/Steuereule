-- Expand-only (ADR-0055): nullable column, no backfill, old code keeps working.
ALTER TABLE "TaxDataAccessLog" ADD COLUMN "detail" TEXT;
