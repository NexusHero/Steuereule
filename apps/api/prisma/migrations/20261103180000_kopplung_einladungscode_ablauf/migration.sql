-- AlterTable
ALTER TABLE "SteuerjahrKopplung" ADD COLUMN "einladungsCodeGueltigBis" TIMESTAMP(3);

-- Codes minted before this column existed get the same 14-day window from now on.
UPDATE "SteuerjahrKopplung" SET "einladungsCodeGueltigBis" = CURRENT_TIMESTAMP + INTERVAL '14 days' WHERE "einladungsCode" IS NOT NULL;
