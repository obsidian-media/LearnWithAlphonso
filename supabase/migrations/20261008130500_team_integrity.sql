-- W7, owner scope addition 2026-10-07: team integrity.
--   3. leave_team let the owner leave and orphaned the team. Now ONE trigger (team_after_member_removed) covers
--      leave, kick, switching teams and account deletion: when the removed member owned the team, or the team had
--      no owner, the earliest joiner becomes owner; when nobody is left, the team is closed. leave_team says which.
--   4. get_my_team paid "last week's winner" even when every team earned 0 XP. Now only a team with XP > 0 wins.
--   5. Join codes were base64 (could contain + / =, unsafe in a URL). New codes are 8 Crockford base32 characters
--      (no I, L, O, U); join_team reads them case-insensitively, ignores spaces and hyphens, and maps O->0, I/L->1.
--      Existing codes in another format are replaced (1 team in production at authoring, with no members).
--
-- Rollback (one transaction): DROP TRIGGER team_after_member_removed ON public.team_members;
--   DROP FUNCTION public._team_after_member_removed(), public._new_join_code(); then re-run _join_team_impl and
--   get_my_team from 20261006170000_fix_team_joins_and_course_aware_payouts.sql, create_team from
--   20260930060000_fix_create_team_gen_random_bytes_regression.sql, auto_join_team from
--   20260929020002_fix_team_gen_random_bytes_schema.sql, join_team and leave_team from 20260922040000_teams.sql.
--   Replaced join codes and deleted empty teams are not restored.

CREATE OR REPLACE FUNCTION public._new_join_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea;
  code text;
BEGIN
  FOR attempt IN 1..10 LOOP
    bytes := extensions.gen_random_bytes(8);
    code := '';
    FOR i IN 0..7 LOOP
      -- 256 is a multiple of 32, so byte % 32 is uniform.
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.join_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'could not mint a unique team join code';
END;
$$;

-- From 20261006170000; added: the "already on this team" no-op at the top.
CREATE OR REPLACE FUNCTION public._join_team_impl(_team_id uuid, _me uuid)
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  current_count integer;
  existing_joined_at timestamptz;
  recently_kicked_at timestamptz;
BEGIN
  -- Already on this team: nothing to do. Re-inserting the row would fire team_after_member_removed and hand the
  -- team to someone else, or close it.
  IF EXISTS (SELECT 1 FROM public.team_members m WHERE m.user_id = _me AND m.team_id = _team_id) THEN
    RETURN QUERY SELECT true, NULL::text, _team_id;
    RETURN;
  END IF;

  SELECT joined_at INTO existing_joined_at FROM public.team_members WHERE user_id = _me;
  IF existing_joined_at IS NOT NULL AND existing_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  SELECT tk.kicked_at INTO recently_kicked_at FROM public.team_kicks tk WHERE tk.user_id = _me;
  IF recently_kicked_at IS NOT NULL AND recently_kicked_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked', NULL::uuid;
    RETURN;
  END IF;

  PERFORM 1 FROM public.team_members WHERE team_members.team_id = _team_id FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.team_members WHERE team_members.team_id = _team_id;
  SELECT member_cap INTO cap FROM public.teams WHERE id = _team_id;
  IF cap IS NULL THEN
    RETURN QUERY SELECT false, 'team-not-found', NULL::uuid;
    RETURN;
  END IF;
  IF current_count >= cap THEN
    RETURN QUERY SELECT false, 'team-full', NULL::uuid;
    RETURN;
  END IF;

  DELETE FROM public.team_members WHERE user_id = _me;
  INSERT INTO public.team_members (team_id, user_id) VALUES (_team_id, _me);
  RETURN QUERY SELECT true, NULL::text, _team_id;
END;
$$;

