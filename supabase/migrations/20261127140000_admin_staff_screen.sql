-- Admin console rebuild, PR 5 (Staff): what the new Staff screen needs from the database.
--
--   N-10  staff_list_members        NEW. The staff list with each person's sign-in email and last sign-in
--                                   (auth.users.email / last_sign_in_at). SECURITY DEFINER, returns ONLY staff rows
--                                   (a staff_roles row, or an admin_users member with no staff_roles row, the implicit
--                                   owner), and only to an active owner. A person who never signed in has a NULL
--                                   last_sign_in_at (the console says "Never signed in"; no date is invented).
--         staff_add_member        REPLACED (same signature): the actor must be an ACTIVE OWNER in the database (not just
--                                   what the console says), and the role recorded is the database's, not the argument's.
--         staff_update_member     REPLACED (same signature): same actor rule, plus the LAST-OWNER GUARD: a change that
--                                   would leave no active owner (demoting or disabling the only one) is refused. Every
--                                   owner row is locked (FOR UPDATE, fixed order) before the count, so two owners
--                                   demoting each other at the same moment cannot both succeed. A person made an owner
--                                   has their stored scopes cleared (an owner has every scope whatever is stored).
--
-- Unchanged and still enforced here: never your own row, support_ai is not a login, staff.manage only ever belongs to an
-- owner, a reason of 3 to 500 characters, and one staff_audit_log row in the same transaction as the change.
--
-- All SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
-- Depends on 20261113100000 (staff_roles, admin_users, staff_record and the two functions this replaces).
--
-- Rollback: DROP FUNCTION public.staff_list_members(uuid), public.staff_is_active_owner(uuid); then re-run the
--   staff_add_member and staff_update_member definitions from 20261113100000_staff_console.sql.

-- An active owner: an enabled staff_roles row with role owner, or an admin_users member with no staff_roles row.
CREATE FUNCTION public.staff_is_active_owner(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = p_user)
      THEN EXISTS (SELECT 1 FROM public.staff_roles r
                    WHERE r.user_id = p_user AND r.role = 'owner' AND r.disabled_at IS NULL)
    ELSE EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p_user)
  END;
$$;
REVOKE ALL ON FUNCTION public.staff_is_active_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_is_active_owner(uuid) TO service_role;

