-- Staff console rate limits shared by every server instance.
--
-- The console's limits (learner search, support reads and writes, numbers refresh) were counted in memory, so each
-- serverless instance had its own window and a runaway or stolen staff session got a fresh allowance whenever a new
-- instance served it. This counts in the database instead: one row per (staff member, bucket, window), incremented
-- atomically, called only by the server with the service-role key.
--
-- Rollback:
--   DROP FUNCTION public.consume_staff_rate_limit(uuid, text, integer, integer);
--   DROP TABLE public.staff_rate_limits;

-- client-grants: none public.staff_rate_limits
CREATE TABLE public.staff_rate_limits (
  actor_user_id uuid NOT NULL,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_user_id, bucket, window_start)
);
ALTER TABLE public.staff_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_rate_limits TO service_role;

-- True when the call is allowed (and counted), false when the window's allowance is used up. Fixed windows of
-- p_window_seconds; a refused call is not counted, so a caller that keeps retrying does not extend its own lockout.
CREATE FUNCTION public.consume_staff_rate_limit(
  p_actor uuid, p_bucket text, p_max integer, p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  win timestamptz;
  new_count integer;
BEGIN
  IF p_actor IS NULL OR p_bucket IS NULL OR btrim(p_bucket) = ''
     OR p_max IS NULL OR p_max < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'consume_staff_rate_limit: invalid arguments' USING ERRCODE = '22023';
  END IF;
  win := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  -- Earlier windows of this actor's bucket are of no use; dropped opportunistically (cheap via the key).
  DELETE FROM public.staff_rate_limits
    WHERE actor_user_id = p_actor AND bucket = p_bucket AND window_start < win;

  INSERT INTO public.staff_rate_limits (actor_user_id, bucket, window_start, count)
  VALUES (p_actor, p_bucket, win, 1)
  ON CONFLICT (actor_user_id, bucket, window_start) DO UPDATE
    SET count = public.staff_rate_limits.count + 1
    WHERE public.staff_rate_limits.count < p_max
  RETURNING count INTO new_count;

  -- The conditional update matched nothing: the allowance for this window is used up.
  RETURN new_count IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_staff_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_staff_rate_limit(uuid, text, integer, integer) TO service_role;
