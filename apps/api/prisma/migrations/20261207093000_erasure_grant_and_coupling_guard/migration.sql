-- Two decisions move from settings any login can make into the database itself (security review of PR #581).
--
-- 1. Erasing the book. The append-only triggers let a DELETE through when the transaction had set
--    `steuereule.erasure` to 'on', which every login can do, the API's own included: whoever held the runtime
--    password could delete booked entries that are under a legal hold (GoBD, § 147 AO). A DELETE now needs a
--    grant that only `app_rls.allow_erasure(owners)` can write: a definer-rights function owned by the
--    migration login, which refuses while the tax data of one of the owners is under a legal hold, and which
--    names the owners whose rows this transaction may delete. The setting is no longer read.
--    An empty book (no entry, no log record, no bank transaction) holds no GoBD record and may be deleted
--    without a grant (a further business removed again, H2-8).
--
-- 2. Who becomes Person B. `app_rls.agreed_partner_years()` and the household link trust the coupling rows:
--    a Person A who could write `personBUserId = <someone>` or the consent column would reach that person's
--    rows. Setting an own-account Person B (not '' and not a shadow id) or changing B's consent is now allowed
--    only to Person B herself or to a named system path (redeeming an invitation, the next year of a household
--    link, the household link of a consented year, erasure, the guest takeover).

-- 1. The erasure grant ---------------------------------------------------------------------------------------
CREATE TABLE app_rls.erasure_grant (
  txid       bigint      NOT NULL,
  owner_ids  text[]      NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erasure_grant_txid ON app_rls.erasure_grant (txid);
REVOKE ALL ON app_rls.erasure_grant FROM PUBLIC;
-- The triggers run as the caller and read the grant; only the definer function below writes it.
GRANT SELECT ON app_rls.erasure_grant TO steuereule_app;

CREATE OR REPLACE FUNCTION app_rls.allow_erasure(owner_ids text[]) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  -- LegalHold is under forced row-level security, which binds this function's owner too: it reads the holds
  -- of every owner it is asked about, for this one reason and only while it runs.
  SET steuereule.system = 'allow-erasure'
  AS $fn$
  BEGIN
    IF owner_ids IS NULL OR coalesce(array_length(owner_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'allow_erasure: name the owners whose rows may be deleted';
    END IF;
    IF EXISTS (SELECT 1 FROM public."LegalHold" h WHERE h."userId" = ANY (owner_ids) AND h."resource" = 'taxData' AND h."holdUntil" > now()) THEN
      RAISE EXCEPTION 'erasure refused: the tax data are under a legal hold (GoBD, § 147 AO)' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    DELETE FROM app_rls.erasure_grant WHERE created_at < now() - interval '1 hour';
    INSERT INTO app_rls.erasure_grant (txid, owner_ids) VALUES (txid_current(), owner_ids);
  END
  $fn$;
REVOKE ALL ON FUNCTION app_rls.allow_erasure(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rls.allow_erasure(text[]) TO steuereule_app;

-- Whether this transaction may delete a row of `owner`.
CREATE OR REPLACE FUNCTION app_rls.erasure_granted(owner text) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $fn$ SELECT EXISTS (SELECT 1 FROM app_rls.erasure_grant g WHERE g.txid = txid_current() AND owner = ANY (g.owner_ids)) $fn$;

CREATE OR REPLACE FUNCTION steuereule_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND app_rls.erasure_granted(OLD."userId") THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND current_setting('steuereule.reencryption', true) = 'on' AND TG_NARGS > 0
     AND pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'USAGE')
     AND (to_jsonb(NEW) - TG_ARGV::text[]) = (to_jsonb(OLD) - TG_ARGV::text[]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append-only: % on "%" is not allowed (GoBD, ADR-0101)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION steuereule_ledger_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app_rls.erasure_granted(OLD."userId") THEN RETURN OLD; END IF;
    -- An empty book holds no record the GoBD keep.
    IF NOT EXISTS (SELECT 1 FROM "Buchung" e WHERE e."buchId" = OLD."id")
       AND NOT EXISTS (SELECT 1 FROM "Buchungsprotokoll" l WHERE l."buchId" = OLD."id")
       AND NOT EXISTS (SELECT 1 FROM "Kontoumsatz" t WHERE t."buchId" = OLD."id") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'append-only: DELETE on "Buch" is not allowed (GoBD, ADR-0101)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."userId" <> OLD."userId" OR NEW."steuerjahr" <> OLD."steuerjahr" OR NEW."person" <> OLD."person"
     OR NEW."kontenrahmen" <> OLD."kontenrahmen" OR NEW."gewinnermittlung" <> OLD."gewinnermittlung" THEN
    RAISE EXCEPTION 'append-only: a book keeps its owner, year, chart and mode (ADR-0101)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."festgeschriebenBis" IS NOT NULL
     AND (NEW."festgeschriebenBis" IS NULL OR NEW."festgeschriebenBis" < OLD."festgeschriebenBis") THEN
    RAISE EXCEPTION 'append-only: the Festschreibung of "Buch" only moves forward (GoBD Rz. 107)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. The coupling guard --------------------------------------------------------------------------------------
-- TG_ARGV[0]: the Person B column; TG_ARGV[1] (optional): B's consent column.
CREATE OR REPLACE FUNCTION app_rls.guard_person_b() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $fn$
  DECLARE
    new_b text := to_jsonb(NEW) ->> TG_ARGV[0];
    old_b text := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ->> TG_ARGV[0] END;
  BEGIN
    -- No Person B, or a shadow B (Person A's own record): nothing of another account is reached.
    IF new_b IS NULL OR new_b = '' OR new_b LIKE 'spouse\_%' THEN RETURN NEW; END IF;
    IF (SELECT app_rls.is_system()) OR new_b = app_rls.user_id() THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' OR new_b IS DISTINCT FROM old_b THEN
      RAISE EXCEPTION 'only Person B or a named system path sets an own-account Person B on "%"', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_NARGS > 1 AND (to_jsonb(NEW) ->> TG_ARGV[1]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[1]) THEN
      RAISE EXCEPTION 'only Person B gives or withdraws her consent on "%"', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $fn$;

CREATE TRIGGER "SteuerjahrKopplung_person_b_guard" BEFORE INSERT OR UPDATE ON "SteuerjahrKopplung"
  FOR EACH ROW EXECUTE FUNCTION app_rls.guard_person_b('personBUserId', 'personBZustimmungAm');
CREATE TRIGGER "PartnerVerknuepfung_person_b_guard" BEFORE INSERT OR UPDATE ON "PartnerVerknuepfung"
  FOR EACH ROW EXECUTE FUNCTION app_rls.guard_person_b('personBNutzerId');
