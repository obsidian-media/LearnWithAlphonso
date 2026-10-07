-- Study together, Phase 3a: language buddies between accepted friends (spec 2026-10-06-study-together-design.md,
-- plan 2026-10-06-buddy-pairing-web.md). The opt-in stranger pool (3b) is NOT here: it waits for the owner to confirm
-- the App Store age rating. Every write goes through the SECURITY DEFINER functions below; clients only read their rows.
-- One active buddy per user is the PRIMARY KEY of buddy_members (two partial unique indexes on buddy_pairs could not
-- stop a user being user_a in one pair and user_b in another).
--
-- client-grants: none public.buddy_members

CREATE TABLE public.buddy_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('friend', 'match')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text CHECK (ended_reason IN ('ended', 'unfriended', 'blocked')),
  streak_weeks integer NOT NULL DEFAULT 0 CHECK (streak_weeks >= 0),
  grace_available boolean NOT NULL DEFAULT true,
  resolved_through date,
  CHECK (user_a < user_b)
);
CREATE INDEX buddy_pairs_user_a_idx ON public.buddy_pairs (user_a);
CREATE INDEX buddy_pairs_user_b_idx ON public.buddy_pairs (user_b);
ALTER TABLE public.buddy_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_pairs_select_own ON public.buddy_pairs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (user_a, user_b));
GRANT SELECT ON public.buddy_pairs TO authenticated;
GRANT ALL ON public.buddy_pairs TO service_role;

CREATE TABLE public.buddy_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_id uuid NOT NULL REFERENCES public.buddy_pairs(id) ON DELETE CASCADE
);
ALTER TABLE public.buddy_members ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.buddy_members TO service_role;

CREATE TABLE public.buddy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX buddy_requests_one_pending ON public.buddy_requests (least(from_user, to_user), greatest(from_user, to_user)) WHERE status = 'pending';
CREATE INDEX buddy_requests_to_user_idx ON public.buddy_requests (to_user);
ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_requests_select_own ON public.buddy_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (from_user, to_user));
GRANT SELECT ON public.buddy_requests TO authenticated;
GRANT ALL ON public.buddy_requests TO service_role;

CREATE TABLE public.buddy_weeks (
  pair_id uuid NOT NULL REFERENCES public.buddy_pairs(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  a_count integer NOT NULL,
  b_count integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('hit', 'grace', 'miss', 'first_week')),
  PRIMARY KEY (pair_id, week_start)
);
ALTER TABLE public.buddy_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_weeks_select_own ON public.buddy_weeks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.buddy_pairs bp WHERE bp.id = buddy_weeks.pair_id AND (SELECT auth.uid()) IN (bp.user_a, bp.user_b)));
GRANT SELECT ON public.buddy_weeks TO authenticated;
GRANT ALL ON public.buddy_weeks TO service_role;

CREATE OR REPLACE FUNCTION public._end_buddy_pair_between(_x uuid, _y uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  pid uuid;
BEGIN
  SELECT bp.id INTO pid FROM public.buddy_pairs bp
    WHERE bp.user_a = least(_x, _y) AND bp.user_b = greatest(_x, _y) AND bp.ended_at IS NULL
    FOR UPDATE;
  IF pid IS NOT NULL THEN
    UPDATE public.buddy_pairs bp SET ended_at = now(), ended_reason = _reason WHERE bp.id = pid;
    DELETE FROM public.buddy_members bm WHERE bm.pair_id = pid;
  END IF;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending'
      AND least(br.from_user, br.to_user) = least(_x, _y) AND greatest(br.from_user, br.to_user) = greatest(_x, _y);
END;
$$;

CREATE OR REPLACE FUNCTION public._buddy_on_friendship_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- friendships are two mirrored rows; the second call finds nothing to end (idempotent).
  PERFORM public._end_buddy_pair_between(OLD.user_id, OLD.friend_id, 'unfriended');
  RETURN OLD;
END;
$$;
CREATE TRIGGER buddy_end_on_unfriend AFTER DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public._buddy_on_friendship_deleted();

CREATE OR REPLACE FUNCTION public._buddy_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- block_user inserts the block BEFORE deleting the friendship rows, so this fires first and the reason is 'blocked'.
  PERFORM public._end_buddy_pair_between(NEW.blocker, NEW.blocked, 'blocked');
  RETURN NEW;
END;
$$;
CREATE TRIGGER buddy_end_on_block AFTER INSERT ON public.blocked_users
  FOR EACH ROW EXECUTE FUNCTION public._buddy_on_block();

REVOKE ALL ON FUNCTION public._end_buddy_pair_between(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_friendship_deleted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_block() FROM PUBLIC, anon, authenticated;
