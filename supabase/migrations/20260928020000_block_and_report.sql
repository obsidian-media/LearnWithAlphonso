-- Block and report (App Store UGC requirement, P1 audit gap) --
-- FriendsView/DuelsView/LeaderboardView expose friends, nudges, duels,
-- open matchmaking, leaderboards and display names, but there was zero
-- way to block an abusive user or report content -- Apple's Guideline
-- 1.2 requires both for any app with user-generated content/interaction.
--
-- Two tables, then enforcement. Storage without enforcement is exactly
-- the defect class this repo keeps producing (see remove_friend's own
-- history) -- a block row that nothing ever reads back is a guard that
-- cannot act, so every read/write path a blocked relationship could
-- reach is updated in this same migration, not left as a follow-up.

-- ---------- blocked_users ----------
-- A user reads and writes only their own blocks -- ordinary owner-scoped
-- RLS, not the admin_users allowlist pattern (that pattern is for
-- content_reports below, which nobody but service_role should read back).
CREATE TABLE public.blocked_users (
  blocker uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);

-- Every enforcement check below looks up both directions (did I block
-- them, or did they block me) -- the primary key only indexes the
-- blocker-first direction, so the reverse lookup needs its own index.
CREATE INDEX blocked_users_blocked_idx ON public.blocked_users (blocked);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocked_users_select_own ON public.blocked_users
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = blocker);

CREATE POLICY blocked_users_insert_own ON public.blocked_users
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = blocker);

-- Unblocking is a plain delete of your own row, no RPC needed -- unlike
-- block_user() below, this never has to reach a row owned by anyone else.
CREATE POLICY blocked_users_delete_own ON public.blocked_users
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = blocker);

GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
REVOKE ALL ON public.blocked_users FROM PUBLIC, anon;

-- ---------- content_reports ----------
-- Follows admin_users' pattern (supabase/migrations/20260928010000_admin_users.sql):
-- RLS on with NO select policy at all. An allowlist/report queue the
-- guarded app can read is one an attacker (or an angry reported user, if
-- they could somehow guess they'd been reported) can enumerate; the
-- reporter doesn't need to read their own report back, so no read path
-- exists for anyone except service_role, which bypasses RLS entirely.
CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reported uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter <> reported)
);

CREATE INDEX content_reports_reported_idx ON public.content_reports (reported);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Insert-only for the reporter. Same explicit-check-despite-the-DEFAULT
-- shape as nudges.sender_id (supabase/migrations/20260920020000_nudges.sql)
-- -- the DEFAULT covers a caller that omits `reporter`, this WITH CHECK
-- is what actually stops a caller from naming someone else as the reporter.
CREATE POLICY content_reports_insert_own ON public.content_reports
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter);

GRANT INSERT ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;
REVOKE ALL ON public.content_reports FROM PUBLIC, anon;

-- ---------- block_user RPC ----------
-- Blocking also severs any existing friendship immediately, in both
-- directions (friendships is a directed table, one row per direction,
-- same shape remove_friend already handles) -- "must not appear in
-- friend lists" is a live promise this makes true right away, not just
-- true until the next unblock would otherwise silently restore a hidden
-- friendship row nobody removed. A plain client INSERT can't do this
-- half (deleting the row owned by the *other* user), so this needs
-- SECURITY DEFINER, same reason remove_friend does.
CREATE OR REPLACE FUNCTION public.block_user(_target uuid)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated';
    RETURN;
  END IF;
  IF _target = _me THEN
    RETURN QUERY SELECT false, 'cannot block yourself';
    RETURN;
  END IF;

  INSERT INTO public.blocked_users (blocker, blocked) VALUES (_me, _target)
    ON CONFLICT (blocker, blocked) DO NOTHING;

  DELETE FROM public.friendships WHERE user_id = _me AND friend_id = _target;
  DELETE FROM public.friendships WHERE user_id = _target AND friend_id = _me;

  RETURN QUERY SELECT true, 'blocked';
END;
$$;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

-- ---------- Enforcement: friend lists ----------
-- get_friends_progress (supabase/migrations/20260912041500_accept_friend_invite.sql),
-- reproduced in full (CREATE OR REPLACE needs the whole body) with one
-- added filter: a friend who blocked me, or whom I blocked, is excluded
-- from the list -- even though a live friendship row still exists (block
-- deletes it going forward via block_user, but this filter is the real
-- guard for any row that predates this migration or is created some
-- other way).
CREATE OR REPLACE FUNCTION public.get_friends_progress()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_seed text,
  streak integer,
  week_xp bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker = auth.uid() AND bu.blocked = f.friend_id)
         OR (bu.blocker = f.friend_id AND bu.blocked = auth.uid())
    )
  ORDER BY week_xp DESC;
