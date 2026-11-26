-- P11: row-level security (finding H2-10, stakeholder decision 7).
--
-- Every table that holds data about a person is ENABLEd and FORCEd for row-level security: a row is visible
-- and writable only when its owner matches the identity the API sets per transaction
-- (`set_config('steuereule.user_id', …, true)`, `apps/api/src/prisma/transaction.ts`), or when the
-- transaction runs for a named system reason (`steuereule.system`, `withSystemDatabaseAccess`). Without
-- either setting the tables answer with no rows and refuse every write (fail closed). FORCE makes the
-- policies bind the table owner too; only a superuser or a BYPASSRLS role passes them.
--
-- The API does not query as the owner: it switches to the role `steuereule_app` at connection start
-- (`options=-c role=steuereule_app` in the URL, `src/config/database-url.ts`). That role owns nothing and has
-- neither SUPERUSER nor BYPASSRLS, so the policies hold in every environment, CI included, even where the
-- login role is the superuser of a container. Migrations and the operator scripts keep the login role; a
-- data migration or backfill under a non-superuser owner (Cloud SQL) sets `steuereule.system` itself.
--
-- `test/row-level-security.lock.test.ts` fails for a Prisma model whose table has no policy here (or in a
-- later migration) and is not listed there as holding no personal data.

-- 1. The runtime role ------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'steuereule_app') THEN
    CREATE ROLE steuereule_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
-- The login role of the API must be allowed to switch to it (Cloud SQL: the creator holds ADMIN on it).
GRANT steuereule_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO steuereule_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO steuereule_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO steuereule_app;
-- Tables and sequences of later migrations (created by this same login role) get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO steuereule_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO steuereule_app;

-- 2. The identity the policies read ----------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_rls;
GRANT USAGE ON SCHEMA app_rls TO steuereule_app;

-- A setting made with `SET LOCAL`/`set_config(…, true)` reads as '' after its transaction ended, not NULL:
-- both mean "no identity", and '' must never match the empty `personBUserId` of a single filer.
CREATE OR REPLACE FUNCTION app_rls.user_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$ SELECT nullif(current_setting('steuereule.user_id', true), '') $fn$;

CREATE OR REPLACE FUNCTION app_rls.is_system() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$ SELECT coalesce(current_setting('steuereule.system', true), '') <> '' $fn$;

-- Person B without an own account, kept by A under `spouse_<A>_<year>` (ADR-0054): A's rows. Compared
-- exactly, so the id of another user that merely starts with A's id never matches.
CREATE OR REPLACE FUNCTION app_rls.is_shadow_of_user(owner text) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$ SELECT owner LIKE 'spouse\_%' AND right(owner, 4) ~ '^[0-9]{4}$' AND owner = 'spouse_' || app_rls.user_id() || '_' || right(owner, 4) $fn$;

-- The accounts coupled with the current user (ADR-0054, ADR-0062): the joint return of a year (either side,
-- B with an own account) and the household link. The app reads and writes the partner's rows today (A shows
-- B's name and master data, B works on A's household and children); which rows and years it may is still the
-- app's decision. Per-year consent (P6, stakeholder decision 3) narrows this one function.
-- The link tables' own policies do not call it, so there is no recursion; it reads them as the caller.
CREATE OR REPLACE FUNCTION app_rls.partner_user_ids() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(array_agg(DISTINCT partner), ARRAY[]::text[]) FROM (
      SELECT l."personBUserId" AS partner FROM "SteuerjahrKopplung" l
        WHERE l."personAUserId" = app_rls.user_id() AND l."personBUserId" <> '' AND l."personBUserId" NOT LIKE 'spouse\_%'
      UNION ALL
      SELECT l."personAUserId" FROM "SteuerjahrKopplung" l WHERE l."personBUserId" = app_rls.user_id()
      UNION ALL
      SELECT p."personBNutzerId" FROM "PartnerVerknuepfung" p WHERE p."personANutzerId" = app_rls.user_id() AND p."personBNutzerId" <> ''
      UNION ALL
      SELECT p."personANutzerId" FROM "PartnerVerknuepfung" p WHERE p."personBNutzerId" = app_rls.user_id()
    ) partners
  $fn$;

-- The owners whose rows the current user reaches: the user and the coupled partners. Called once per query
-- (the policies wrap it in a sub-select, which Postgres runs as an InitPlan), never once per row.
CREATE OR REPLACE FUNCTION app_rls.visible_owners() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$ SELECT CASE WHEN app_rls.user_id() IS NULL THEN ARRAY[]::text[] ELSE app_rls.user_id() || app_rls.partner_user_ids() END $fn$;

