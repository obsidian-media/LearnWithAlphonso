-- Restriction enforcement (staff console phase 1): a learner with an active block or ban (user_restrictions, written by
-- the staff console) does not appear to other learners and cannot act toward them. Their own learning keeps working.
--
-- Enforced in the database, on every surface where one learner sees or reaches another, because the native apps read
-- some of them directly. The list is src/lib/social-surfaces.ts; src/lib/restriction-enforcement.test.ts EXECUTES each
-- entry as seeded users and fails if a function or policy that references blocked_users is missing from it.
--
-- Two rules, applied with public.is_social_restricted(uid) (block OR ban):
--   Hidden:  rows about a restricted learner are left out of what everyone else reads (friends, leaderboards and league
--            standing, team members and team XP, buddy requests and the buddy, buddy messages, duels, friend invite
--            previews, friend activity, raw friendships and team_members rows).
--   Refused: a restricted learner cannot make friends, challenge or accept duels, join the open duel queue, request
--            or accept a buddy, join the buddy pool, send a buddy message, join or form a team, kick a team member,
--            or nudge a friend. Refusals reuse the answers every client already renders ('blocked', 'matching_off',
--            'team-not-found', 'not_paired', ...); a restricted learner on the other side reads as an unknown party.
--
-- Not changed (aggregates or ids only, no name or progress of a restricted learner): team mission totals, own-row
-- policies on duels, buddy_pairs, buddy_requests and buddy_messages.
--
-- Every function below is the CURRENT definition (from the migration history up to 20261113100000) with the checks
-- added; signatures, grants and security settings are unchanged (CREATE OR REPLACE keeps grants).
-- Depends on 20261113100000 (is_restricted).
--
-- Rollback: re-apply the previous definitions from the migrations that last defined each function (named in
-- src/lib/social-surfaces.ts) and the previous policies; DROP FUNCTION public.is_social_restricted(uuid).

CREATE FUNCTION public.is_social_restricted(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_restricted(p_user, 'block') OR public.is_restricted(p_user, 'ban');
$$;
REVOKE ALL ON FUNCTION public.is_social_restricted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_social_restricted(uuid) TO authenticated, service_role;

-- ---- policies ----
DROP POLICY IF EXISTS "friend_activity_readable_by_friends" ON public.friend_activity_events;
CREATE POLICY "friend_activity_readable_by_friends" ON public.friend_activity_events
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR (
      EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.user_id = (select auth.uid())
          AND f.friend_id = friend_activity_events.user_id
          AND f.status = 'accepted'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
        WHERE (bu.blocker = (select auth.uid()) AND bu.blocked = friend_activity_events.user_id)
           OR (bu.blocker = friend_activity_events.user_id AND bu.blocked = (select auth.uid()))
      )
      AND NOT public.is_social_restricted(friend_activity_events.user_id)
    )
  );

DROP POLICY IF EXISTS "nudges_insert_to_friend" ON public.nudges;
CREATE POLICY "nudges_insert_to_friend" ON public.nudges
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = (select auth.uid())
        AND f.friend_id = nudges.recipient_id
        AND f.status = 'accepted'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = (select auth.uid()) AND bu.blocked = nudges.recipient_id)
         OR (bu.blocker = nudges.recipient_id AND bu.blocked = (select auth.uid()))
    )
    AND NOT public.is_social_restricted((select auth.uid()))
    AND NOT public.is_social_restricted(nudges.recipient_id)
  );

DROP POLICY IF EXISTS "team_members_select_own_team" ON public.team_members;
CREATE POLICY "team_members_select_own_team" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    team_id = (SELECT _my_team_id())
    AND (user_id = (select auth.uid()) OR NOT public.is_social_restricted(user_id))
  );

DROP POLICY IF EXISTS "fr_view_own" ON public.friendships;
CREATE POLICY "fr_view_own" ON public.friendships
  FOR SELECT TO authenticated
  USING (
    ((select auth.uid()) = user_id)
    OR ((select auth.uid()) = friend_id AND NOT public.is_social_restricted(user_id))
  );

