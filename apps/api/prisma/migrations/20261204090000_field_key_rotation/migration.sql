-- Rotating the field-encryption key (ADR-0008, REQ-003): `src/prisma/field-key-rotation.ts` rewrites every value
-- under a retired key with the current one. The book's entries, lines and log are append-only (GoBD Rz. 58 ff.,
-- ADR-0101 §13) and refused every UPDATE, so their ciphertext could never move to a new key.
--
-- An UPDATE is now let through when the transaction sets `steuereule.reencryption` to 'on', it does not run as
-- the API's runtime role `steuereule_app` (P11: the API holds the key, so it must not be able to rewrite a booked
-- entry; only the migration login that runs `rotate:field-key` can), AND nothing but the encrypted columns differs. The trigger names those columns (TG_ARGV); `test/field-key-rotation.test.ts` fails
-- when they no longer match the schema's `/// @encrypted` columns of the table. The clear text is unchanged by a
-- re-encryption and the ledger's hash chain is computed over the clear text, so the chain still verifies.
CREATE OR REPLACE FUNCTION steuereule_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') AND current_setting('steuereule.erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND current_setting('steuereule.reencryption', true) = 'on' AND TG_NARGS > 0
     AND current_user <> 'steuereule_app'
     AND (to_jsonb(NEW) - TG_ARGV::text[]) = (to_jsonb(OLD) - TG_ARGV::text[]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append-only: % on "%" is not allowed (GoBD, ADR-0101)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "Buchung_append_only" ON "Buchung";
CREATE TRIGGER "Buchung_append_only" BEFORE UPDATE OR DELETE ON "Buchung"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only('belegnummer', 'belegverweis', 'buchungstext', 'entwurf', 'ustIdNr', 'wiederkehrend');

DROP TRIGGER "Buchungszeile_append_only" ON "Buchungszeile";
CREATE TRIGGER "Buchungszeile_append_only" BEFORE UPDATE OR DELETE ON "Buchungszeile"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only('betrag');

DROP TRIGGER "Buchungsprotokoll_append_only" ON "Buchungsprotokoll";
CREATE TRIGGER "Buchungsprotokoll_append_only" BEFORE UPDATE OR DELETE ON "Buchungsprotokoll"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only('inhalt');
