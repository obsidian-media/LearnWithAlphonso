-- Staff console, phase 1: roles, the action record, restrictions, gifts, notes.
--
--   staff_roles         who is staff and what they may do (admin_users stays the "is staff" allowlist).
--   staff_audit_log     the append-only action record. NO foreign keys: rows outlive the learner and the staff member.
--   user_restrictions   a learner's block (no social features) or ban (no sign-in), with reason and who lifted it.
--   pro_grants          a record of each gifted Pro period (the entitlement itself lives in RevenueCat).
--   staff_notes         internal notes on a learner.
--
-- All five tables: RLS on with zero policies, no client privileges, service_role only. Every write the console makes
-- goes through a SECURITY DEFINER function (search_path = '', EXECUTE for service_role only) so the change and its
-- action-record row commit together or not at all.
--
-- staff_audit_log is INSERT/SELECT only for service_role, and a trigger raises on UPDATE, DELETE and TRUNCATE, so even
-- the table owner cannot rewrite it through SQL in a normal session.
--
-- is_restricted(uid, kind) is also executable by authenticated so RLS policies and RPCs can call it; it returns only
-- a boolean about the id it is given.
--
-- Rollback: DROP FUNCTION public.staff_revoke_sessions(uuid), public.staff_lift_restriction(uuid,text,uuid,text,text),
--   public.staff_set_restriction(uuid,text,uuid,text,text), public.is_restricted(uuid,text),
--   public.staff_record(uuid,text,text,uuid,text,jsonb,jsonb,text);
--   DROP TABLE public.staff_notes, public.pro_grants, public.user_restrictions, public.staff_audit_log,
--   public.staff_roles;

-- client-grants: none public.staff_roles
CREATE TABLE public.staff_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'support', 'support_ai')),
  scopes text[] NOT NULL DEFAULT '{}',
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

-- client-grants: none public.staff_audit_log
CREATE TABLE public.staff_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  request_id text,
  ip_hash text
);
CREATE INDEX staff_audit_log_target_idx ON public.staff_audit_log (target_user_id, id DESC);
CREATE INDEX staff_audit_log_actor_idx ON public.staff_audit_log (actor_user_id, id DESC);
CREATE INDEX staff_audit_log_action_idx ON public.staff_audit_log (action, id DESC);

-- client-grants: none public.user_restrictions
CREATE TABLE public.user_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('block', 'ban')),
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid
);
-- One active restriction of a kind per learner; lifted rows stay on record.
CREATE UNIQUE INDEX user_restrictions_active_idx ON public.user_restrictions (user_id, kind)
  WHERE lifted_at IS NULL;

-- client-grants: none public.pro_grants
CREATE TABLE public.pro_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE INDEX pro_grants_user_idx ON public.pro_grants (user_id, starts_at DESC);

-- client-grants: none public.staff_notes
CREATE TABLE public.staff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_notes_user_idx ON public.staff_notes (user_id, created_at DESC);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_roles, public.staff_audit_log, public.user_restrictions,
  public.pro_grants, public.staff_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_roles, public.user_restrictions, public.pro_grants, public.staff_notes TO service_role;
GRANT SELECT, INSERT ON public.staff_audit_log TO service_role;

-- ---- append-only ----
CREATE FUNCTION public.staff_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'staff_audit_log is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER staff_audit_log_no_change
  BEFORE UPDATE OR DELETE ON public.staff_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_append_only();
CREATE TRIGGER staff_audit_log_no_truncate
  BEFORE TRUNCATE ON public.staff_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.staff_audit_log_append_only();
REVOKE ALL ON FUNCTION public.staff_audit_log_append_only() FROM PUBLIC, anon, authenticated;

-- ---- the writer ----
CREATE FUNCTION public.staff_record(
  p_actor uuid, p_role text, p_action text, p_target uuid, p_reason text,
  p_before jsonb, p_after jsonb, p_request_id text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id bigint;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'staff_record: an action is required' USING ERRCODE = '22023';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('owner', 'support', 'support_ai') THEN
    RAISE EXCEPTION 'staff_record: unknown role' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.staff_audit_log (actor_user_id, actor_role, action, target_user_id, reason, before, after, request_id)
  VALUES (p_actor, p_role, p_action, p_target, p_reason, p_before, p_after, p_request_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_record(uuid, text, text, uuid, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_record(uuid, text, text, uuid, text, jsonb, jsonb, text) TO service_role;

-- ---- restrictions ----
CREATE FUNCTION public.is_restricted(p_user uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = p_user AND r.kind = p_kind AND r.lifted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_restricted(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_restricted(uuid, text) TO authenticated, service_role;

CREATE FUNCTION public.staff_set_restriction(
  p_actor uuid, p_role text, p_target uuid, p_kind text, p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('block', 'ban') THEN
    RAISE EXCEPTION 'staff_set_restriction: kind must be block or ban' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NOT NULL AND p_actor = p_target THEN
    RAISE EXCEPTION 'staff_set_restriction: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'staff_set_restriction: a reason is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_restrictions (user_id, kind, reason, created_by)
  VALUES (p_target, p_kind, btrim(p_reason), p_actor)
  RETURNING id INTO new_id;
  PERFORM public.staff_record(
    p_actor, p_role, 'user.' || p_kind, p_target, btrim(p_reason),
    jsonb_build_object('restricted', false), jsonb_build_object('restricted', true, 'kind', p_kind), NULL);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_restriction(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_restriction(uuid, text, uuid, text, text) TO service_role;

CREATE FUNCTION public.staff_lift_restriction(
  p_actor uuid, p_role text, p_target uuid, p_kind text, p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lifted integer;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('block', 'ban') THEN
    RAISE EXCEPTION 'staff_lift_restriction: kind must be block or ban' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NOT NULL AND p_actor = p_target THEN
    RAISE EXCEPTION 'staff_lift_restriction: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'staff_lift_restriction: a reason is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.user_restrictions
     SET lifted_at = now(), lifted_by = p_actor
   WHERE user_id = p_target AND kind = p_kind AND lifted_at IS NULL;
  GET DIAGNOSTICS lifted = ROW_COUNT;
  IF lifted = 0 THEN
    RAISE EXCEPTION 'staff_lift_restriction: no active % to lift', p_kind USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'user.un' || p_kind, p_target, btrim(p_reason),
    jsonb_build_object('restricted', true, 'kind', p_kind), jsonb_build_object('restricted', false), NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_lift_restriction(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_lift_restriction(uuid, text, uuid, text, text) TO service_role;

-- ---- sessions ----
-- Sign a learner out everywhere now (a ban must not wait for the access token to expire). refresh_tokens.user_id is
-- a varchar in Supabase Auth.
CREATE FUNCTION public.staff_revoke_sessions(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'staff_revoke_sessions: a target is required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_target::text;
  DELETE FROM auth.sessions WHERE user_id = p_target;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_revoke_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_revoke_sessions(uuid) TO service_role;
