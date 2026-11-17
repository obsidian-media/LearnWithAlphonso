-- Referral program: a learner invites a friend; when the friend completes their FIRST lesson both get a reward.
-- Design: docs/superpowers/specs/2026-11-17-referral-design.md. Builds on the invite code (friend_invite_codes), the
-- completion paths, the hearts column and the streak-freeze balance; none of those change shape.
--
-- Owner-tunable numbers (each is one constant below; src/lib/referral.ts holds the same two and a test pins them equal):
--   * reward_hearts = 5. user_progress.hearts is hard-capped at 5 (user_progress_hearts_range), and a streak milestone
--     already means "refill to full", so a day's worth of hearts collapses to a full refill.
--   * monthly_cap = 20 rewarded referrals per referrer per UTC calendar month.
--   * freeze_cap = 3: a Pro referrer (who has unlimited hearts, so gets ONE streak freeze instead) already holding 3
--     freezes is skipped gracefully (the friend still gets hearts; the row records note = 'freeze-cap').
--
-- Shape:
--   * claim_referral(code)            authenticated, SECURITY DEFINER. Called once by a new account with the code it
--                                     arrived with. Creates a PENDING row. Refuses: unknown code, self, a circle
--                                     (A refers B while B refers A), already referred, an account older than 2 days
--                                     or one that already completed a lesson (never retroactive).
--   * grant_referral_reward(referee, referrer_pro)
--                                     service_role only. Called by the server after a lesson completion is saved. A no-op
--                                     unless the referee has a pending row AND at least one completed lesson. Locks the
--                                     referral row, then both progress rows in id order, then counts the month, so a retry
--                                     or two simultaneous completions grant exactly once and cannot both pass the cap.
--                                     Pro is decided by the server (RevenueCat), never by a client.
--   * referrals                       clients can only SELECT their own rows (as referrer or referee); every write is one
--                                     of the two functions above.
--
-- Rollback: DROP FUNCTION public.grant_referral_reward(uuid, boolean); DROP FUNCTION public.claim_referral(text);
-- DROP TABLE public.referrals; (rewards already credited stay in user_progress, as they are the learner's balance).

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- What the REFERRER received: hearts (free), freeze (Pro), or none (monthly cap, or a Pro referrer at the freeze cap).
  reward_kind text NOT NULL DEFAULT 'none' CHECK (reward_kind IN ('hearts', 'freeze', 'none')),
  -- True once anything was granted (the friend's hearts at least). Exactly-once is the pending -> completed move.
  reward_granted boolean NOT NULL DEFAULT false,
  -- True when the referrer's monthly cap was already full: the friend still signed up, nobody is rewarded.
  capped boolean NOT NULL DEFAULT false,
  note text CHECK (note IN ('monthly-cap', 'freeze-cap')),
  CHECK (referrer_id <> referee_id),
  CHECK ((status = 'pending') = (completed_at IS NULL))
);

CREATE INDEX referrals_referrer_idx ON public.referrals (referrer_id, status, completed_at);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.referrals FROM PUBLIC, anon;
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = referrer_id OR (select auth.uid()) = referee_id);

