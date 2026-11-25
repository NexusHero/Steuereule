-- P6 (beta review): account and security. Runs after P11: the data steps below touch tables under forced
-- row-level security, so they run for a named system reason (a non-superuser owner would otherwise change
-- nothing, silently).
SELECT set_config('steuereule.system', 'migration-p6', false);

-- API-1: the device session takes over the approving session's createdAt.
ALTER TABLE "DeviceCode" ADD COLUMN "approvedSessionCreatedAt" TIMESTAMP(3);

-- API-19: requestIp/requestUserAgent are field-encrypted from now on. Codes live two minutes; the ones that
-- expired still hold the address in plaintext and are of no use to anyone.
DELETE FROM "DeviceCode" WHERE "expiresAt" < NOW();

-- API-3 (decision 3): Person B agrees per tax year. The years that exist today were joined by B with a code or
-- created under the link B accepted, and B has seen them shared: they keep that consent. Every year created from
-- now on starts without one, so A sees nothing of B for it until B agrees in B's own app.
ALTER TABLE "SteuerjahrKopplung" ADD COLUMN "personBZustimmungAm" TIMESTAMP(3);
UPDATE "SteuerjahrKopplung"
   SET "personBZustimmungAm" = "updatedAt"
 WHERE "personBUserId" <> '' AND "personBUserId" NOT LIKE 'spouse\_%';

-- API-18: provider tokens of Google/Apple sign-ins are not used and no longer stored.
-- The columns have no default, so DEFAULT clears them; only rows that still hold a token are touched.
UPDATE "Account"
   SET "accessToken" = DEFAULT, "refreshToken" = DEFAULT, "idToken" = DEFAULT,
       "accessTokenExpiresAt" = DEFAULT, "refreshTokenExpiresAt" = DEFAULT
 WHERE "providerId" <> 'credential'
   AND ("accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL OR "idToken" IS NOT NULL);

-- API-3 (decision 3) in the database: Person A reaches Person B's rows only through a joint year B agreed to.
-- The household link alone (PartnerVerknuepfung, which a later year is created from) no longer opens B's rows
-- to A; B keeps reaching A's household through it (ADR-0062 decision 7). Per year is the app's part: B's rows A
-- reads (Profile, Stammdaten) carry no year, so the database grants "some agreed year" and LinkService shows A
-- nothing of B for a year B has not agreed to.
CREATE OR REPLACE FUNCTION app_rls.partner_user_ids() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(array_agg(DISTINCT partner), ARRAY[]::text[]) FROM (
      SELECT l."personBUserId" AS partner FROM "SteuerjahrKopplung" l
        WHERE l."personAUserId" = app_rls.user_id() AND l."personBUserId" <> '' AND l."personBUserId" NOT LIKE 'spouse\_%'
          AND l."personBZustimmungAm" IS NOT NULL
      UNION ALL
      SELECT l."personAUserId" FROM "SteuerjahrKopplung" l WHERE l."personBUserId" = app_rls.user_id()
      UNION ALL
      SELECT p."personANutzerId" FROM "PartnerVerknuepfung" p WHERE p."personBNutzerId" = app_rls.user_id()
    ) partners
  $fn$;

SELECT set_config('steuereule.system', '', false);
