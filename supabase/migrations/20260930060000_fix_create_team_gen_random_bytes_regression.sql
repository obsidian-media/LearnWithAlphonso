-- Found via a third-party audit (Codex), verified directly against the
-- live database before touching anything: 20260930030000_ugc_content_filter.sql
-- re-published create_team (to add the blocked-content check) by copying
-- its OLD body verbatim, from before 20260929020002_fix_team_gen_random_bytes_schema.sql
-- schema-qualified its one gen_random_bytes(6) call -- silently
-- reintroducing the exact bug that migration fixed. Confirmed live: the
-- deployed public.create_team's source currently calls unqualified
-- gen_random_bytes(6) while still declaring SET search_path = public,
-- and pgcrypto (which provides gen_random_bytes) is confirmed installed
-- in the `extensions` schema, not `public`, on this project -- so every
-- call fails with "function gen_random_bytes(integer) does not exist"
-- before it ever reaches its own INSERT. Team creation is broken in
-- production right now.
--
-- auto_join_team (same two migrations' sibling function) was NOT
-- touched by the UGC filter migration and is confirmed still correctly
-- schema-qualified live -- this regression is scoped to create_team only.
--
-- Identical to 20260930030000's create_team definition, with the one
-- call site re-qualified. Everything else (the blocked-content check,
-- validation order, error shapes) is unchanged.
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
  IF public.contains_blocked_term(trimmed_name) THEN
    RETURN QUERY SELECT false, 'blocked-content', NULL::uuid, NULL::text;
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
    -- Only ever reachable via the switch-lock branch -- a brand-new team
    -- has zero members, so current_count(0) < member_cap always holds.
    DELETE FROM public.teams WHERE id = new_id;
    RETURN QUERY SELECT false, join_result.reason, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, new_id, new_code;
END;
$$;
