-- A read of Person B's data writes a READ row into B's own access trail, so B's DSGVO export (Art. 15) shows who
-- read it (P7). Under `p11_append` a user may append rows under the own id or an own Person B shadow id only, so
-- that row was refused. Instead of a system path (which would pass every policy), the policy names exactly this
-- one cross-user write: a READ row marked `partner`, for a partner the coupling joins. `partner_user_ids()` carries
-- the consent rule (Person A reaches Person B only after B agreed; B reaches A), so an uncoupled user, an action
-- other than READ, or a row not marked `partner` is still refused.
DROP POLICY p11_append ON "TaxDataAccessLog";
CREATE POLICY p11_append ON "TaxDataAccessLog" FOR INSERT TO PUBLIC
  WITH CHECK (
    "userId" = (SELECT app_rls.user_id())
    OR app_rls.is_shadow_of_user("userId")
    OR ("action" = 'READ' AND "source" = 'partner' AND "userId" = ANY ((SELECT app_rls.partner_user_ids())::text[]))
    OR (SELECT app_rls.is_system())
  );
