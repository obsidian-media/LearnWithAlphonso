-- The per-learner MONTHLY AI cost cap's two reads. No table, column or grant change on any table.
--
--   my_ai_cost_month()                          the signed-in learner's own AI cost so far this UTC calendar month, in USD
--                                               micro-dollars (1 USD = 1,000,000): raw ai_cost_log rows plus rolled-up
--                                               ai_cost_daily days, which never overlap (the rollup deletes what it sums).
--                                               Callable by signed-in learners, for their own id only (auth.uid()); returns
--                                               no row when there is no session. Unpriced calls (NULL cost) add nothing.
--   admin_ai_cost_capped(p_free, p_pro)         service role only: how many learners are at or over a free ceiling and at
--                                               or over a Pro ceiling this UTC month (counts only, no ids), for the admin
--                                               Numbers "AI cost" group.
--
-- The ceilings themselves are NOT here: they are settings of the web server (AI_MONTHLY_CAP_FREE_USD /
-- AI_MONTHLY_CAP_PRO_USD, src/lib/ai-monthly-cap.ts) so changing one never needs a migration.
--
-- Depends on ai_cost_log, ai_cost_daily and ai_cost_union (20261118200000_ai_cost_log.sql). Version 20261120120000 is
-- after the current newest migration (20261120110000).
--
-- Rollback: DROP FUNCTION public.admin_ai_cost_capped(bigint, bigint), public.my_ai_cost_month();

CREATE FUNCTION public.my_ai_cost_month()
RETURNS TABLE (uid uuid, month_micro bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.me,
         (
           COALESCE((SELECT sum(l.cost_micro_usd) FROM public.ai_cost_log l
                     WHERE l.user_id = a.me
                       AND l.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0)
           +
           COALESCE((SELECT sum(d.cost_micro_usd) FROM public.ai_cost_daily d
                     WHERE d.user_id = a.me
                       AND d.day >= date_trunc('month', now() AT TIME ZONE 'UTC')::date), 0)
         )::bigint
  FROM (SELECT auth.uid() AS me) a
  WHERE a.me IS NOT NULL
$$;

CREATE FUNCTION public.admin_ai_cost_capped(p_free_micro bigint, p_pro_micro bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ms AS (SELECT date_trunc('month', now() AT TIME ZONE 'UTC')::date AS d),
  per AS (
    SELECT u.u_user, sum(u.u_micro)::bigint AS m
    FROM ms, public.ai_cost_union((SELECT d FROM ms)) u
    WHERE u.u_day >= (SELECT d FROM ms)
    GROUP BY u.u_user
  )
  SELECT jsonb_build_object(
    'month', (SELECT d FROM ms),
    'overFree', (SELECT count(*) FROM per WHERE per.m >= GREATEST(COALESCE(p_free_micro, 1), 1)),
    'overPro', (SELECT count(*) FROM per WHERE per.m >= GREATEST(COALESCE(p_pro_micro, 1), 1))
  )
$$;

REVOKE ALL ON FUNCTION public.my_ai_cost_month() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_ai_cost_month() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_ai_cost_capped(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_cost_capped(bigint, bigint) TO service_role;
