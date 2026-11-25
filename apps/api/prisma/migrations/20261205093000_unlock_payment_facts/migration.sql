-- The payment provider delivers its events in no guaranteed order and more than once. A refund that arrived
-- before the completion event used to be dropped, and the completion then unlocked a refunded payment; a
-- redelivered "dispute opened" after a won dispute locked a paying customer out. The row now stores each fact
-- once (`unlock/unlock-lifecycle.ts`) and its status is computed from all of them.
--
-- "Freischaltung" is under forced row-level security (P11): the backfill runs for a named system reason, as a
-- non-superuser owner would otherwise change nothing.
SELECT set_config('steuereule.system', 'migration-unlock-payment-facts', false);

ALTER TABLE "Freischaltung" ADD COLUMN "erstattetAm" TIMESTAMP(3),
ADD COLUMN "anfechtung" TEXT;

UPDATE "Freischaltung" SET "erstattetAm" = "updatedAt" WHERE "status" = 'erstattet';
UPDATE "Freischaltung" SET "anfechtung" = 'offen' WHERE "status" = 'angefochten';

SELECT set_config('steuereule.system', '', false);
