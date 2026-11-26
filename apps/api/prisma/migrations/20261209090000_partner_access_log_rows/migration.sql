-- Two access-log rows land in another person's trail on purpose, so that person's DSGVO export (Art. 15) shows who
-- touched their data:
-- - a read of Person B's data writes a READ row into B's own trail (P7);
-- - a linked spouse who edits a child of the shared household (decision 7) writes a WRITE row into the household
--   owner's trail.
-- Under `p11_append` a user may append rows under the own id or an own Person B shadow id only, so both were
-- refused. Instead of a system path (which would pass every policy), the policy names exactly this cross-user
-- write: a row marked `partner`, for a partner the coupling joins. `partner_user_ids()` carries the consent rule
-- (Person A reaches Person B only after B agreed; B reaches A), so an uncoupled user, or a row not marked `partner`,
-- is still refused.
DROP POLICY p11_append ON "TaxDataAccessLog";
CREATE POLICY p11_append ON "TaxDataAccessLog" FOR INSERT TO PUBLIC
  WITH CHECK (
    "userId" = (SELECT app_rls.user_id())
    OR app_rls.is_shadow_of_user("userId")
    OR ("source" = 'partner' AND "userId" = ANY ((SELECT app_rls.partner_user_ids())::text[]))
    OR (SELECT app_rls.is_system())
  );
