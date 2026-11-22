-- Admin console rebuild, PR 7 (Audit, "Action record"): what the new screen needs from the database.
--
--   N-9  staff_audit_actors   NEW. The people who appear as an actor in the action record, for the Actor filter, with
--                             their display name and CURRENT role. Readable by anyone with audit.read (the scope is
--                             enforced in the server function; this function takes no argument and only service_role can
--                             run it), so unlike staff_list_members it does not need an owner.
--
-- Staff only: an actor is listed only when they are CURRENTLY a staff member (a staff_roles row, or an admin_users member
-- with no staff_roles row, the implicit owner). A row whose actor is not staff (a former member, or an id that is not
-- one) is simply not offered as a filter choice; its entries stay in the record. No email, no learner field, and no
-- count is returned: only user_id, display_name, role and whether the person is suspended.
--
-- SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
-- Depends on 20261113100000 (staff_audit_log, staff_roles, admin_users).
--
-- Rollback: DROP FUNCTION public.staff_audit_actors();

CREATE FUNCTION public.staff_audit_actors()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  role text,
  disabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.user_id, p.display_name, m.role, m.disabled
    FROM (
      SELECT r.user_id, r.role, r.disabled_at IS NOT NULL AS disabled
        FROM public.staff_roles r
      UNION ALL
      SELECT a.user_id, 'owner'::text, false
        FROM public.admin_users a
       WHERE NOT EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = a.user_id)
    ) m
    LEFT JOIN public.profiles p ON p.id = m.user_id
   WHERE EXISTS (SELECT 1 FROM public.staff_audit_log l WHERE l.actor_user_id = m.user_id)
   ORDER BY lower(coalesce(p.display_name, '')), m.user_id;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_actors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_audit_actors() TO service_role;