CREATE FUNCTION public.claim_referral(_code text)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  inviter uuid;
  created timestamptz;
  inserted integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated';
    RETURN;
  END IF;
  IF _code IS NULL OR length(_code) = 0 OR length(_code) > 64 THEN
    RETURN QUERY SELECT false, 'unknown-code';
    RETURN;
  END IF;

  SELECT c.user_id INTO inviter FROM public.friend_invite_codes c WHERE c.code = _code;
  -- A blocked or banned referrer reads as an unknown code, so a refusal reveals nothing about a block.
  IF inviter IS NULL OR public.is_social_restricted(inviter) THEN
    RETURN QUERY SELECT false, 'unknown-code';
    RETURN;
  END IF;
  IF inviter = me THEN
    RETURN QUERY SELECT false, 'self';
    RETURN;
  END IF;
  -- The direct circle: the person I would be referred by was referred by me.
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referrer_id = me AND r.referee_id = inviter) THEN
    RETURN QUERY SELECT false, 'self';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = me) THEN
    RETURN QUERY SELECT false, 'already-referred';
    RETURN;
  END IF;

  -- Only at signup, never retroactively: a new account that has not yet completed a lesson.
  SELECT u.created_at INTO created FROM auth.users u WHERE u.id = me;
  IF created IS NULL OR created < now() - interval '2 days'
     OR EXISTS (SELECT 1 FROM public.lesson_completions lc WHERE lc.user_id = me) THEN
    RETURN QUERY SELECT false, 'too-late';
    RETURN;
  END IF;

  -- The unique key on referee_id is the backstop for two simultaneous claims.
  INSERT INTO public.referrals (referrer_id, referee_id) VALUES (inviter, me)
    ON CONFLICT (referee_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN QUERY SELECT false, 'already-referred';
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated, service_role;

CREATE FUNCTION public.grant_referral_reward(_referee uuid, _referrer_pro boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  reward_hearts constant integer := 5;
  monthly_cap constant integer := 20;
  freeze_cap constant integer := 3;
  max_hearts constant integer := 5;
  r public.referrals%ROWTYPE;
  used integer;
  referrer_freezes integer;
  kind text := 'hearts';
  skip_note text := NULL;
BEGIN
  IF _referee IS NULL THEN
    RETURN jsonb_build_object('status', 'noop');
  END IF;

  -- The referral row is the exactly-once gate: a second caller waits here, then sees 'completed'.
  SELECT * INTO r FROM public.referrals x WHERE x.referee_id = _referee FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'noop');
  END IF;

  -- The reward is for a real, engaged learner: at least one saved lesson.
  IF NOT EXISTS (SELECT 1 FROM public.lesson_completions lc WHERE lc.user_id = _referee) THEN
    RETURN jsonb_build_object('status', 'not-yet');
  END IF;

  INSERT INTO public.user_progress (user_id) VALUES (r.referrer_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_progress (user_id) VALUES (_referee) ON CONFLICT (user_id) DO NOTHING;
  -- Both balances locked in a fixed order; the month is counted after the lock, so two completions of one referrer's
  -- friends cannot both read 19 and both pass the cap.
  PERFORM 1 FROM public.user_progress up
    WHERE up.user_id IN (r.referrer_id, _referee) ORDER BY up.user_id FOR UPDATE;

  SELECT count(*) INTO used FROM public.referrals x
    WHERE x.referrer_id = r.referrer_id AND x.status = 'completed' AND x.capped = false
      AND x.completed_at >= date_trunc('month', now());

  IF used >= monthly_cap THEN
    UPDATE public.referrals SET status = 'completed', completed_at = now(), capped = true,
      reward_kind = 'none', reward_granted = false, note = 'monthly-cap'
      WHERE id = r.id;
    RETURN jsonb_build_object('status', 'capped', 'referrer_id', r.referrer_id);
  END IF;

  UPDATE public.user_progress up SET
    hearts = LEAST(max_hearts, up.hearts + reward_hearts),
    hearts_refill_at = CASE WHEN LEAST(max_hearts, up.hearts + reward_hearts) >= max_hearts
                            THEN NULL ELSE up.hearts_refill_at END
    WHERE up.user_id = _referee;

  IF _referrer_pro IS TRUE THEN
    SELECT up.streak_freezes INTO referrer_freezes FROM public.user_progress up WHERE up.user_id = r.referrer_id;
    IF referrer_freezes < freeze_cap THEN
      UPDATE public.user_progress SET streak_freezes = streak_freezes + 1 WHERE user_id = r.referrer_id;
      kind := 'freeze';
    ELSE
      kind := 'none';
      skip_note := 'freeze-cap';
    END IF;
  ELSE
    UPDATE public.user_progress up SET
      hearts = LEAST(max_hearts, up.hearts + reward_hearts),
      hearts_refill_at = CASE WHEN LEAST(max_hearts, up.hearts + reward_hearts) >= max_hearts
                              THEN NULL ELSE up.hearts_refill_at END
      WHERE up.user_id = r.referrer_id;
  END IF;

  UPDATE public.referrals SET status = 'completed', completed_at = now(), capped = false,
    reward_kind = kind, reward_granted = true, note = skip_note
    WHERE id = r.id;
  RETURN jsonb_build_object('status', 'granted', 'referrer_id', r.referrer_id, 'reward_kind', kind);
END;
$$;

-- Only the server (service role) may grant: it alone decides Pro (RevenueCat) and runs after a saved completion.
REVOKE ALL ON FUNCTION public.grant_referral_reward(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_reward(uuid, boolean) TO service_role;