$$;

-- ---------- Enforcement: leaderboards ----------
-- get_leaderboard (supabase/migrations/20260922020000_leaderboard_course_aware_xp.sql),
-- reproduced in full with one added filter on the `pool` CTE: a blocked
-- relationship (either direction) removes that row from every scope
-- (global/friends/country), both periods, since `pool` feeds `scores`
-- which feeds the final result -- one filter point covers all of it.
-- Filtering per-viewer this way also means a blocked user never sees the
-- blocker on their own leaderboard call either, with no extra code.
CREATE OR REPLACE FUNCTION public.get_leaderboard(_scope text, _period text)
RETURNS TABLE (user_id uuid, display_name text, country text, avatar_seed text, xp integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_country text;
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.country INTO my_country FROM public.profiles p WHERE p.id = me;

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
  ), scores AS (
    SELECT pool.id,
           pool.display_name,
           pool.country,
           pool.avatar_seed,
           CASE WHEN _period = 'weekly' THEN
             COALESCE((SELECT SUM(a.xp_earned)::int FROM public.activity_days a
                       WHERE a.user_id = pool.id AND a.day >= wk), 0)
           ELSE
             COALESCE((SELECT SUM(lp.xp)::int FROM public.language_progress lp
                       WHERE lp.user_id = pool.id), 0)
           END AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$$;

-- ---------- Enforcement: friend requests ----------
-- accept_friend_invite (same migration as get_friends_progress above):
-- a blocked relationship (either direction) refuses the invite outright,
-- so blocking someone also closes the "just send another invite link"
-- re-friend path.
CREATE OR REPLACE FUNCTION public.accept_friend_invite(_inviter_id uuid)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated';
    RETURN;
  END IF;
  IF _inviter_id = _me THEN
    RETURN QUERY SELECT false, 'cannot invite yourself';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _inviter_id) THEN
    RETURN QUERY SELECT false, 'inviter not found';
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
$$;

-- ---------- Enforcement: friend duels ----------
-- create_duel (supabase/migrations/20260920060000_v3_engagement_mechanics.sql):
-- a blocked relationship (either direction) refuses the challenge, same
-- position as the existing not-friends/duel-already-open checks.
CREATE OR REPLACE FUNCTION public.create_duel(_opponent_id uuid, _course text DEFAULT 'en')
RETURNS TABLE(ok boolean, reason text, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- ---------- Enforcement: open duel matchmaking ----------
-- join_open_duel_queue (supabase/migrations/20260922030500_weekly_challenges.sql):
-- the candidate-matching query excludes any waiting entry with a blocked
-- relationship (either direction) to the caller, so two mutually-blocked
-- (or one-way-blocked) users can never be paired by the open queue --
-- this is the literal "matchable in a duel" case from this migration's
-- header.
CREATE OR REPLACE FUNCTION public.join_open_duel_queue(_course text, _match_by_level boolean DEFAULT true)
RETURNS TABLE(matched boolean, duel_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ---------- Enforcement: friend activity ----------
-- friend_activity_readable_by_friends (supabase/migrations/
-- 20260920010000_friend_activity_events.sql) redefined with the same
-- block guard as get_friends_progress -- this is the literal "activity"
-- surface from this migration's header, and it is its own RLS-readable
-- table (not filtered by get_friends_progress at all), so it needed its
-- own fix. Viewing your OWN events (`user_id = auth.uid()`) is
-- deliberately left outside the guard -- you can always see your own
-- activity regardless of who has blocked you.
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
    )
  );

-- ---------- Enforcement: nudges ----------
-- nudges_insert_to_friend (supabase/migrations/20260920020000_nudges.sql)
-- redefined (a policy's USING/WITH CHECK can't be partially patched) with
-- an added block check -- nudge is the one remaining direct-contact path
-- on FriendsView the enforcement list above doesn't already cover via
-- friendship deletion, since a friendship removed by block_user also
-- already fails this policy's existing "is an accepted friend" clause in
-- the normal case, but this closes the gap for any nudge attempt that
-- races the block or predates this migration.
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
  );