CREATE FUNCTION public.staff_list_members(p_actor uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  role text,
  scopes text[],
  disabled_at timestamptz,
  added_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.staff_is_active_owner(p_actor) THEN
    RAISE EXCEPTION 'staff_list_members: only an active owner may list staff' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id, p.display_name, u.email::text, m.role, m.scopes, m.disabled_at, m.added_at, u.last_sign_in_at
    FROM (
      SELECT r.user_id, r.role, r.scopes, r.disabled_at, r.added_at FROM public.staff_roles r
      UNION ALL
      SELECT a.user_id, 'owner', '{}'::text[], NULL::timestamptz, a.added_at
        FROM public.admin_users a
       WHERE NOT EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = a.user_id)
    ) m
    LEFT JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
   ORDER BY m.added_at, m.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_list_members(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_members(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_add_member(
  p_actor uuid, p_actor_role text, p_user uuid, p_role text, p_scopes text[], p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.staff_is_active_owner(p_actor) THEN
    RAISE EXCEPTION 'staff_add_member: only an active owner may add staff' USING ERRCODE = '42501';
  END IF;
  IF p_actor = p_user THEN
    RAISE EXCEPTION 'staff_add_member: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF p_role = 'support_ai' THEN
    RAISE EXCEPTION 'support_ai is not a login role' USING ERRCODE = '22023';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('owner', 'support') THEN
    RAISE EXCEPTION 'staff_add_member: role must be owner or support' USING ERRCODE = '22023';
  END IF;
  IF p_role <> 'owner' AND 'staff.manage' = ANY (coalesce(p_scopes, '{}')) THEN
    RAISE EXCEPTION 'staff.manage can only be granted to an owner' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_add_member: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_users (user_id, added_by) VALUES (p_user, p_actor);
  INSERT INTO public.staff_roles (user_id, role, scopes, added_by)
  VALUES (p_user, p_role, CASE WHEN p_role = 'owner' THEN '{}' ELSE coalesce(p_scopes, '{}') END, p_actor);
  PERFORM public.staff_record(
    p_actor, 'owner', 'staff.add', p_user, btrim(p_reason), NULL,
    jsonb_build_object('role', p_role,
      'scopes', CASE WHEN p_role = 'owner' THEN '{}'::text[] ELSE coalesce(p_scopes, '{}') END,
      'disabled', false), NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_add_member(uuid, text, uuid, text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_add_member(uuid, text, uuid, text, text[], text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_update_member(
  p_actor uuid, p_actor_role text, p_user uuid, p_role text, p_scopes text[], p_disabled boolean, p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cur public.staff_roles;
  new_role text;
  new_scopes text[];
  new_disabled boolean;
  was_active_owner boolean;
BEGIN
  IF p_actor = p_user THEN
    RAISE EXCEPTION 'staff_update_member: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF p_role = 'support_ai' THEN
    RAISE EXCEPTION 'support_ai is not a login role' USING ERRCODE = '22023';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('owner', 'support') THEN
    RAISE EXCEPTION 'staff_update_member: role must be owner or support' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_update_member: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  -- Every owner row is locked in a fixed order BEFORE anything is read, so two owners changing each other at the same
  -- moment run one after the other and the second sees the first's result.
  PERFORM 1 FROM public.staff_roles WHERE role = 'owner' ORDER BY user_id FOR UPDATE;
  IF NOT public.staff_is_active_owner(p_actor) THEN
    RAISE EXCEPTION 'staff_update_member: only an active owner may change staff' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cur FROM public.staff_roles WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user) THEN
      INSERT INTO public.staff_roles (user_id, role, scopes, added_by) VALUES (p_user, 'owner', '{}', p_actor)
      RETURNING * INTO cur;
    ELSE
      RAISE EXCEPTION 'staff_update_member: not a staff member' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  new_role := coalesce(p_role, cur.role);
  new_scopes := CASE WHEN new_role = 'owner' THEN '{}'::text[] ELSE coalesce(p_scopes, cur.scopes) END;
  new_disabled := CASE WHEN p_disabled IS NULL THEN cur.disabled_at IS NOT NULL ELSE p_disabled END;
  IF new_role <> 'owner' AND 'staff.manage' = ANY (new_scopes) THEN
    RAISE EXCEPTION 'staff.manage can only be granted to an owner' USING ERRCODE = '42501';
  END IF;
  -- The last-owner guard: this change must not leave the console with no active owner.
  was_active_owner := cur.role = 'owner' AND cur.disabled_at IS NULL;
  IF was_active_owner AND (new_role <> 'owner' OR new_disabled) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_roles r
       WHERE r.user_id <> p_user AND r.role = 'owner' AND r.disabled_at IS NULL
      UNION ALL
      SELECT 1 FROM public.admin_users a
       WHERE a.user_id <> p_user
         AND NOT EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = a.user_id)
    ) THEN
      RAISE EXCEPTION 'staff_update_member: the last active owner cannot be demoted or disabled' USING ERRCODE = '23514';
    END IF;
  END IF;
  UPDATE public.staff_roles
     SET role = new_role,
         scopes = new_scopes,
         disabled_at = CASE WHEN new_disabled THEN coalesce(cur.disabled_at, now()) ELSE NULL END
   WHERE user_id = p_user;
  PERFORM public.staff_record(
    p_actor, 'owner', 'staff.update', p_user, btrim(p_reason),
    jsonb_build_object('role', cur.role, 'scopes', cur.scopes, 'disabled', cur.disabled_at IS NOT NULL),
    jsonb_build_object('role', new_role, 'scopes', new_scopes, 'disabled', new_disabled), NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_update_member(uuid, text, uuid, text, text[], boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_update_member(uuid, text, uuid, text, text[], boolean, text) TO service_role;