-- ---- functions ----
CREATE OR REPLACE FUNCTION public.accept_friend_invite(_code text)
 RETURNS TABLE(ok boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _inviter_id uuid;
BEGIN
  IF _me IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated';
    RETURN;
  END IF;

  SELECT user_id INTO _inviter_id FROM public.friend_invite_codes WHERE code = _code;
  IF _inviter_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid-code';
    RETURN;
  END IF;
  IF _inviter_id = _me THEN
    RETURN QUERY SELECT false, 'cannot invite yourself';
    RETURN;
  END IF;
  -- A restricted account cannot make friends; a restricted inviter reads as an unknown code (no oracle).
  IF public.is_social_restricted(_me) THEN
    RETURN QUERY SELECT false, 'blocked';
    RETURN;
  END IF;
  IF public.is_social_restricted(_inviter_id) THEN
    RETURN QUERY SELECT false, 'invalid-code';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker = _me AND blocked = _inviter_id)
       OR (blocker = _inviter_id AND blocked = _me)
  ) THEN
    RETURN QUERY SELECT false, 'blocked';
    RETURN;
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (_me, _inviter_id, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (_inviter_id, _me, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  RETURN QUERY SELECT true, 'friends';
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_friend_invite(_code text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_invite(_code text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_duel(_opponent_id uuid, _course text DEFAULT 'en'::text)
 RETURNS TABLE(ok boolean, reason text, duel_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid;
    RETURN;
  END IF;
  IF _opponent_id = me THEN
    RETURN QUERY SELECT false, 'cannot-duel-yourself', NULL::uuid;
    RETURN;
  END IF;
  IF public.is_social_restricted(me) OR public.is_social_restricted(_opponent_id) THEN
    RETURN QUERY SELECT false, 'blocked', NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker = me AND blocked = _opponent_id)
       OR (blocker = _opponent_id AND blocked = me)
  ) THEN
    RETURN QUERY SELECT false, 'blocked', NULL::uuid;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id = me AND friend_id = _opponent_id AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT false, 'not-friends', NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.duels
    WHERE status IN ('pending', 'active')
      AND ((challenger_id = me AND opponent_id = _opponent_id) OR (challenger_id = _opponent_id AND opponent_id = me))
  ) THEN
    RETURN QUERY SELECT false, 'duel-already-open', NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.duels (challenger_id, opponent_id, course)
  VALUES (me, _opponent_id, _course)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT true, NULL::text, new_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_duel(_opponent_id uuid, _course text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_duel(_opponent_id uuid, _course text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_duel(_duel_id uuid, _accept boolean, _duration_days integer DEFAULT 3)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  d public.duels;
  my_xp integer;
  opp_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;

  SELECT * INTO d FROM public.duels WHERE id = _duel_id AND opponent_id = me AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not-found';
    RETURN;
  END IF;

  IF NOT _accept THEN
    UPDATE public.duels SET status = 'declined' WHERE id = _duel_id;
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;

  IF public.is_social_restricted(me) OR public.is_social_restricted(d.challenger_id) THEN
    RETURN QUERY SELECT false, 'blocked';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker = me AND blocked = d.challenger_id)
       OR (blocker = d.challenger_id AND blocked = me)
  ) THEN
    RETURN QUERY SELECT false, 'blocked';
    RETURN;
  END IF;

  SELECT xp INTO my_xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course;
  SELECT xp INTO opp_xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course;

  UPDATE public.duels SET
    status = 'active',
    opponent_xp_start = COALESCE(my_xp, 0),
    challenger_xp_start = COALESCE(opp_xp, 0),
    -- Clamped 1-14 days -- no reward is tied to duration (winner_id is
    -- bragging rights only, no XP/hearts payout), so this isn't a trust
    -- boundary, just basic product sanity against a degenerate value.
    ends_at = now() + make_interval(days => GREATEST(1, LEAST(_duration_days, 14)))
    WHERE id = _duel_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.respond_to_duel(_duel_id uuid, _accept boolean, _duration_days integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_duel(_duel_id uuid, _accept boolean, _duration_days integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean DEFAULT true)
 RETURNS TABLE(matched boolean, duel_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  my_level text;
  candidate_user uuid;
  levels text[] := ARRAY['A1', 'A2', 'B1', 'B2', 'C1'];
  new_duel_id uuid;
  my_xp integer;
  candidate_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  -- The owner's switch, and accounts kept out of contact with strangers.
  IF NOT coalesce((SELECT bs.open_duels_enabled FROM public.buddy_settings bs WHERE bs.id), false)
     OR EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = me)
     OR public.is_social_restricted(me) THEN
    DELETE FROM public.duel_queue WHERE user_id = me;
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  SELECT lp.cefr_level INTO my_level FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  my_level := COALESCE(my_level, 'A1');

  DELETE FROM public.duel_queue WHERE queued_at < now() - interval '10 minutes';

  SELECT dq.user_id INTO candidate_user
  FROM public.duel_queue dq
  WHERE dq.course = _course
    AND dq.user_id != me
    AND (
      (_match_by_level AND dq.match_by_level AND
        abs(array_position(levels, dq.cefr_level) - array_position(levels, my_level)) <= 1)
      OR NOT _match_by_level
      OR NOT dq.match_by_level
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = me AND bu.blocked = dq.user_id)
         OR (bu.blocker = dq.user_id AND bu.blocked = me)
    )
    AND NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = dq.user_id)
    AND NOT public.is_social_restricted(dq.user_id)
  ORDER BY dq.queued_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF candidate_user IS NOT NULL THEN
    DELETE FROM public.duel_queue WHERE user_id = candidate_user;
    DELETE FROM public.duel_queue WHERE user_id = me;

    SELECT xp INTO my_xp FROM public.language_progress WHERE user_id = me AND language = _course;
    SELECT xp INTO candidate_xp FROM public.language_progress WHERE user_id = candidate_user AND language = _course;

    INSERT INTO public.duels (challenger_id, opponent_id, course, status, challenger_xp_start, opponent_xp_start, ends_at)
    VALUES (me, candidate_user, _course, 'active', COALESCE(my_xp, 0), COALESCE(candidate_xp, 0), now() + interval '3 days')
    RETURNING id INTO new_duel_id;
    RETURN QUERY SELECT true, new_duel_id;
    RETURN;
  END IF;

  INSERT INTO public.duel_queue (user_id, course, cefr_level, match_by_level)
  VALUES (me, _course, my_level, _match_by_level)
  ON CONFLICT (user_id) DO UPDATE SET course = _course, cefr_level = my_level, match_by_level = _match_by_level, queued_at = now();
  RETURN QUERY SELECT false, NULL::uuid;
END;
$function$;
REVOKE ALL ON FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_buddy(_friend uuid)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
  reverse_id uuid;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  IF _friend IS NULL OR _friend = me THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  -- Serialise with the friend asking back at the same moment: the second asker then sees the first request and pairs.
  PERFORM public._lock_buddy_users(me, _friend);
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.user_id = me AND f.friend_id = _friend AND f.status = 'accepted'
  ) THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  IF public.is_social_restricted(me) OR public.is_social_restricted(_friend) THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = _friend) OR (b.blocker = _friend AND b.blocked = me))
  THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN RETURN QUERY SELECT 'already_paired'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _friend) THEN RETURN QUERY SELECT 'friend_paired'::text; RETURN; END IF;

  -- They already asked me: asking back is a yes.
  SELECT br.id INTO reverse_id FROM public.buddy_requests br
    WHERE br.from_user = _friend AND br.to_user = me AND br.status = 'pending' FOR UPDATE;
  IF reverse_id IS NOT NULL THEN
    result := public._create_buddy_pair(me, _friend, 'friend');
    IF result = 'paired' THEN
      UPDATE public.buddy_requests br SET status = 'accepted', responded_at = now() WHERE br.id = reverse_id;
    END IF;
    RETURN QUERY SELECT result; RETURN;
  END IF;

  INSERT INTO public.buddy_requests (from_user, to_user) VALUES (me, _friend) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN QUERY SELECT 'already_requested'::text; RETURN; END IF;
  RETURN QUERY SELECT 'requested'::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_buddy(_friend uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_buddy(_friend uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._create_buddy_pair(_x uuid, _y uuid, _source text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  pid uuid;
BEGIN
  PERFORM public._lock_buddy_users(_x, _y);
  -- Re-checked under the lock: a block or unfriend that committed while we waited must win. A matched pair (opt-in
  -- pool) is between learners who are not friends, so only friend pairs need the friendship.
  IF _source = 'friend' AND NOT EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = _x AND f.friend_id = _y AND f.status = 'accepted') THEN
    RETURN 'not_friends';
  END IF;
  IF public.is_social_restricted(_x) OR public.is_social_restricted(_y) THEN
    RETURN 'blocked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = _x AND b.blocked = _y) OR (b.blocker = _y AND b.blocked = _x)) THEN
    RETURN 'blocked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN RETURN 'already_paired'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _y) THEN RETURN 'friend_paired'; END IF;
  BEGIN
    INSERT INTO public.buddy_pairs (user_a, user_b, source) VALUES (least(_x, _y), greatest(_x, _y), _source)
      RETURNING id INTO pid;
    INSERT INTO public.buddy_members (user_id, pair_id) VALUES (_x, pid), (_y, pid);
  EXCEPTION WHEN unique_violation THEN
    -- a pairing with a third person (which holds a different lock pair) won the race; this block's inserts are rolled back
    RETURN CASE WHEN EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN 'already_paired' ELSE 'friend_paired' END;
  END;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending' AND (br.from_user IN (_x, _y) OR br.to_user IN (_x, _y));
  -- Paired people are no longer looking (whichever way they paired).
  DELETE FROM public.buddy_pool bpl WHERE bpl.user_id IN (_x, _y);
  RETURN 'paired';
END;
$function$;
REVOKE ALL ON FUNCTION public._create_buddy_pair(_x uuid, _y uuid, _source text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_buddy_pool(_course text, _age_confirmed boolean)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
  mine text;
  candidate uuid;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;

  -- An excluded account (the App Review demo account) is never offered to a real learner: it gets the same
  -- answer as when matching is switched off, which every app build already renders.
  IF EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = me) OR public.is_social_restricted(me) THEN
    RETURN QUERY SELECT 'matching_off'::text; RETURN;
  END IF;

  -- Rate limit: every call counts, refused ones included, so a client looping on an error is throttled too.
  DELETE FROM public.buddy_pool_attempts a WHERE a.user_id = me AND a.attempted_at < now() - interval '1 day';
  INSERT INTO public.buddy_pool_attempts (user_id) VALUES (me);
  IF (SELECT count(*) FROM public.buddy_pool_attempts a
      WHERE a.user_id = me AND a.attempted_at > now() - interval '1 hour') > 20 THEN
    RETURN QUERY SELECT 'too_many_tries'::text; RETURN;
  END IF;

  IF NOT coalesce(_age_confirmed, false) THEN
    RETURN QUERY SELECT 'age_required'::text; RETURN;
  END IF;
  -- A durable record of the declared-age confirmation.
  INSERT INTO public.buddy_age_confirmations AS c (user_id) VALUES (me)
    ON CONFLICT (user_id) DO UPDATE SET last_confirmed_at = now(), confirmations = c.confirmations + 1;

  IF NOT coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false) THEN
    RETURN QUERY SELECT 'matching_off'::text; RETURN;
  END IF;
  SELECT lp.cefr_level INTO mine FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  IF _course IS NULL OR _course NOT IN ('en', 'fr', 'es') OR mine IS NULL THEN
    RETURN QUERY SELECT 'not_studying'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN
    RETURN QUERY SELECT 'already_paired'::text; RETURN;
  END IF;
  -- At most 3 new matches per rolling 7 days.
  IF (SELECT count(*) FROM public.buddy_pairs bp
      WHERE bp.source = 'match' AND (bp.user_a = me OR bp.user_b = me) AND bp.created_at > now() - interval '7 days') >= 3 THEN
    RETURN QUERY SELECT 'match_limit'::text; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:pool', 0));
  SELECT p.user_id INTO candidate FROM public.buddy_pool p
    WHERE p.course = _course
      AND p.user_id <> me
      AND NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = p.user_id)
      AND NOT public.is_social_restricted(p.user_id)
      AND abs(public._cefr_rank(p.cefr_level) - public._cefr_rank(mine)) <= 1
      AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = p.user_id) OR (b.blocker = p.user_id AND b.blocked = me))
      AND NOT EXISTS (
        SELECT 1 FROM public.buddy_pairs past
        WHERE past.user_a = least(me, p.user_id) AND past.user_b = greatest(me, p.user_id)
      )
      AND NOT EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = p.user_id)
      AND (SELECT count(*) FROM public.buddy_pairs bp2
           WHERE bp2.source = 'match' AND (bp2.user_a = p.user_id OR bp2.user_b = p.user_id)
             AND bp2.created_at > now() - interval '7 days') < 3
    ORDER BY p.joined_at
    LIMIT 1;

  IF candidate IS NOT NULL THEN
    result := public._create_buddy_pair(me, candidate, 'match');
    IF result = 'paired' THEN RETURN QUERY SELECT 'paired'::text; RETURN; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('buddy:' || me::text, 0));
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN
    RETURN QUERY SELECT 'already_paired'::text; RETURN;
  END IF;

  INSERT INTO public.buddy_pool AS bpl (user_id, course, cefr_level, age_confirmed_at) VALUES (me, _course, mine, now())
    ON CONFLICT (user_id) DO UPDATE
      SET course = excluded.course,
          cefr_level = excluded.cefr_level,
          age_confirmed_at = excluded.age_confirmed_at,
          joined_at = CASE WHEN bpl.course = excluded.course THEN bpl.joined_at ELSE now() END;
  RETURN QUERY SELECT 'waiting'::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.join_buddy_pool(_course text, _age_confirmed boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_buddy_pool(_course text, _age_confirmed boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_buddy_message(_preset text)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  other uuid;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  IF _preset IS NULL OR NOT (_preset IN ('lets_study', 'nice_work', 'keep_going', 'need_a_hand', 'on_my_way', 'good_morning', 'good_night', 'proud_of_you')) THEN
    RETURN QUERY SELECT 'bad_preset'::text; RETURN;
  END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN QUERY SELECT 'not_paired'::text; RETURN; END IF;
  SELECT CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END INTO other FROM public.buddy_pairs bp WHERE bp.id = pid;
  -- The same per-person lock as pairing and ending: an unfriend or block that commits first wins, and two parallel
  -- sends cannot both pass the limit.
  PERFORM public._lock_buddy_users(me, other);
  IF public.is_social_restricted(me) OR public.is_social_restricted(other) THEN
    RETURN QUERY SELECT 'not_paired'::text; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me AND bm.pair_id = pid) THEN
    RETURN QUERY SELECT 'not_paired'::text; RETURN;
  END IF;
  -- The kill switch also mutes matched-stranger pairs. Friend pairs keep sending.
  IF EXISTS (SELECT 1 FROM public.buddy_pairs bp WHERE bp.id = pid AND bp.source = 'match')
     AND NOT coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false) THEN
    RETURN QUERY SELECT 'matching_paused'::text; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.buddy_messages m WHERE m.sender_id = me AND m.created_at > now() - interval '1 hour') >= 20 THEN
    RETURN QUERY SELECT 'rate_limited'::text; RETURN;
  END IF;
  INSERT INTO public.buddy_messages (pair_id, sender_id, preset_id) VALUES (pid, me, _preset);
  RETURN QUERY SELECT 'sent'::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.send_buddy_message(_preset text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_buddy_message(_preset text) TO authenticated;

CREATE OR REPLACE FUNCTION public._join_team_impl(_team_id uuid, _me uuid)
 RETURNS TABLE(ok boolean, reason text, team_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cap integer;
  current_count integer;
  existing_joined_at timestamptz;
  recently_kicked_at timestamptz;
BEGIN
  -- A restricted account cannot join or form a team (it reads as an unknown team).
  IF public.is_social_restricted(_me) THEN
    RETURN QUERY SELECT false, 'team-not-found', NULL::uuid;
    RETURN;
  END IF;

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
$function$;
REVOKE ALL ON FUNCTION public._join_team_impl(_team_id uuid, _me uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kick_team_member(_user_id uuid)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  owner uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;
  IF _user_id = me THEN
    RETURN QUERY SELECT false, 'cannot-kick-yourself';
    RETURN;
  END IF;

  IF public.is_social_restricted(me) THEN
    RETURN QUERY SELECT false, 'not-team-owner';
    RETURN;
  END IF;

  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN QUERY SELECT false, 'not-on-a-team';
    RETURN;
  END IF;

  SELECT t.created_by INTO owner FROM public.teams t WHERE t.id = my_team;
  IF owner IS DISTINCT FROM me THEN
    RETURN QUERY SELECT false, 'not-team-owner';
    RETURN;
  END IF;

  DELETE FROM public.team_members WHERE team_id = my_team AND user_id = _user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'member-not-found';
    RETURN;
  END IF;

  -- Recorded only after the delete actually removed a real member --
  -- ordering matters: doing this before the FOUND check would let the
  -- owner "kick" (and switch-lock) an arbitrary uuid that was never
  -- even on the team.
  INSERT INTO public.team_kicks (user_id, team_id, kicked_at)
  VALUES (_user_id, my_team, now())
  ON CONFLICT (user_id) DO UPDATE SET team_id = excluded.team_id, kicked_at = excluded.kicked_at;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.kick_team_member(_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kick_team_member(_user_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friends_progress()
 RETURNS TABLE(user_id uuid, display_name text, avatar_seed text, streak integer, week_xp bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_seed,
    COALESCE(up.streak, 0) AS streak,
    COALESCE((
      SELECT SUM(ad.xp_earned)
      FROM public.activity_days ad
      WHERE ad.user_id = p.id AND ad.day >= (CURRENT_DATE - INTERVAL '6 days')
    ), 0) AS week_xp
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.friend_id
  LEFT JOIN public.user_progress up ON up.user_id = p.id
  WHERE f.user_id = auth.uid() AND f.status = 'accepted'
    AND NOT public.is_social_restricted(f.friend_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = auth.uid() AND bu.blocked = f.friend_id)
         OR (bu.blocker = f.friend_id AND bu.blocked = auth.uid())
    )
  ORDER BY week_xp DESC;
$function$;
REVOKE ALL ON FUNCTION public.get_friends_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_scope text, _period text)
 RETURNS TABLE(user_id uuid, display_name text, country text, avatar_seed text, xp integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  my_country text;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.country INTO my_country FROM public.profiles p WHERE p.id = me;

  IF _period = 'weekly' THEN
    RETURN QUERY
    WITH earners AS (
      SELECT p.id, p.display_name, p.country, p.avatar_seed, w.xp
      FROM public.weekly_xp_totals w
      JOIN public.profiles p ON p.id = w.user_id
      WHERE w.week_start = wk
        AND w.xp > 0
        AND CASE _scope
              WHEN 'friends' THEN p.id = me OR p.id IN (
                SELECT f.friend_id FROM public.friendships f
                WHERE f.user_id = me AND f.status = 'accepted'
              )
              WHEN 'country' THEN my_country IS NOT NULL AND p.country = my_country
              ELSE true
            END
        AND NOT EXISTS (
          SELECT 1 FROM public.blocked_users bu
          WHERE (bu.blocker = me AND bu.blocked = p.id)
             OR (bu.blocker = p.id AND bu.blocked = me)
        )
        AND NOT public.is_social_restricted(p.id)
      ORDER BY w.xp DESC
      LIMIT 50
    )
    SELECT e.id, e.display_name, e.country, e.avatar_seed, e.xp FROM earners e
    UNION ALL
    (
      SELECT p.id, p.display_name, p.country, p.avatar_seed, 0
      FROM public.profiles p
      WHERE CASE _scope
              WHEN 'friends' THEN p.id = me OR p.id IN (
                SELECT f.friend_id FROM public.friendships f
                WHERE f.user_id = me AND f.status = 'accepted'
              )
              WHEN 'country' THEN my_country IS NOT NULL AND p.country = my_country
              ELSE true
            END
        AND NOT EXISTS (
          SELECT 1 FROM public.blocked_users bu
          WHERE (bu.blocker = me AND bu.blocked = p.id)
             OR (bu.blocker = p.id AND bu.blocked = me)
        )
        AND NOT public.is_social_restricted(p.id)
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_xp_totals w2
          WHERE w2.user_id = p.id AND w2.week_start = wk AND w2.xp > 0
        )
      LIMIT GREATEST(50 - (SELECT count(*) FROM earners), 0)
    )
    ORDER BY 5 DESC
    LIMIT 50;
    RETURN;
  END IF;

  RETURN QUERY
  WITH pool AS (
    SELECT p.id, p.display_name, p.country, p.avatar_seed
    FROM public.profiles p
    WHERE
      CASE _scope
        WHEN 'friends' THEN p.id = me OR p.id IN (
          SELECT f.friend_id FROM public.friendships f
          WHERE f.user_id = me AND f.status = 'accepted'
        )
        WHEN 'country' THEN my_country IS NOT NULL AND p.country = my_country
        ELSE true
      END
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
        WHERE (bu.blocker = me AND bu.blocked = p.id)
           OR (bu.blocker = p.id AND bu.blocked = me)
      )
      AND NOT public.is_social_restricted(p.id)
  ), scores AS (
    SELECT pool.id,
           pool.display_name,
           pool.country,
           pool.avatar_seed,
           COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp
                     WHERE lp.user_id = pool.id), 0) AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_leaderboard(_scope text, _period text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(_scope text, _period text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_league_standing(_course text)
 RETURNS TABLE(league_tier text, rank integer, size integer, week_start date, week_end date, week_xp integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  me uuid := (SELECT auth.uid());
  wk date := (now() AT TIME ZONE 'UTC')::date - (extract(isodow FROM (now() AT TIME ZONE 'UTC')::date)::int - 1);
  my_tier text;
  mine integer;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT lp.league_tier INTO my_tier FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  mine := coalesce((SELECT w.xp FROM public.weekly_xp_totals w WHERE w.user_id = me AND w.week_start = wk), 0);
  RETURN QUERY
  SELECT
    my_tier,
    1 + (count(*) FILTER (WHERE o.xp > mine))::integer,
    (count(*))::integer + 1,
    wk,
    wk + 6,
    mine
  FROM public.weekly_xp_totals o
  JOIN public.language_progress p ON p.user_id = o.user_id AND p.language = _course
  WHERE o.week_start = wk AND o.xp > 0 AND o.user_id <> me AND p.league_tier = my_tier
    AND NOT public.is_social_restricted(o.user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_league_standing(_course text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_league_standing(_course text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_members()
 RETURNS TABLE(user_id uuid, display_name text, avatar_seed text, joined_at timestamp with time zone, is_owner boolean, blocked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  my_team uuid;
  i_own boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT tm.team_id INTO my_team FROM public.team_members tm WHERE tm.user_id = me;
  IF my_team IS NULL THEN
    RETURN;
  END IF;
  SELECT coalesce(t.created_by = me, false) INTO i_own FROM public.teams t WHERE t.id = my_team;
  i_own := coalesce(i_own, false);

  RETURN QUERY
  SELECT tm.user_id, p.display_name, p.avatar_seed, tm.joined_at, (t.created_by = tm.user_id),
    EXISTS (SELECT 1 FROM public.blocked_users bu WHERE bu.blocker = me AND bu.blocked = tm.user_id)
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.team_id = my_team
    -- A restricted account does not appear to anyone, the owner included.
    AND NOT public.is_social_restricted(tm.user_id)
    -- They blocked me: hidden from me, owner or not.
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = tm.user_id AND bu.blocked = me)
    )
    -- I blocked them: hidden, unless I own the team (the owner must be able to remove them).
    AND (i_own OR NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = me AND bu.blocked = tm.user_id)
    ))
  ORDER BY tm.joined_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leaderboard()
 RETURNS TABLE(team_id uuid, name text, weekly_xp integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, COALESCE(SUM(w.xp), 0)::int
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.weekly_xp_totals w ON w.user_id = tm.user_id AND w.week_start = wk
    AND NOT public.is_social_restricted(tm.user_id)
  WHERE t.visibility = 'public'
     OR t.id IN (SELECT m.team_id FROM public.team_members m WHERE m.user_id = auth.uid())
  GROUP BY t.id, t.name
  ORDER BY 3 DESC
  LIMIT 50;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_team_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_team()
 RETURNS TABLE(team_id uuid, name text, join_code text, joined_at timestamp with time zone, switch_locked_until timestamp with time zone, this_week_xp integer, is_owner boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
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

  -- Only learners with XP last week can make a team win, so start from last week's non-zero totals.
  SELECT t.id INTO winner_team
  FROM public.weekly_xp_totals w2
  JOIN public.team_members tm2 ON tm2.user_id = w2.user_id
  JOIN public.teams t ON t.id = tm2.team_id
  WHERE w2.week_start = prev_wk AND w2.xp > 0
  GROUP BY t.id
  ORDER BY SUM(w2.xp) DESC, t.id
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
         COALESCE(SUM(public.weekly_xp(tm.user_id, wk)) FILTER (WHERE NOT public.is_social_restricted(tm.user_id)), 0)::int,
         (t.created_by = me)
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = my_team
  GROUP BY t.id, t.name, t.join_code, t.created_by;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_buddy_requests()
 RETURNS TABLE(request_id uuid, direction text, other_id uuid, other_name text, other_avatar_seed text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT br.id,
    CASE WHEN br.to_user = me THEN 'incoming' ELSE 'outgoing' END,
    o.id, o.display_name, o.avatar_seed, br.created_at
  FROM public.buddy_requests br
  JOIN public.profiles o ON o.id = CASE WHEN br.to_user = me THEN br.from_user ELSE br.to_user END
  WHERE br.status = 'pending' AND me IN (br.from_user, br.to_user)
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = o.id) OR (b.blocker = o.id AND b.blocked = me))
    AND NOT public.is_social_restricted(o.id)
  ORDER BY br.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_buddy_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_buddy()
 RETURNS TABLE(pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamp with time zone, week_start date, my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text, is_match boolean, matching_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  wk date := date_trunc('week', current_date)::date;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid);
  RETURN QUERY
  SELECT bp.id,
    other.id,
    other.display_name,
    other.avatar_seed,
    bp.created_at,
    wk,
    public._buddy_count(me, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    public._buddy_count(other.id, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    3,
    bp.streak_weeks,
    bp.grace_available,
    (SELECT bw.outcome FROM public.buddy_weeks bw WHERE bw.pair_id = bp.id ORDER BY bw.week_start DESC LIMIT 1),
    bp.source = 'match',
    -- The live switch; clients hide the presets when is_match AND NOT matching_enabled.
    coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false)
  FROM public.buddy_pairs bp
  JOIN public.profiles other ON other.id = CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END
  WHERE bp.id = pid AND bp.ended_at IS NULL -- the pair may have ended while we waited for its lock
    AND NOT public.is_social_restricted(other.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_buddy_messages(_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(message_id uuid, sender_id uuid, is_mine boolean, preset_id text, sent_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  me uuid := auth.uid();
  pid uuid;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  -- A restricted partner (or a restricted caller) reads no messages.
  IF public.is_social_restricted(me) OR EXISTS (
    SELECT 1 FROM public.buddy_pairs bp
    WHERE bp.id = pid AND public.is_social_restricted(CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END)
  ) THEN RETURN; END IF;
  -- The newest 50 of the ACTIVE pair, returned oldest first. Ended pairs' history stays readable through RLS/export.
  RETURN QUERY
  SELECT recent.id, recent.sender_id, recent.sender_id = me, recent.preset_id, recent.created_at
  FROM (
    SELECT m.id, m.sender_id, m.preset_id, m.created_at FROM public.buddy_messages m
    WHERE m.pair_id = pid AND m.created_at > coalesce(_since, '-infinity'::timestamptz)
    ORDER BY m.created_at DESC
    LIMIT 50
  ) recent
  ORDER BY recent.created_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_buddy_messages(_since timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_messages(_since timestamp with time zone) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_duels()
 RETURNS TABLE(duel_id uuid, challenger_id uuid, opponent_id uuid, course text, status text, challenger_xp_start integer, opponent_xp_start integer, challenger_xp_now integer, opponent_xp_now integer, winner_id uuid, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;

  -- Resolve any active duel of mine whose window has closed. Scalar
  -- subqueries (not a FROM-join) so a player who never touched
  -- language_progress for this course yet still resolves correctly
  -- (COALESCE to 0) instead of silently not matching an inner join.
  UPDATE public.duels d SET
    status = 'completed',
    winner_id = CASE
      WHEN (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course), 0) - d.challenger_xp_start)
         > (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course), 0) - d.opponent_xp_start)
        THEN d.challenger_id
      WHEN (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.opponent_id AND language = d.course), 0) - d.opponent_xp_start)
         > (COALESCE((SELECT xp FROM public.language_progress WHERE user_id = d.challenger_id AND language = d.course), 0) - d.challenger_xp_start)
        THEN d.opponent_id
      ELSE NULL
    END
  WHERE d.status = 'active' AND d.ends_at <= now()
    AND (d.challenger_id = me OR d.opponent_id = me);

  RETURN QUERY
  SELECT
    d.id, d.challenger_id, d.opponent_id, d.course, d.status,
    d.challenger_xp_start, d.opponent_xp_start,
    COALESCE(lp_c.xp, 0), COALESCE(lp_o.xp, 0),
    d.winner_id, d.ends_at
  FROM public.duels d
  LEFT JOIN public.language_progress lp_c ON lp_c.user_id = d.challenger_id AND lp_c.language = d.course
  LEFT JOIN public.language_progress lp_o ON lp_o.user_id = d.opponent_id AND lp_o.language = d.course
  WHERE (d.challenger_id = me OR d.opponent_id = me)
    AND NOT public.is_social_restricted(CASE WHEN d.challenger_id = me THEN d.opponent_id ELSE d.challenger_id END)
  ORDER BY d.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_duels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_duels() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friend_invite_preview(_code text)
 RETURNS TABLE(ok boolean, is_self boolean, display_name text, avatar_seed text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  inviter_id uuid;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT user_id INTO inviter_id FROM public.friend_invite_codes WHERE code = _code;
  IF inviter_id IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF inviter_id = me THEN
    RETURN QUERY SELECT true, true, NULL::text, NULL::text;
    RETURN;
  END IF;
  -- A restricted inviter reads as an unknown code: their name is not shown.
  IF public.is_social_restricted(inviter_id) THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT true, false, p.display_name, p.avatar_seed
    FROM public.profiles p WHERE p.id = inviter_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_friend_invite_preview(_code text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_invite_preview(_code text) TO authenticated;
