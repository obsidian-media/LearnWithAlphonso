-- Gift a streak freeze to a friend.
--
-- Adds only gifting. How a freeze is earned (one per day of streak), bought (75 XP, buy_streak_freeze_with_xp) and
-- spent (the streak math) is untouched, and so are payments, entitlements and quotas.
--
-- Design (owner can change any of these; each is one constant or one check below):
--   * A gift is a TRANSFER of a freeze the sender already holds: the sender's streak_freezes goes down by one, the
--     friend's goes up by one. Nothing is minted, so gifting cannot be used to farm freezes (a daily allowance would
--     mint freezes out of nothing, and two accounts gifting each other would double their supply every day).
--   * One gift per sender per friend per UTC day, enforced by a unique key, not by a check-then-insert.
--   * A friend who already holds 3 or more freezes cannot be gifted another (gift_cap). Freezes have no cap anywhere
--     else (earning and buying are unchanged), so this cap applies to receiving a gift only. The refusal is explicit
--     ('recipient-full'), never a silent drop, and nothing is debited from the sender.
--   * Friends only (an accepted friendship in the sender's direction; blocking deletes both directions), and never
--     to or from a learner under a block or ban (is_social_restricted): that reads as 'not-friends', so a refusal
--     reveals nothing about a block.
--   * Concurrency: both user_progress rows are locked in id order (no deadlock between A->B and B->A), then every
--     check is read after the locks, so two simultaneous gifts cannot both debit the same last freeze or both fill
--     the same friend past the cap. The unique key is the backstop for the daily limit.
--   * Receipt: a row in streak_freeze_gifts (the recipient reads it, as with nudges: polled when the page opens, then
--     marked read). No push is sent (no new notification system); a nudge row would have fired "You've been nudged!".
--
-- Rollback: DROP FUNCTION public.gift_streak_freeze(uuid); DROP TABLE public.streak_freeze_gifts;
-- (gifted freezes already credited stay in user_progress, as they are the learner's balance).

CREATE TABLE public.streak_freeze_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (sender_id <> recipient_id),
  UNIQUE (sender_id, recipient_id, gift_day)
);

CREATE INDEX streak_freeze_gifts_recipient_read_idx ON public.streak_freeze_gifts (recipient_id, read_at);

ALTER TABLE public.streak_freeze_gifts ENABLE ROW LEVEL SECURITY;

-- Clients read their own gifts (sent or received) and mark received ones read. They can never insert, change a
-- sender, or delete: the only writer is gift_streak_freeze below.
REVOKE ALL ON public.streak_freeze_gifts FROM PUBLIC, anon;
GRANT SELECT ON public.streak_freeze_gifts TO authenticated;
GRANT UPDATE (read_at) ON public.streak_freeze_gifts TO authenticated;
GRANT ALL ON public.streak_freeze_gifts TO service_role;

CREATE POLICY streak_freeze_gifts_select_own ON public.streak_freeze_gifts
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = sender_id
    OR ((select auth.uid()) = recipient_id AND NOT public.policy_social_restricted(sender_id))
  );

CREATE POLICY streak_freeze_gifts_update_recipient_read ON public.streak_freeze_gifts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = recipient_id)
  WITH CHECK ((select auth.uid()) = recipient_id);

CREATE FUNCTION public.gift_streak_freeze(_recipient uuid)
RETURNS TABLE(ok boolean, reason text, freezes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  gift_cap constant integer := 3;
  my_freezes integer;
  their_freezes integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer;
    RETURN;
  END IF;
  IF _recipient IS NULL OR _recipient = me THEN
    RETURN QUERY SELECT false, 'not-friends', NULL::integer;
    RETURN;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.friendships f
       WHERE f.user_id = me AND f.friend_id = _recipient AND f.status = 'accepted')
     OR public.is_social_restricted(me)
     OR public.is_social_restricted(_recipient) THEN
    RETURN QUERY SELECT false, 'not-friends', NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.user_progress (user_id) VALUES (me) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_progress (user_id) VALUES (_recipient) ON CONFLICT (user_id) DO NOTHING;

  -- Lock both balances in a fixed order; everything below reads after the locks.
  PERFORM 1 FROM public.user_progress up
    WHERE up.user_id IN (me, _recipient) ORDER BY up.user_id FOR UPDATE;

  SELECT up.streak_freezes INTO my_freezes FROM public.user_progress up WHERE up.user_id = me;
  SELECT up.streak_freezes INTO their_freezes FROM public.user_progress up WHERE up.user_id = _recipient;

  IF EXISTS (
       SELECT 1 FROM public.streak_freeze_gifts g
       WHERE g.sender_id = me AND g.recipient_id = _recipient
         AND g.gift_day = (now() AT TIME ZONE 'UTC')::date) THEN
    RETURN QUERY SELECT false, 'already-gifted-today', my_freezes;
    RETURN;
  END IF;
  IF my_freezes < 1 THEN
    RETURN QUERY SELECT false, 'no-freeze', my_freezes;
    RETURN;
  END IF;
  IF their_freezes >= gift_cap THEN
    RETURN QUERY SELECT false, 'recipient-full', my_freezes;
    RETURN;
  END IF;

  INSERT INTO public.streak_freeze_gifts (sender_id, recipient_id) VALUES (me, _recipient);
  UPDATE public.user_progress SET streak_freezes = streak_freezes - 1 WHERE user_id = me;
  UPDATE public.user_progress SET streak_freezes = streak_freezes + 1 WHERE user_id = _recipient;

  RETURN QUERY SELECT true, NULL::text, my_freezes - 1;
END;
$$;

REVOKE ALL ON FUNCTION public.gift_streak_freeze(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gift_streak_freeze(uuid) TO authenticated, service_role;
