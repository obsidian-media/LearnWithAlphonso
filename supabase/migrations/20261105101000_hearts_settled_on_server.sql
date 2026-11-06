-- Hearts are settled on the server when a lesson completes.
--
-- Until now a wrong answer cost a heart only when the client called lose_heart(). complete-lesson already re-grades
-- every answer, so it knows how many questions were missed; this lets it settle the lesson's hearts itself:
--
--   * lose_heart() keeps deducting exactly as before, and also writes a heart_loss_reports row, so the settlement can
--     tell which misses the client already paid for. Shipped apps keep calling it; nothing changes for them.
--   * settle_lesson_hearts() runs once per lesson session (keyed by a hash of the signed session token, so a retried
--     or replayed completion settles nothing twice). It counts the client's reports since the session started, and
--     charges only the misses nobody paid for yet (e.g. a lesson finished offline, whose lose_heart calls never
--     arrived).
--   * A lose_heart() that arrives after its lesson was settled (it is fire-and-forget) uses up a credit from that
--     settlement instead of charging again.
--   * Alphonso Pro has unlimited hearts: lose_heart() and the settlement never deduct for a learner whose Pro status
--     was confirmed within the last hour (hearts_pro_status, written by the server after it asks RevenueCat).
--
-- The callers decide whether the settlement charges (_enforce). They pass false until SERVER_HEARTS=on, so the first
-- deploy only records what it would have charged (the settlement rows), and changes nobody's hearts.
--
-- client-grants: none public.heart_loss_reports
-- client-grants: none public.lesson_heart_settlements
-- client-grants: none public.hearts_pro_status

CREATE TABLE public.heart_loss_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  claimed boolean NOT NULL DEFAULT false
);
CREATE INDEX heart_loss_reports_user_at_idx ON public.heart_loss_reports (user_id, at);
ALTER TABLE public.heart_loss_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.heart_loss_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.heart_loss_reports TO service_role;

CREATE TABLE public.lesson_heart_settlements (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settled_at timestamptz NOT NULL DEFAULT now(),
  misses integer NOT NULL,
  client_reported integer NOT NULL,
  would_charge integer NOT NULL,
  charged integer NOT NULL,
  credits_left integer NOT NULL,
  enforced boolean NOT NULL,
  pro boolean NOT NULL
);
CREATE INDEX lesson_heart_settlements_user_at_idx ON public.lesson_heart_settlements (user_id, settled_at);
ALTER TABLE public.lesson_heart_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_heart_settlements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lesson_heart_settlements TO service_role;

CREATE TABLE public.hearts_pro_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pro boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hearts_pro_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hearts_pro_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hearts_pro_status TO service_role;

-- True while this learner's Pro was confirmed within the hour. Internal helper, no client EXECUTE.
CREATE FUNCTION public.hearts_unlimited(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hearts_pro_status s
    WHERE s.user_id = _user_id AND s.pro AND s.checked_at > now() - interval '1 hour'
  );
