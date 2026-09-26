-- Let people create a team (BACKLOG §0.0o item 2). League/Season/Teams
-- all offer to join or auto-match into a team; nothing originates one.
-- Mirrors join_open_duel_queue's shape: SECURITY DEFINER, validates its
-- own input (this is the first RPC that inserts a *user-supplied* team
-- name -- auto_join_team only ever inserts _random_team_name()'s output),
-- and routes the actual membership write through _join_team_impl so
-- creating a team can't be used to dodge the 7-day switch lock that
-- join_team/join_public_team/auto_join_team already enforce.
--
-- Founder-deletion decision (explicitly asked for by the task): the team
-- survives its founder. teams.created_by is already ON DELETE SET NULL
-- (20260922040000_teams.sql), not CASCADE -- only team_members cascades,
-- so a deleted founder simply leaves the team like anyone else via
-- leave_team would. There is no ownership/admin concept on team_members
-- to transfer, and every other member already has an equal ability to
-- leave without dissolving the team, so a solo founder disappearing is
-- not a special case -- it's the same "member leaves" the schema already
-- handles. Not changed by this migration; documented here because this
-- is the migration that makes it possible to reach that state for the
-- first time (a team that could actually be created, not just
-- auto-generated).
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

  new_code := encode(gen_random_bytes(6), 'base64');
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

REVOKE ALL ON FUNCTION public.create_team(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text, text, integer) TO authenticated;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_name_length_chk
  CHECK (char_length(name) BETWEEN 1 AND 40) NOT VALID;

-- ---------- join_code exposure fix ----------
-- teams_select_all (USING (true)) has been harmless until now because
-- every existing team is 'public' -- no code path could ever create a
-- 'private' one, so there was no join_code worth hiding. create_team
-- above is the first path that can. A private team's whole point is
-- "only people I hand the code to can join," so any authenticated user
-- being able to `GET /rest/v1/teams?select=join_code` and read it
-- defeats that immediately. RLS is row-level, not column-level, and every
-- other column (name, visibility, member_cap, created_by) is fine to
-- keep world-readable (same exposure public teams already had), so this
-- narrows column privileges instead of rewriting the row policy: revoke
-- the whole-table SELECT grant and re-grant every column except
-- join_code. SECURITY DEFINER functions (get_my_team, join_team, this
-- file's create_team) are unaffected -- they run as the function owner,
-- not as `authenticated`, so they still return join_code to the one
-- caller who's supposed to see it (a member, via get_my_team; the
-- creator, via this function's own return value).
REVOKE SELECT ON public.teams FROM authenticated;
GRANT SELECT (id, name, visibility, member_cap, created_by, created_at) ON public.teams TO authenticated;
