-- V3 backlog sec 2.2, item B: get_leaderboard's all-time ranking used
-- user_progress.xp -- a column that turned out to be genuinely frozen,
-- not just "legacy." Verified live: neither complete-lesson (Edge
-- Function) nor its web duplicate (src/lib/sync.functions.ts) has
-- written `xp` to user_progress since the multi-course migration
-- (20260908020628) introduced language_progress -- both upsert
-- user_progress for streak/hearts/etc. only, and write xp exclusively
-- to language_progress now. So every all-time leaderboard rank has been
-- computed off a value stuck at whatever it was on 2026-09-08, for
-- every user, on both platforms.
--
-- Fix chosen (of the two options the V3 kickoff doc left open -- see
-- docs/v3-kickoffs/02-friends-v2-remainder-and-leaderboard-course-awareness.md):
-- keep one unified ranking (not a per-course-selectable leaderboard),
-- but compute its all-time XP correctly by summing language_progress.xp
-- across all of a user's courses. Chosen over the per-course-selectable
-- design because it fixes the real, verified bug with zero client
-- changes (both web and iOS already call this RPC without a course
-- param) -- a per-course leaderboard is a legitimate bigger follow-up
-- (new UI, new course-selection state on iOS, which currently has no
-- shared/global "active course" store to plumb through) that deserves
-- its own pass, not a bolt-on here.
--
-- Weekly ranking is untouched -- activity_days.xp_earned IS still
-- correctly updated on every completion regardless of course (verified:
-- complete-lesson's activity_days upsert adds that completion's xpGain
-- unconditionally), so it was never actually broken, only all-time was.
--
-- Related, smaller finding NOT fixed here (out of scope for this
-- change, flagged in docs/BACKLOG.md instead): account.functions.ts's
-- GDPR export also reads user_progress.xp directly, so an exported
-- "your data" file would show the same frozen number. Worth a follow-up.
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
  ), scores AS (
    SELECT pool.id,
           pool.display_name,
           pool.country,
           pool.avatar_seed,
           CASE WHEN _period = 'weekly' THEN
             COALESCE((SELECT SUM(a.xp_earned)::int FROM public.activity_days a
                       WHERE a.user_id = pool.id AND a.day >= wk), 0)
           ELSE
             -- Sums across every course the user has played, instead of
             -- the frozen user_progress.xp -- see this migration's
             -- header comment.
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