-- 3. Tables owned through a person id (`userId`): the person, their Person B shadow rows, their partners --

ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Profile" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "GuestActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestActivity" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "GuestActivity" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "TaxDataAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxDataAccessLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "TaxDataAccessLog" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "TaxYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxYear" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "TaxYear" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "InterviewAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterviewAnswer" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "InterviewAnswer" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "LegalHold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegalHold" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "LegalHold" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Beleg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Beleg" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Beleg" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Lstb" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lstb" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Lstb" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "ChLohnausweis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChLohnausweis" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "ChLohnausweis" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Rente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rente" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Rente" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Kapital" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Kapital" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Kapital" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Vermietungsobjekt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vermietungsobjekt" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Vermietungsobjekt" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Bescheid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bescheid" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Bescheid" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Fassung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fassung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Fassung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Kennzeichnung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Kennzeichnung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Kennzeichnung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Freischaltung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Freischaltung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Freischaltung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Stammdaten" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stammdaten" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Stammdaten" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Kind" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Kind" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Kind" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "EulenEinstellung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EulenEinstellung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "EulenEinstellung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "EulenPersonendatenEinwilligung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EulenPersonendatenEinwilligung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "EulenPersonendatenEinwilligung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "EulenKartenVerwurf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EulenKartenVerwurf" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "EulenKartenVerwurf" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Jahresuebernahme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Jahresuebernahme" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Jahresuebernahme" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Arbeitsweg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Arbeitsweg" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Arbeitsweg" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BeraterNachricht" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BeraterNachricht" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BeraterNachricht" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BeraterGespraech" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BeraterGespraech" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BeraterGespraech" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BeraterNotiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BeraterNotiz" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BeraterNotiz" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "AssistentAufgabe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistentAufgabe" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "AssistentAufgabe" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BeraterInterview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BeraterInterview" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BeraterInterview" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BeraterSituation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BeraterSituation" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BeraterSituation" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "BelegDatei" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BelegDatei" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "BelegDatei" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Betrieb" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Betrieb" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Betrieb" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Buch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Buch" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Buch" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Buchung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Buchung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Buchung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Buchungszeile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Buchungszeile" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Buchungszeile" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Buchungsprotokoll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Buchungsprotokoll" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Buchungsprotokoll" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Anlagegut" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Anlagegut" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Anlagegut" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Kontoumsatz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Kontoumsatz" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Kontoumsatz" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Buchungsregel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Buchungsregel" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Buchungsregel" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

ALTER TABLE "Lohnlauf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lohnlauf" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Lohnlauf" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

-- The account itself: its id is the owner.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "User" FOR ALL TO PUBLIC
  USING ("id" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("id") OR (SELECT app_rls.is_system()))
  WITH CHECK ("id" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("id") OR (SELECT app_rls.is_system()));

-- 4. better-auth and OAuth rows of one account: the account only, never a partner. A row without userId
--    (a device code before approval, a client-credentials token) is reachable by system paths only.

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Session" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Account" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "TwoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactor" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "TwoFactor" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "Passkey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Passkey" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Passkey" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "OauthRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OauthRefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "OauthRefreshToken" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "OauthAccessToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OauthAccessToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "OauthAccessToken" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "OauthConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OauthConsent" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "OauthConsent" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "DeviceCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "DeviceCode" FOR ALL TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

-- A client registered itself (RFC 7591, no userId) is public metadata the consent screen shows to whoever
-- signs in; a client created in a profile is that account's. Only the owner or a system path writes.
ALTER TABLE "OauthClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OauthClient" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner_read ON "OauthClient" FOR SELECT TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR "userId" IS NULL OR (SELECT app_rls.is_system()));
CREATE POLICY p11_owner_insert ON "OauthClient" FOR INSERT TO PUBLIC
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));
CREATE POLICY p11_owner_update ON "OauthClient" FOR UPDATE TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system())) WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));
CREATE POLICY p11_owner_delete ON "OauthClient" FOR DELETE TO PUBLIC
  USING ("userId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

-- better-auth's verification values (sign-up, reset and step-up keys by e-mail or session): no owner
-- column, so only system paths (better-auth, the step-up check) reach them.
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "Verification" FOR ALL TO PUBLIC
  USING ((SELECT app_rls.is_system()))
  WITH CHECK ((SELECT app_rls.is_system()));

-- 5. The couple and the household --------------------------------------------------------------------

-- Each side of a coupling reads and writes it. Redeeming an invitation code finds person A's row: a system path.
ALTER TABLE "SteuerjahrKopplung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SteuerjahrKopplung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "SteuerjahrKopplung" FOR ALL TO PUBLIC
  USING ("personAUserId" = (SELECT app_rls.user_id()) OR "personBUserId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("personAUserId" = (SELECT app_rls.user_id()) OR "personBUserId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

ALTER TABLE "PartnerVerknuepfung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerVerknuepfung" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "PartnerVerknuepfung" FOR ALL TO PUBLIC
  USING ("personANutzerId" = (SELECT app_rls.user_id()) OR "personBNutzerId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()))
  WITH CHECK ("personANutzerId" = (SELECT app_rls.user_id()) OR "personBNutzerId" = (SELECT app_rls.user_id()) OR (SELECT app_rls.is_system()));

-- Person A's household; a linked spouse with an own account shares it (ADR-0062 decision 7).
ALTER TABLE "HaushaltPerson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HaushaltPerson" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "HaushaltPerson" FOR ALL TO PUBLIC
  USING ("haushaltNutzerId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("haushaltNutzerId") OR (SELECT app_rls.is_system()) OR "verknuepftesKonto" = (SELECT app_rls.user_id()))
  WITH CHECK ("haushaltNutzerId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("haushaltNutzerId") OR (SELECT app_rls.is_system()) OR "verknuepftesKonto" = (SELECT app_rls.user_id()));

ALTER TABLE "HaushaltDublette" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HaushaltDublette" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "HaushaltDublette" FOR ALL TO PUBLIC
  USING ("haushaltNutzerId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("haushaltNutzerId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("haushaltNutzerId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("haushaltNutzerId") OR (SELECT app_rls.is_system()));

-- Through its person: visible exactly when the HaushaltPerson row is (its own policy applies in the sub-select).
ALTER TABLE "HaushaltJahr" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HaushaltJahr" FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_owner ON "HaushaltJahr" FOR ALL TO PUBLIC
  USING (EXISTS (SELECT 1 FROM "HaushaltPerson" p WHERE p."id" = "personId") OR (SELECT app_rls.is_system()))
  WITH CHECK (EXISTS (SELECT 1 FROM "HaushaltPerson" p WHERE p."id" = "personId") OR (SELECT app_rls.is_system()));
