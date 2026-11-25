-- The role model of row-level security (P11), made independent of role names and of a connection option.
--
-- Until now the API logged in as the owner of the tables and switched to `steuereule_app` with a connection
-- option. Whoever held the API's database password could leave the option out and act as the owner: drop a
-- policy, disable row-level security, or rewrite the book's append-only rows through the re-encryption
-- exception. The API now has a login of its own, created by the migrate job (scripts/runtime-database-login.mjs):
-- member of `steuereule_app` and of nothing else, owner of nothing. This migration closes what the database
-- itself decides.

-- 1. Only the owner of an append-only table may re-encrypt it. The exception used to exclude one role by name
--    (`current_user <> 'steuereule_app'`), which lets every other role through, the API's own login included.
--    `pg_has_role(…, 'USAGE')` is true for the owner, for a role that inherits from it and for a superuser.
CREATE OR REPLACE FUNCTION steuereule_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') AND current_setting('steuereule.erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NULL;
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

-- 2. Nobody but the owner creates objects next to the tables or next to the functions the policies call
--    (PostgreSQL before 15 let every role create in `public`).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA app_rls FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM steuereule_app;
REVOKE CREATE ON SCHEMA app_rls FROM steuereule_app;
