-- AI cost tracking: what every billable AI call actually cost, per learner. Nothing here is readable or writable by a
-- client role; the web server and the edge functions write with the service role, the admin console reads through
-- admin_ai_cost.
--
--   ai_cost_log         one row per billable call: who (user id), what for (kind), vendor, model, the units the vendor
--                       billed (STT audio seconds, TTS characters, LLM tokens), the estimated cost in USD micro-dollars
--                       (1 USD = 1,000,000; NULL when the price is not known, never a guess), where the number came
--                       from (provider = the vendor's own charge, table = src/lib/ai-prices.ts, unknown), and whether a
--                       spoken line was served from our own cache. Kept 90 days.
--   ai_cost_daily       the same, rolled up per day, learner, kind and vendor. rollup_ai_cost_log moves a whole UTC day
--                       out of ai_cost_log into here once it is older than 90 days (the maintenance sweep calls it every
--                       15 minutes; it does nothing when there is nothing old). Per-learner history therefore never
--                       disappears, it just stops being per call.
--   ai_cost_alert_days  one row per UTC day the daily spend alert has looked at, so it runs once a day.
--   tts-cache (bucket)  PRIVATE. Audio for our own fixed spoken lines (scene openers, name-less Hector greetings),
--                       keyed by a hash of voice + text + format. No storage.objects policy: only /api/tts, with the
--                       service role, reads or writes it, after authenticating the learner.
--
-- Functions (service role only):
--   rollup_ai_cost_log(p_keep_days)        the move above; returns the number of daily rows written.
--   ai_cost_union(p_since)                 raw + rolled-up rows from a day on, as one set (internal helper).
--   admin_ai_cost(p_days, p_heavy_micro)   the Numbers "AI cost" group: spend today / 7 / 30 days by vendor and kind,
--                                          cost per active learner (avg, median, p90, max) over p_days, the count of
--                                          learners over p_heavy_micro in the last 30 days, the top 20 by an opaque
--                                          short id (the first 8 characters of the id: never a name or an email), the
--                                          voice cache hit rate. Counts and money only.
--   ai_cost_day_report(p_day, p_user_micro) one day's total and the learners over a per-learner amount, for the alert.
--   claim_ai_cost_alert_day(p_day)         true for the first caller of a day; release_ai_cost_alert_day undoes it.
--
-- Depends on auth.users and storage.buckets only. Version 20261118200000 is after admin_numbers_own (20261118100000).
--
-- Rollback (one transaction):
--   DROP FUNCTION public.release_ai_cost_alert_day(date), public.claim_ai_cost_alert_day(date),
--     public.ai_cost_day_report(date, bigint), public.admin_ai_cost(integer, bigint),
--     public.ai_cost_union(date), public.rollup_ai_cost_log(integer);
--   DROP TABLE public.ai_cost_alert_days, public.ai_cost_daily, public.ai_cost_log;
--   and empty then delete the bucket through the Storage API (storage.emptyBucket('tts-cache'); deleteBucket).

-- client-grants: none public.ai_cost_log
CREATE TABLE public.ai_cost_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{1,32}$'),
  vendor text NOT NULL CHECK (vendor IN ('openrouter', 'deepgram')),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  stt_seconds numeric(12, 2) CHECK (stt_seconds IS NULL OR stt_seconds >= 0),
  tts_chars integer CHECK (tts_chars IS NULL OR tts_chars >= 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_micro_usd bigint CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0),
  cost_source text NOT NULL CHECK (cost_source IN ('provider', 'table', 'unknown')),
  cache_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_cost_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_cost_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_cost_log TO service_role;
CREATE INDEX ai_cost_log_created_idx ON public.ai_cost_log (created_at);
CREATE INDEX ai_cost_log_user_created_idx ON public.ai_cost_log (user_id, created_at);

-- client-grants: none public.ai_cost_daily
CREATE TABLE public.ai_cost_daily (
  day date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  vendor text NOT NULL,
  calls integer NOT NULL CHECK (calls >= 0),
  unpriced_calls integer NOT NULL DEFAULT 0 CHECK (unpriced_calls >= 0),
  cache_hits integer NOT NULL DEFAULT 0 CHECK (cache_hits >= 0),
  stt_seconds numeric(14, 2) NOT NULL DEFAULT 0,
  tts_chars bigint NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  PRIMARY KEY (day, user_id, kind, vendor)
);
ALTER TABLE public.ai_cost_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_cost_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_cost_daily TO service_role;
CREATE INDEX ai_cost_daily_user_idx ON public.ai_cost_daily (user_id);

-- client-grants: none public.ai_cost_alert_days
CREATE TABLE public.ai_cost_alert_days (
  day date PRIMARY KEY,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_cost_alert_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_cost_alert_days FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_cost_alert_days TO service_role;

-- The private speech cache. Same shape as the vocab-images bucket, but NOT public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tts-cache', 'tts-cache', false, 1572864, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Moves every whole UTC day older than p_keep_days (never fewer than 7) from the raw log into the daily summary, in one
-- statement, so a row is either still raw or already summed, never both and never neither.
CREATE FUNCTION public.rollup_ai_cost_log(p_keep_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cutoff date := (now() AT TIME ZONE 'UTC')::date - GREATEST(COALESCE(p_keep_days, 90), 7);
  written integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.ai_cost_log l
    WHERE (l.created_at AT TIME ZONE 'UTC')::date < cutoff
    RETURNING l.user_id, l.kind, l.vendor, l.created_at, l.stt_seconds, l.tts_chars,
              l.input_tokens, l.output_tokens, l.cost_micro_usd, l.cache_hit
  ),
  agg AS (
    SELECT (g.created_at AT TIME ZONE 'UTC')::date AS day, g.user_id, g.kind, g.vendor,
           count(*)::integer AS calls,
           (count(*) FILTER (WHERE g.cost_micro_usd IS NULL))::integer AS unpriced,
           (count(*) FILTER (WHERE g.cache_hit))::integer AS hits,
           COALESCE(sum(g.stt_seconds), 0) AS stt,
           COALESCE(sum(g.tts_chars), 0)::bigint AS chars,
           COALESCE(sum(g.input_tokens), 0)::bigint AS tin,
           COALESCE(sum(g.output_tokens), 0)::bigint AS tout,
           COALESCE(sum(g.cost_micro_usd), 0)::bigint AS micro
    FROM gone g
    GROUP BY 1, 2, 3, 4
  ),
  ins AS (
    INSERT INTO public.ai_cost_daily AS d
      (day, user_id, kind, vendor, calls, unpriced_calls, cache_hits, stt_seconds, tts_chars,
       input_tokens, output_tokens, cost_micro_usd)
    SELECT a.day, a.user_id, a.kind, a.vendor, a.calls, a.unpriced, a.hits, a.stt, a.chars,
           a.tin, a.tout, a.micro
    FROM agg a
    ON CONFLICT (day, user_id, kind, vendor) DO UPDATE SET
      calls = d.calls + EXCLUDED.calls,
      unpriced_calls = d.unpriced_calls + EXCLUDED.unpriced_calls,
      cache_hits = d.cache_hits + EXCLUDED.cache_hits,
      stt_seconds = d.stt_seconds + EXCLUDED.stt_seconds,
      tts_chars = d.tts_chars + EXCLUDED.tts_chars,
      input_tokens = d.input_tokens + EXCLUDED.input_tokens,
      output_tokens = d.output_tokens + EXCLUDED.output_tokens,
      cost_micro_usd = d.cost_micro_usd + EXCLUDED.cost_micro_usd
    RETURNING 1
  )
  SELECT count(*)::integer INTO written FROM ins;
  RETURN written;
END
$$;

-- Raw and rolled-up rows as one set. Rolled-up days are no longer raw (the rollup deletes them), so nothing is counted
-- twice.
CREATE FUNCTION public.ai_cost_union(p_since date)
RETURNS TABLE (
  u_day date, u_user uuid, u_kind text, u_vendor text,
  u_calls integer, u_unpriced integer, u_hits integer, u_micro bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (l.created_at AT TIME ZONE 'UTC')::date, l.user_id, l.kind, l.vendor,
         count(*)::integer,
         (count(*) FILTER (WHERE l.cost_micro_usd IS NULL))::integer,
         (count(*) FILTER (WHERE l.cache_hit))::integer,
         COALESCE(sum(l.cost_micro_usd), 0)::bigint
  FROM public.ai_cost_log l
  WHERE l.created_at >= (p_since::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT d.day, d.user_id, d.kind, d.vendor, d.calls, d.unpriced_calls, d.cache_hits, d.cost_micro_usd
  FROM public.ai_cost_daily d
  WHERE d.day >= p_since
$$;

CREATE FUNCTION public.admin_ai_cost(p_days integer, p_heavy_micro bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  w integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
  today date := (now() AT TIME ZONE 'UTC')::date;
  heavy bigint := GREATEST(COALESCE(p_heavy_micro, 0), 1);
  result jsonb;
BEGIN
  WITH r AS (SELECT * FROM public.ai_cost_union(today - 89)),
  periods AS (
    SELECT * FROM (VALUES ('today'::text, today), ('d7', today - 6), ('d30', today - 29)) AS p(name, since)
  ),
  per AS (
    SELECT p.name,
      jsonb_build_object(
        'micro', (SELECT COALESCE(sum(r.u_micro), 0) FROM r WHERE r.u_day >= p.since),
        'calls', (SELECT COALESCE(sum(r.u_calls), 0) FROM r WHERE r.u_day >= p.since),
        'unpriced', (SELECT COALESCE(sum(r.u_unpriced), 0) FROM r WHERE r.u_day >= p.since),
        'byVendor', (SELECT COALESCE(jsonb_object_agg(v.u_vendor, v.m), '{}'::jsonb) FROM (
            SELECT r.u_vendor, sum(r.u_micro)::bigint AS m FROM r WHERE r.u_day >= p.since GROUP BY r.u_vendor) v),
        'byKind', (SELECT COALESCE(jsonb_object_agg(k.u_kind, k.m), '{}'::jsonb) FROM (
            SELECT r.u_kind, sum(r.u_micro)::bigint AS m FROM r WHERE r.u_day >= p.since GROUP BY r.u_kind) k)
      ) AS body
    FROM periods p
  ),
  win_users AS (
    SELECT r.u_user, sum(r.u_micro)::bigint AS m, sum(r.u_calls)::bigint AS c
    FROM r WHERE r.u_day >= today - (w - 1) GROUP BY r.u_user
  ),
  month_users AS (
    SELECT r.u_user, sum(r.u_micro)::bigint AS m FROM r WHERE r.u_day >= today - 29 GROUP BY r.u_user
  )
  SELECT jsonb_build_object(
    'windowDays', w,
    'loggedCalls', (SELECT COALESCE(sum(r.u_calls), 0) FROM r),
    'periods', (SELECT jsonb_object_agg(per.name, per.body) FROM per),
    'users', (SELECT jsonb_build_object(
        'active', count(*),
        'avg', avg(wu.m),
        'median', percentile_cont(0.5) WITHIN GROUP (ORDER BY wu.m),
        'p90', percentile_cont(0.9) WITHIN GROUP (ORDER BY wu.m),
        'max', max(wu.m)) FROM win_users wu),
    'heavy', (SELECT count(*) FROM month_users mu WHERE mu.m >= heavy),
    'top', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'micro', t.m, 'calls', t.c) ORDER BY t.m DESC, t.id), '[]'::jsonb)
            FROM (SELECT left(wu.u_user::text, 8) AS id, wu.m, wu.c FROM win_users wu
                  ORDER BY wu.m DESC, wu.u_user LIMIT 20) t),
    'tts', (SELECT jsonb_build_object(
        'calls', COALESCE(sum(r.u_calls), 0),
        'hits', COALESCE(sum(r.u_hits), 0))
        FROM r WHERE r.u_kind = 'tts' AND r.u_day >= today - (w - 1))
  ) INTO result;
  RETURN result;
END
$$;

CREATE FUNCTION public.ai_cost_day_report(p_day date, p_user_micro bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH r AS (SELECT * FROM public.ai_cost_union(p_day) WHERE u_day = p_day),
  users AS (SELECT r.u_user, sum(r.u_micro)::bigint AS m FROM r GROUP BY r.u_user)
  SELECT jsonb_build_object(
    'day', p_day,
    'totalMicro', (SELECT COALESCE(sum(r.u_micro), 0) FROM r),
    'calls', (SELECT COALESCE(sum(r.u_calls), 0) FROM r),
    'unpriced', (SELECT COALESCE(sum(r.u_unpriced), 0) FROM r),
    'overCount', (SELECT count(*) FROM users u WHERE u.m >= GREATEST(COALESCE(p_user_micro, 1), 1)),
    'overUsers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'micro', t.m) ORDER BY t.m DESC, t.id), '[]'::jsonb)
                  FROM (SELECT left(u.u_user::text, 8) AS id, u.m FROM users u
                        WHERE u.m >= GREATEST(COALESCE(p_user_micro, 1), 1)
                        ORDER BY u.m DESC, u.u_user LIMIT 10) t)
  ) INTO result;
  RETURN result;
END
$$;

CREATE FUNCTION public.claim_ai_cost_alert_day(p_day date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH i AS (
    INSERT INTO public.ai_cost_alert_days (day) VALUES (p_day) ON CONFLICT (day) DO NOTHING RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM i)
$$;

CREATE FUNCTION public.release_ai_cost_alert_day(p_day date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.ai_cost_alert_days WHERE day = p_day
$$;

REVOKE ALL ON FUNCTION public.rollup_ai_cost_log(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cost_union(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ai_cost(integer, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cost_day_report(date, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_cost_alert_day(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_cost_alert_day(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_ai_cost_log(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cost_union(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_cost(integer, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cost_day_report(date, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_cost_alert_day(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_cost_alert_day(date) TO service_role;