$$;
REVOKE ALL ON FUNCTION public.hearts_unlimited(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hearts_unlimited(uuid) TO service_role;

-- Same signature and return shape as before, so every shipped client keeps working unchanged.
CREATE OR REPLACE FUNCTION public.lose_heart()
RETURNS TABLE(hearts integer, hearts_refill_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_hearts integer;
  cur_refill timestamptz;
  next_hearts integer;
  next_refill timestamptz;
  credit text;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson_hearts:' || me::text, 0));

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  -- Alphonso Pro: unlimited hearts.
  IF public.hearts_unlimited(me) THEN
    RETURN QUERY SELECT cur_hearts, cur_refill;
    RETURN;
  END IF;

  -- This miss was already charged when its lesson was settled (the call arrived after the completion).
  SELECT s.token_hash INTO credit FROM public.lesson_heart_settlements s
    WHERE s.user_id = me AND s.credits_left > 0 AND s.settled_at > now() - interval '15 minutes'
    ORDER BY s.settled_at LIMIT 1;
  IF credit IS NOT NULL THEN
    UPDATE public.lesson_heart_settlements SET credits_left = credits_left - 1 WHERE token_hash = credit;
    RETURN QUERY SELECT cur_hearts, cur_refill;
    RETURN;
  END IF;

  -- Resolve any pending refill before applying the loss (same rule as
  -- resolveHeartsRefill in src/lib/hearts.ts) -- a client with stale local
  -- state shouldn't lose a heart it already earned back.
  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  next_hearts := GREATEST(0, cur_hearts - 1);
  next_refill := CASE WHEN next_hearts = 0 THEN now() + interval '30 minutes' ELSE NULL END;

  UPDATE public.user_progress SET hearts = next_hearts, hearts_refill_at = next_refill
    WHERE user_id = me;
  INSERT INTO public.heart_loss_reports (user_id) VALUES (me);

  RETURN QUERY SELECT next_hearts, next_refill;
END;
$$;
REVOKE ALL ON FUNCTION public.lose_heart() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lose_heart() TO authenticated, service_role;

-- Settles one lesson session's hearts. Called by complete-lesson (and the web's completeLessonRemote) after the
-- completion is saved. _misses is the server's own grading; _since is the session's signed start time.
CREATE FUNCTION public.settle_lesson_hearts(
  _user_id uuid,
  _token_hash text,
  _misses integer,
  _since timestamptz,
  _enforce boolean,
  _pro boolean
)
RETURNS TABLE(hearts integer, hearts_refill_at timestamptz, charged integer, settled_now boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cur_hearts integer;
  cur_refill timestamptz;
  reported integer;
  owed integer;
  take integer := 0;
  changed boolean := false;
  last_settled timestamptz;
BEGIN
  IF _user_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$'
     OR _misses IS NULL OR _misses < 0 OR _misses > 50 OR _since IS NULL
     OR _enforce IS NULL OR _pro IS NULL THEN
    RAISE EXCEPTION 'invalid hearts settlement';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson_hearts:' || _user_id::text, 0));

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  -- Already settled: a retry, a queued duplicate, or the same token used again.
  IF EXISTS (SELECT 1 FROM public.lesson_heart_settlements s WHERE s.token_hash = _token_hash) THEN
    RETURN QUERY SELECT cur_hearts, cur_refill, 0, false;
    RETURN;
  END IF;

  -- The misses this learner's client already paid for during this session. Reports from this session come first.
  -- A token can be issued after the lesson's own lose_heart calls (minted at finish when the start request failed,
  -- or re-minted at sync when a queued lesson's token expired), so unclaimed reports from up to 3 hours (the token
  -- lifetime) before the session start also count, but never ones older than this learner's previous settlement.
  -- Every report is a heart already deducted, so counting one here can only charge less, never more.
  SELECT max(s.settled_at) INTO last_settled
    FROM public.lesson_heart_settlements s WHERE s.user_id = _user_id;
  UPDATE public.heart_loss_reports r SET claimed = true
  WHERE r.id IN (
    SELECT x.id FROM public.heart_loss_reports x
    WHERE x.user_id = _user_id AND NOT x.claimed
      AND (x.at >= _since
           OR (x.at >= _since - interval '3 hours' AND (last_settled IS NULL OR x.at > last_settled)))
    ORDER BY (x.at >= _since) DESC, x.at
    LIMIT _misses
  );
  GET DIAGNOSTICS reported = ROW_COUNT;
  owed := CASE WHEN _pro THEN 0 ELSE _misses - reported END;

  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
    changed := true;
  END IF;

  IF _pro THEN
    -- Unlimited: whatever an older app deducted during the lesson comes back.
    IF cur_hearts < 5 OR cur_refill IS NOT NULL THEN
      cur_hearts := 5;
      cur_refill := NULL;
      changed := true;
    END IF;
  ELSIF _enforce AND owed > 0 THEN
    take := LEAST(owed, cur_hearts);
    cur_hearts := cur_hearts - take;
    cur_refill := CASE WHEN cur_hearts = 0 THEN COALESCE(cur_refill, now() + interval '30 minutes') ELSE NULL END;
    changed := true;
  END IF;

  IF changed THEN
    UPDATE public.user_progress SET hearts = cur_hearts, hearts_refill_at = cur_refill WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.lesson_heart_settlements
    (token_hash, user_id, misses, client_reported, would_charge, charged, credits_left, enforced, pro)
  VALUES
    (_token_hash, _user_id, _misses, reported, owed, take,
     CASE WHEN _enforce AND NOT _pro THEN owed ELSE 0 END, _enforce, _pro);

  DELETE FROM public.heart_loss_reports r WHERE r.user_id = _user_id AND r.at < now() - interval '2 days';
  DELETE FROM public.lesson_heart_settlements s WHERE s.user_id = _user_id AND s.settled_at < now() - interval '2 days';

  RETURN QUERY SELECT cur_hearts, cur_refill, take, true;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_lesson_hearts(uuid, text, integer, timestamptz, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_lesson_hearts(uuid, text, integer, timestamptz, boolean, boolean)
  TO service_role;

-- Rollback: SERVER_HEARTS=off makes the settlement a no-op without touching the schema. To remove it entirely:
--   re-run the lose_heart() body from 20260920050000_revoke_direct_gamification_writes.sql, then
--   DROP FUNCTION public.settle_lesson_hearts(uuid, text, integer, timestamptz, boolean, boolean);
--   DROP FUNCTION public.hearts_unlimited(uuid);
--   DROP TABLE public.hearts_pro_status, public.lesson_heart_settlements, public.heart_loss_reports;
