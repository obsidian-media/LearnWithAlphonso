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
  ended_reason text CHECK (ended_reason IN ('ended', 'unfriended')),
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
  -- Recorded as 'unfriended', never 'blocked': buddy_pairs is readable (and exported) to BOTH buddies, while a block is
  -- visible only to the blocker (blocked_users policy). The blocked person already sees the friendship disappear.
  PERFORM public._end_buddy_pair_between(NEW.blocker, NEW.blocked, 'unfriended');
  RETURN NEW;
END;
$$;
CREATE TRIGGER buddy_end_on_block AFTER INSERT ON public.blocked_users
  FOR EACH ROW EXECUTE FUNCTION public._buddy_on_block();

REVOKE ALL ON FUNCTION public._end_buddy_pair_between(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_friendship_deleted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._buddy_on_block() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._buddy_count(_user uuid, _from timestamptz, _to timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
  SELECT count(DISTINCT (lc.language, lc.lesson_id))::integer FROM public.lesson_completions lc
  WHERE lc.user_id = _user AND lc.completed_at >= _from AND lc.completed_at < _to;
$$;

CREATE OR REPLACE FUNCTION public._create_buddy_pair(_x uuid, _y uuid, _source text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  pid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _x) THEN RETURN 'already_paired'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _y) THEN RETURN 'friend_paired'; END IF;
  BEGIN
    INSERT INTO public.buddy_pairs (user_a, user_b, source) VALUES (least(_x, _y), greatest(_x, _y), _source)
      RETURNING id INTO pid;
    INSERT INTO public.buddy_members (user_id, pair_id) VALUES (_x, pid), (_y, pid);
  EXCEPTION WHEN unique_violation THEN
    -- a concurrent pairing won the race; this block's inserts are rolled back
    RETURN 'already_paired';
  END;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.status = 'pending' AND (br.from_user IN (_x, _y) OR br.to_user IN (_x, _y));
  RETURN 'paired';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_buddy(_friend uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  reverse_id uuid;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  IF _friend IS NULL OR _friend = me OR NOT EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.user_id = me AND f.friend_id = _friend AND f.status = 'accepted'
  ) THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = _friend) OR (b.blocker = _friend AND b.blocked = me))
  THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me) THEN RETURN QUERY SELECT 'already_paired'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = _friend) THEN RETURN QUERY SELECT 'friend_paired'::text; RETURN; END IF;

  -- They already asked me: asking back is a yes.
  SELECT br.id INTO reverse_id FROM public.buddy_requests br
    WHERE br.from_user = _friend AND br.to_user = me AND br.status = 'pending' FOR UPDATE;
  IF reverse_id IS NOT NULL THEN
    UPDATE public.buddy_requests br SET status = 'accepted', responded_at = now() WHERE br.id = reverse_id;
    result := public._create_buddy_pair(me, _friend, 'friend');
    RETURN QUERY SELECT result; RETURN;
  END IF;

  INSERT INTO public.buddy_requests (from_user, to_user) VALUES (me, _friend) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN QUERY SELECT 'already_requested'::text; RETURN; END IF;
  RETURN QUERY SELECT 'requested'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_buddy_request(_request uuid, _accept boolean)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  req public.buddy_requests;
  result text;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  SELECT * INTO req FROM public.buddy_requests br WHERE br.id = _request AND br.to_user = me AND br.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  IF NOT coalesce(_accept, false) THEN
    UPDATE public.buddy_requests br SET status = 'declined', responded_at = now() WHERE br.id = req.id;
    RETURN QUERY SELECT 'declined'::text; RETURN;
  END IF;
  -- Re-check at accept time: things can change while a request waits.
  IF NOT EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = me AND f.friend_id = req.from_user AND f.status = 'accepted')
  THEN RETURN QUERY SELECT 'not_friends'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = req.from_user) OR (b.blocker = req.from_user AND b.blocked = me))
  THEN RETURN QUERY SELECT 'blocked'::text; RETURN; END IF;
  result := public._create_buddy_pair(me, req.from_user, 'friend');
  IF result = 'paired' THEN
    UPDATE public.buddy_requests br SET status = 'accepted', responded_at = now() WHERE br.id = req.id;
  END IF;
  RETURN QUERY SELECT result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_buddy_request(_request uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  UPDATE public.buddy_requests br SET status = 'cancelled', responded_at = now()
    WHERE br.id = _request AND br.from_user = me AND br.status = 'pending';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  RETURN QUERY SELECT 'cancelled'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_buddy()
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN QUERY SELECT 'not_paired'::text; RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid); -- judge finished weeks before the pair stops being resolvable
  UPDATE public.buddy_pairs bp SET ended_at = now(), ended_reason = 'ended' WHERE bp.id = pid AND bp.ended_at IS NULL;
  DELETE FROM public.buddy_members bm WHERE bm.pair_id = pid;
  RETURN QUERY SELECT 'ended'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_buddy_pair(_pair uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  goal constant integer := 3;
  p public.buddy_pairs;
  this_wk date := date_trunc('week', current_date)::date;
  first_wk date;
  wk date;
  a integer;
  b integer;
  outcome_now text;
  streak integer;
  grace boolean;
BEGIN
  SELECT * INTO p FROM public.buddy_pairs bp WHERE bp.id = _pair FOR UPDATE;
  IF NOT FOUND OR p.ended_at IS NOT NULL THEN RETURN; END IF;
  first_wk := date_trunc('week', p.created_at)::date;
  wk := coalesce(p.resolved_through + 7, first_wk);
  streak := p.streak_weeks;
  grace := p.grace_available;
  WHILE wk < this_wk LOOP
    a := public._buddy_count(p.user_a, greatest(wk::timestamptz, p.created_at), (wk + 7)::timestamptz);
    b := public._buddy_count(p.user_b, greatest(wk::timestamptz, p.created_at), (wk + 7)::timestamptz);
    IF a >= goal AND b >= goal THEN
      outcome_now := 'hit'; streak := streak + 1; grace := true;
    ELSIF wk = first_wk THEN
      outcome_now := 'first_week';
    ELSIF grace THEN
      outcome_now := 'grace'; grace := false;
    ELSE
      outcome_now := 'miss'; streak := 0;
    END IF;
    INSERT INTO public.buddy_weeks (pair_id, week_start, a_count, b_count, outcome)
      VALUES (p.id, wk, a, b, outcome_now) ON CONFLICT DO NOTHING;
    wk := wk + 7;
  END LOOP;
  IF wk <> coalesce(p.resolved_through + 7, first_wk) THEN
    UPDATE public.buddy_pairs bp SET streak_weeks = streak, grace_available = grace, resolved_through = wk - 7 WHERE bp.id = p.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_buddy()
RETURNS TABLE(pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamptz, week_start date,
  my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  wk date := date_trunc('week', current_date)::date;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid);
  RETURN QUERY
  SELECT bp.id,
    other.id,
    other.display_name,
    other.avatar_seed,
    bp.created_at,
    wk,
    public._buddy_count(me, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    public._buddy_count(other.id, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    3,
    bp.streak_weeks,
    bp.grace_available,
    (SELECT bw.outcome FROM public.buddy_weeks bw WHERE bw.pair_id = bp.id ORDER BY bw.week_start DESC LIMIT 1)
  FROM public.buddy_pairs bp
  JOIN public.profiles other ON other.id = CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END
  WHERE bp.id = pid AND bp.ended_at IS NULL; -- the pair may have ended while we waited for its lock
END;
$$;

CREATE OR REPLACE FUNCTION public.get_buddy_requests()
RETURNS TABLE(request_id uuid, direction text, other_id uuid, other_name text, other_avatar_seed text, requested_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT br.id,
    CASE WHEN br.to_user = me THEN 'incoming' ELSE 'outgoing' END,
    o.id, o.display_name, o.avatar_seed, br.created_at
  FROM public.buddy_requests br
  JOIN public.profiles o ON o.id = CASE WHEN br.to_user = me THEN br.from_user ELSE br.to_user END
  WHERE br.status = 'pending' AND me IN (br.from_user, br.to_user)
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker = me AND b.blocked = o.id) OR (b.blocker = o.id AND b.blocked = me))
  ORDER BY br.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public._buddy_count(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._create_buddy_pair(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolve_buddy_pair(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_buddy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_buddy_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_buddy_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_buddy_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.end_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_buddy() TO authenticated;
REVOKE ALL ON FUNCTION public.get_buddy_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated;
