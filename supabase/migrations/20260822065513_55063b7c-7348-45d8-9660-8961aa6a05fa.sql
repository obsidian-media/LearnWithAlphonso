DROP POLICY IF EXISTS ad_select_auth ON public.activity_days;
CREATE POLICY ad_select_own ON public.activity_days FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_progress_select_auth ON public.user_progress;
CREATE POLICY user_progress_select_own ON public.user_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);

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
             COALESCE((SELECT up.xp FROM public.user_progress up WHERE up.user_id = pool.id), 0)
           END AS xp
    FROM pool
  )
  SELECT s.id, s.display_name, s.country, s.avatar_seed, s.xp
  FROM scores s
  ORDER BY s.xp DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, text) TO authenticated, service_role;