-- Production bug fix (found while validating a separate finding during
-- the 2026-09-26 pre-launch security review): create_team and
-- auto_join_team both call gen_random_bytes(6) to mint a team's
-- join_code, but both also `SET search_path = public`, and pgcrypto
-- (which provides gen_random_bytes) is installed in the `extensions`
-- schema on this project, not `public` -- confirmed via the platform's
-- own extension listing. Every call to either function currently fails
-- with "function gen_random_bytes(integer) does not exist" before it
-- ever reaches its own INSERT, so no team could be created through
-- either path (confirmed live: POST /rest/v1/rpc/create_team returns a
-- 404 with exactly that error). team_members has zero rows in
-- production today partly because of this.
--
-- gen_random_uuid() elsewhere in these same files is unaffected -- it's
-- a Postgres core builtin since PG13, not part of pgcrypto, so it
-- resolves under any search_path.
--
-- Schema-qualifying the one call site each function actually needs,
-- rather than widening search_path to include `extensions` -- a
-- narrower fix with no risk of accidentally resolving some other
-- function differently than intended.
CREATE OR REPLACE FUNCTION public.create_team(
  _name text,
  _visibility text DEFAULT 'public',
  _member_cap integer DEFAULT 30
)
RETURNS TABLE(ok boolean, reason text, team_id uuid, join_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  trimmed_name text := trim(_name);
  new_id uuid;
  new_code text;
  join_result record;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF char_length(trimmed_name) < 1 OR char_length(trimmed_name) > 40 THEN
    RETURN QUERY SELECT false, 'invalid-name', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _visibility NOT IN ('public', 'private') THEN
    RETURN QUERY SELECT false, 'invalid-visibility', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _member_cap < 2 OR _member_cap > 200 THEN
    RETURN QUERY SELECT false, 'invalid-member-cap', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  new_code := encode(extensions.gen_random_bytes(6), 'base64');
  INSERT INTO public.teams (name, join_code, visibility, member_cap, created_by)
  VALUES (trimmed_name, new_code, _visibility, _member_cap, me)
  RETURNING id INTO new_id;

  SELECT * INTO join_result FROM public._join_team_impl(new_id, me);
  IF NOT join_result.ok THEN
    DELETE FROM public.teams WHERE id = new_id;
    RETURN QUERY SELECT false, join_result.reason, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, new_id, new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_join_team()
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  target uuid;
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;

  SELECT t.id INTO target
  FROM public.teams t
  WHERE t.visibility = 'public'
    AND (SELECT count(*) FROM public.team_members tm WHERE tm.team_id = t.id) < t.member_cap
  ORDER BY random()
  LIMIT 1;

  IF target IS NULL THEN
    INSERT INTO public.teams (name, join_code, visibility, created_by)
    VALUES (public._random_team_name(), encode(extensions.gen_random_bytes(6), 'base64'), 'public', me)
    RETURNING id INTO new_id;
    target := new_id;
  END IF;

  RETURN QUERY SELECT * FROM public._join_team_impl(target, me);
END;
$$;
