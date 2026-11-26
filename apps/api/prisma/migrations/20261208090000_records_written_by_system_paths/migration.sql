-- Three tables hold records about a person that the person must not be able to change through the app
-- (security review of PR #581). Under `p11_owner FOR ALL` a request of the owner, or of a coupled partner,
-- could delete its own legal hold (and so unblock the erasure of held rows), set an unlock to paid, or rewrite
-- its access log. Reading stays as it was; writing is narrowed:
--
-- - LegalHold (P7): written only by named system paths: the payment webhook, the submission's hold of the
--   version in force ('legal-hold'), the account deletion and the lifecycle sweeps.
-- - Freischaltung (unlock): written only by named system paths: the checkout that opens a session
--   ('checkout-session'), the payment webhook, the account deletion, the guest takeover.
-- - TaxDataAccessLog (REQ-004): append-only for the user. A request may add an entry under its own id (every
--   write of the app appends one in its own transaction); only a system path changes or deletes entries (the
--   account deletion tombstones them, the sweeps delete old ones, the guest takeover moves them).

DROP POLICY p11_owner ON "LegalHold";
CREATE POLICY p11_read ON "LegalHold" FOR SELECT TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));
CREATE POLICY p11_system_write ON "LegalHold" FOR INSERT TO PUBLIC WITH CHECK ((SELECT app_rls.is_system()));
CREATE POLICY p11_system_update ON "LegalHold" FOR UPDATE TO PUBLIC USING ((SELECT app_rls.is_system())) WITH CHECK ((SELECT app_rls.is_system()));
CREATE POLICY p11_system_delete ON "LegalHold" FOR DELETE TO PUBLIC USING ((SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "Freischaltung";
CREATE POLICY p11_read ON "Freischaltung" FOR SELECT TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.all_year_owners())::text[]) OR ("userId" || ':' || "steuerjahr") = ANY ((SELECT app_rls.agreed_partner_years())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));
CREATE POLICY p11_system_write ON "Freischaltung" FOR INSERT TO PUBLIC WITH CHECK ((SELECT app_rls.is_system()));
CREATE POLICY p11_system_update ON "Freischaltung" FOR UPDATE TO PUBLIC USING ((SELECT app_rls.is_system())) WITH CHECK ((SELECT app_rls.is_system()));
CREATE POLICY p11_system_delete ON "Freischaltung" FOR DELETE TO PUBLIC USING ((SELECT app_rls.is_system()));

DROP POLICY p11_owner ON "TaxDataAccessLog";
CREATE POLICY p11_read ON "TaxDataAccessLog" FOR SELECT TO PUBLIC
  USING ("userId" = ANY ((SELECT app_rls.visible_owners())::text[]) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));
-- Own id or a Person B shadow id the user keeps (A's writes for B log under B's shadow id).
CREATE POLICY p11_append ON "TaxDataAccessLog" FOR INSERT TO PUBLIC
  WITH CHECK ("userId" = (SELECT app_rls.user_id()) OR app_rls.is_shadow_of_user("userId") OR (SELECT app_rls.is_system()));
CREATE POLICY p11_system_update ON "TaxDataAccessLog" FOR UPDATE TO PUBLIC USING ((SELECT app_rls.is_system())) WITH CHECK ((SELECT app_rls.is_system()));
CREATE POLICY p11_system_delete ON "TaxDataAccessLog" FOR DELETE TO PUBLIC USING ((SELECT app_rls.is_system()));
