-- Review of the beta readiness (decision 3, API-3): Person A reaches Person B's rows of a year only when B agreed
-- to that year. The P6 version of `partner_user_ids()` let A reach every row of B once B had agreed to any joint
-- year. Tables whose rows carry a tax year (`steuerjahr`) now ask for the agreed year itself; tables without one
-- (Profile, Stammdaten, the owl settings …) keep "some agreed year", and the app shows A nothing of B for a year
-- without consent on both kinds (`couplingVisibleTo`). Person B reaches Person A's rows of every year, as before
-- (ADR-0062 decision 7): B's consent is B's to give. A withdrawal (DELETE …/kopplung/zustimmung) clears
-- `personBZustimmungAm`, which these functions read on every query, so it holds from the next statement on.
--
-- Both functions are STABLE and called through a sub-select, so Postgres evaluates each once per query
-- (an InitPlan), not once per row, as `visible_owners()` is.

-- The owners whose rows of every year the user reaches: the user, and the Person A of every joint year or
-- household the user is Person B in.
CREATE OR REPLACE FUNCTION app_rls.all_year_owners() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$
    SELECT CASE WHEN app_rls.user_id() IS NULL THEN ARRAY[]::text[] ELSE app_rls.user_id() || coalesce((
      SELECT array_agg(DISTINCT partner) FROM (
        SELECT l."personAUserId" AS partner FROM "SteuerjahrKopplung" l WHERE l."personBUserId" = app_rls.user_id()
        UNION ALL
        SELECT p."personANutzerId" FROM "PartnerVerknuepfung" p WHERE p."personBNutzerId" = app_rls.user_id()
      ) partners), ARRAY[]::text[]) END
  $fn$;

-- The years of a Person B with an own account that B agreed to share with the user (Person A), as
-- '<owner>:<year>' keys. A shadow Person B (`spouse_…`) is A's own record and is matched by is_shadow_of_user.
CREATE OR REPLACE FUNCTION app_rls.agreed_partner_years() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(array_agg(l."personBUserId" || ':' || l."steuerjahr"), ARRAY[]::text[]) FROM "SteuerjahrKopplung" l
     WHERE l."personAUserId" = app_rls.user_id() AND length(l."personBUserId") > 0 AND l."personBUserId" NOT LIKE 'spouse\_%'
       AND l."personBZustimmungAm" IS NOT NULL
  $fn$;


-- Tables with a tax year: the agreed year, not some agreed year.
DROP POLICY p11_owner ON "TaxYear";
CREATE POLICY p11_owner ON "TaxYear" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "InterviewAnswer";
CREATE POLICY p11_owner ON "InterviewAnswer" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Beleg";
CREATE POLICY p11_owner ON "Beleg" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Lstb";
CREATE POLICY p11_owner ON "Lstb" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "ChLohnausweis";
CREATE POLICY p11_owner ON "ChLohnausweis" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Rente";
CREATE POLICY p11_owner ON "Rente" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Kapital";
CREATE POLICY p11_owner ON "Kapital" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Vermietungsobjekt";
CREATE POLICY p11_owner ON "Vermietungsobjekt" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Bescheid";
CREATE POLICY p11_owner ON "Bescheid" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Fassung";
CREATE POLICY p11_owner ON "Fassung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Kennzeichnung";
CREATE POLICY p11_owner ON "Kennzeichnung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Freischaltung";
CREATE POLICY p11_owner ON "Freischaltung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Kind";
CREATE POLICY p11_owner ON "Kind" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "EulenKartenVerwurf";
CREATE POLICY p11_owner ON "EulenKartenVerwurf" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Jahresuebernahme";
CREATE POLICY p11_owner ON "Jahresuebernahme" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Arbeitsweg";
CREATE POLICY p11_owner ON "Arbeitsweg" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "BeraterNachricht";
CREATE POLICY p11_owner ON "BeraterNachricht" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "BeraterGespraech";
CREATE POLICY p11_owner ON "BeraterGespraech" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "BeraterNotiz";
CREATE POLICY p11_owner ON "BeraterNotiz" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "AssistentAufgabe";
CREATE POLICY p11_owner ON "AssistentAufgabe" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "BeraterInterview";
CREATE POLICY p11_owner ON "BeraterInterview" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Betrieb";
CREATE POLICY p11_owner ON "Betrieb" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Buch";
CREATE POLICY p11_owner ON "Buch" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Buchung";
CREATE POLICY p11_owner ON "Buchung" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Buchungszeile";
CREATE POLICY p11_owner ON "Buchungszeile" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Buchungsprotokoll";
CREATE POLICY p11_owner ON "Buchungsprotokoll" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Anlagegut";
CREATE POLICY p11_owner ON "Anlagegut" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Kontoumsatz";
CREATE POLICY p11_owner ON "Kontoumsatz" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Lohnlauf";
CREATE POLICY p11_owner ON "Lohnlauf" FOR ALL TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()))
  WITH CHECK ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));
