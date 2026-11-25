-- Beta review (API-24, decision 2): the legal holds for what was paid or submitted before the holds existed.
-- P7 creates a hold when a payment is confirmed and when a version is submitted; rows from before that
-- migration had none, so an account deletion would have removed them. Same periods as account/legal-hold.prisma.ts:
-- a payment 8 years from the end of its calendar year (German time), a submitted version 4 years from the end of
-- the year it was submitted in. Rows that already have a hold keep it.
--
-- "LegalHold" is under forced row-level security: the inserts run for a named system reason.
SELECT set_config('steuereule.system', 'migration-legal-hold-backfill', false);

-- A payment that happened stays a record after a refund or a dispute. The refund date is not stored; the last
-- change of a refunded row is the refund, and the hold counts from the later of the two years.
INSERT INTO "LegalHold" ("id", "userId", "resource", "resourceId", "reason", "holdUntil", "createdAt")
SELECT gen_random_uuid()::text, f."userId", 'unlock', f."id", '§ 147 AO, § 257 HGB',
       make_timestamp(
         GREATEST(
           EXTRACT(YEAR FROM (COALESCE(f."bezahltAm", f."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin'))::int,
           CASE WHEN f."status" = 'erstattet'
                THEN EXTRACT(YEAR FROM (f."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin'))::int
                ELSE 0 END
         ) + 8 + 1, 1, 1, 0, 0, 0),
       NOW()
  FROM "Freischaltung" f
 WHERE f."status" IN ('bezahlt', 'erstattet', 'angefochten')
ON CONFLICT ("resource", "resourceId") DO NOTHING;

-- One version per tax year is in force ("Fassung"); the year is the one of the day the user gave.
INSERT INTO "LegalHold" ("id", "userId", "resource", "resourceId", "reason", "holdUntil", "createdAt")
SELECT gen_random_uuid()::text, v."userId", 'filingVersion', v."id", '§ 169, § 170 AO',
       make_timestamp(
         CASE WHEN v."eingereichtAm" ~ '^\d{4}' AND left(v."eingereichtAm", 4)::int >= 2000
              THEN left(v."eingereichtAm", 4)::int
              ELSE EXTRACT(YEAR FROM (v."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin'))::int END
         + 4 + 1, 1, 1, 0, 0, 0),
       NOW()
  FROM "Fassung" v
ON CONFLICT ("resource", "resourceId") DO NOTHING;

SELECT set_config('steuereule.system', '', false);
