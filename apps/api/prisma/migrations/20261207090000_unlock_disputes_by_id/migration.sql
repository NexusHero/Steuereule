-- A payment can be disputed more than once. The row kept one dispute state, and a won dispute never reopened,
-- so a second, distinct dispute after a won one left the year unlocked while the money was contested again.
-- Each dispute is now stored by the provider's id ("anfechtungen": {"dp_…": "offen" | "gewonnen"}); the year
-- is locked while any of them is open (`unlock/unlock-lifecycle.ts`). A dispute stored before ids were kept
-- becomes "legacy"; the next won dispute of the row closes it.
--
-- "Freischaltung" is under forced row-level security (P11): the backfill runs for a named system reason.
SELECT set_config('steuereule.system', 'migration-unlock-disputes-by-id', false);

ALTER TABLE "Freischaltung" ADD COLUMN "anfechtungen" JSONB NOT NULL DEFAULT '{}';
UPDATE "Freischaltung" SET "anfechtungen" = jsonb_build_object('legacy', "anfechtung") WHERE "anfechtung" IN ('offen', 'gewonnen');
ALTER TABLE "Freischaltung" DROP COLUMN "anfechtung";

SELECT set_config('steuereule.system', '', false);