-- From 20260930060000 (which kept 20260930030000's blocked-content check); changed: the join code.
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
  clean_name text := public.moderation_clean_text(_name);
  name_problem text := public.team_name_problem(_name);
  new_id uuid;
  new_code text;
  join_result record;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  -- The display-name rules ('invalid-name' or 'blocked-content'); the stored name is the cleaned one.
  IF name_problem IS NOT NULL THEN
    RETURN QUERY SELECT false, name_problem, NULL::uuid, NULL::text;
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

  new_code := public._new_join_code();
  INSERT INTO public.teams (name, join_code, visibility, member_cap, created_by)
  VALUES (clean_name, new_code, _visibility, _member_cap, me)
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

-- From 20260929020002; changed: the join code.
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
  join_result record;
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
    VALUES (public._random_team_name(), public._new_join_code(), 'public', me)
    RETURNING id INTO new_id;
    target := new_id;
  END IF;

  SELECT * INTO join_result FROM public._join_team_impl(target, me);
  -- A refused join (switch or kick lock) must not leave the team created above behind, empty.
  IF NOT join_result.ok AND new_id IS NOT NULL THEN
    DELETE FROM public.teams t WHERE t.id = new_id;
  END IF;
  RETURN QUERY SELECT join_result.ok, join_result.reason, join_result.team_id;
END;
$$;

-- From 20260922040000; changed: the typed code is normalized.
CREATE OR REPLACE FUNCTION public.join_team(_code text)
RETURNS TABLE(ok boolean, reason text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  target uuid;
  typed text := translate(upper(regexp_replace(coalesce(_code, ''), '[\s-]', '', 'g')), 'OIL', '011');
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;
  SELECT t.id INTO target FROM public.teams t WHERE t.join_code = typed OR t.join_code = _code LIMIT 1;
  IF target IS NULL THEN
    RETURN QUERY SELECT false, 'invalid-code', NULL::uuid;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._join_team_impl(target, me);
END;
$$;

CREATE OR REPLACE FUNCTION public._team_after_member_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_owner uuid;
  heir uuid;
BEGIN
  SELECT t.created_by INTO current_owner FROM public.teams t WHERE t.id = OLD.team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL; -- the team itself is being deleted (admin disband, cascade)
  END IF;
  IF current_owner IS NOT NULL AND current_owner <> OLD.user_id THEN
    RETURN NULL; -- an ordinary member left
  END IF;
  SELECT m.user_id INTO heir FROM public.team_members m
  WHERE m.team_id = OLD.team_id
  ORDER BY m.joined_at, m.user_id
  LIMIT 1;
  IF heir IS NULL THEN
    DELETE FROM public.teams t WHERE t.id = OLD.team_id;
  ELSE
    UPDATE public.teams t SET created_by = heir WHERE t.id = OLD.team_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS team_after_member_removed ON public.team_members;
CREATE TRIGGER team_after_member_removed
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public._team_after_member_removed();

-- From 20260922040000; added: the owner's leave reports whether the team was handed on or closed.
CREATE OR REPLACE FUNCTION public.leave_team()
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  my_joined_at timestamptz;
  current_owner uuid;
  others integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;
  SELECT m.team_id, m.joined_at INTO my_team, my_joined_at FROM public.team_members m WHERE m.user_id = me;
  IF my_team IS NULL THEN
    RETURN QUERY SELECT false, 'not-on-a-team';
    RETURN;
  END IF;
  IF my_joined_at > now() - interval '7 days' THEN
    RETURN QUERY SELECT false, 'switch-locked';
    RETURN;
  END IF;
  SELECT t.created_by INTO current_owner FROM public.teams t WHERE t.id = my_team FOR UPDATE;
  SELECT count(*) INTO others FROM public.team_members m WHERE m.team_id = my_team AND m.user_id <> me;
  DELETE FROM public.team_members m WHERE m.user_id = me; -- team_after_member_removed does the rest
  IF current_owner IS DISTINCT FROM me THEN
    RETURN QUERY SELECT true, NULL::text;
  ELSIF others = 0 THEN
    RETURN QUERY SELECT true, 'team-disbanded';
  ELSE
    RETURN QUERY SELECT true, 'ownership-transferred';
  END IF;
END;
$$;

-- From 20261006170000; changed: HAVING ... > 0, so no team "wins" a week in which nobody earned XP.
CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TABLE(
  team_id uuid, name text, join_code text, joined_at timestamptz,
  switch_locked_until timestamptz, this_week_xp integer, is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  my_joined_at timestamptz;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  prev_wk date := wk - 7;
  winner_team uuid;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT tm.team_id, tm.joined_at INTO my_team, my_joined_at
  FROM public.team_members tm WHERE tm.user_id = me;

  IF my_team IS NULL THEN
    RETURN;
  END IF;

  SELECT t.id INTO winner_team
  FROM public.teams t
  JOIN public.team_members tm2 ON tm2.team_id = t.id
  GROUP BY t.id
  HAVING COALESCE(SUM(public.weekly_xp(tm2.user_id, prev_wk)), 0) > 0
  ORDER BY COALESCE(SUM(public.weekly_xp(tm2.user_id, prev_wk)), 0) DESC, t.id
  LIMIT 1;

  IF winner_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_weekly_rewards rw WHERE rw.team_id = winner_team AND rw.week_start = prev_wk
  ) THEN
    INSERT INTO public.team_weekly_rewards (team_id, week_start, resolved_at)
    VALUES (winner_team, prev_wk, now())
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE public.language_progress lp
      SET xp = lp.xp + 100
      FROM public.team_members tm3
      WHERE tm3.team_id = winner_team
        AND lp.user_id = tm3.user_id
        AND lp.language = (
          SELECT lc.language FROM public.lesson_completions lc
          WHERE lc.user_id = tm3.user_id ORDER BY lc.completed_at DESC LIMIT 1
        );
    END IF;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.join_code, my_joined_at,
         my_joined_at + interval '7 days',
         COALESCE(SUM(public.weekly_xp(tm.user_id, wk)), 0)::int,
         (t.created_by = me)
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = my_team
  GROUP BY t.id, t.name, t.join_code, t.created_by;
END;
$$;

-- Data: URL-safe codes everywhere, a member-owner for every team with members (covers NULL owners and owners who
-- already left under the old leave_team), no empty teams.
UPDATE public.teams t SET join_code = public._new_join_code() WHERE t.join_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$';
UPDATE public.teams t
SET created_by = h.user_id
FROM (
  SELECT DISTINCT ON (m.team_id) m.team_id, m.user_id
  FROM public.team_members m
  ORDER BY m.team_id, m.joined_at, m.user_id
) h
WHERE h.team_id = t.id
  AND (t.created_by IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.team_id = t.id AND m.user_id = t.created_by));
DELETE FROM public.teams t WHERE NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.team_id = t.id);

REVOKE ALL ON FUNCTION public._new_join_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._new_join_code() TO service_role;
REVOKE ALL ON FUNCTION public._team_after_member_removed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._join_team_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_team(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.auto_join_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_join_team() TO authenticated;
REVOKE ALL ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;

