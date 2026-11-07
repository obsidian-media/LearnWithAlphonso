-- Practice stars (BACKLOG 0.0-bj): every scenario and every campaign scene earns 1 to 3 stars from how a call went,
-- the best is kept, and "Continue" on the Practice hub resumes a campaign at its first scene without stars.
--
-- Two tables:
--
-- practice_calls: one row per call, holding what the SERVER saw of it. /api/chat records each learner reply after
-- it has the model's verdict on it (record_practice_reply): a reply judged right, a reply under the word minimum, a
-- reply that fell back to English. The scenario or scene is the one the whitelisted system prompt belongs to, never
-- a client field. The client only names the call (a random uuid it generates when the call starts).
--
-- practice_stars: per learner, course and item, the best stars ever earned and when it was last played. "Continue"
-- is derived from it (the most recently played campaign scene, then that campaign's first scene without stars), so
-- the saved place in a campaign needs no table of its own and cannot disagree with the stars.
--
-- Why a client cannot forge stars: clients may only SELECT their own rows in both tables (RLS + a SELECT-only grant).
-- Both functions that write are SECURITY DEFINER, EXECUTE for service_role only, so the only writers are the server
-- routes, and the stars come from the tallies above: finish_practice_call takes the stars the server computed from
-- the call's own row (src/lib/practice-stars.ts holds the rule and its thresholds) and refuses them when the tally
-- has moved since it was read (_replies must still match), when the call is not this user's, or when it was already
-- finished. Keep-best is enforced here, in SQL: greatest(best, new).
--
-- Rows go with the account (ON DELETE CASCADE from auth.users) and are part of the account export.
--
-- Rollback: DROP FUNCTION public.finish_practice_call(uuid, uuid, integer, smallint);
--           DROP FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean);
--           DROP TABLE public.practice_stars; DROP TABLE public.practice_calls;

CREATE TABLE public.practice_calls (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  kind text NOT NULL CHECK (kind IN ('scenario', 'scene')),
  item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 120),
  replies integer NOT NULL DEFAULT 0 CHECK (replies BETWEEN 0 AND 500),
  right_replies integer NOT NULL DEFAULT 0,
  short_replies integer NOT NULL DEFAULT 0,
  english_replies integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_reply_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stars smallint CHECK (stars BETWEEN 0 AND 3),
  CHECK (right_replies BETWEEN 0 AND replies),
  CHECK (short_replies BETWEEN 0 AND replies),
  CHECK (english_replies BETWEEN 0 AND replies),
  CHECK ((finished_at IS NULL) = (stars IS NULL))
);
CREATE INDEX practice_calls_user_idx ON public.practice_calls (user_id, started_at);
ALTER TABLE public.practice_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY practice_calls_select_own ON public.practice_calls
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.practice_calls FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_calls TO authenticated;
GRANT ALL ON public.practice_calls TO service_role;

CREATE TABLE public.practice_stars (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  kind text NOT NULL CHECK (kind IN ('scenario', 'scene')),
  item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 120),
  best_stars smallint NOT NULL CHECK (best_stars BETWEEN 1 AND 3),
  plays integer NOT NULL DEFAULT 1 CHECK (plays >= 1),
  last_played_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course, kind, item_key)
);
ALTER TABLE public.practice_stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY practice_stars_select_own ON public.practice_stars
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.practice_stars FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_stars TO authenticated;
GRANT ALL ON public.practice_stars TO service_role;

-- One learner reply, recorded by /api/chat once the reply has been judged. Creates the call on its first reply. A
-- call belongs to one user, course and item for life, and takes no reply once finished: either mismatch raises
-- 22023 and nothing is written. Returns the call's reply count.
CREATE FUNCTION public.record_practice_reply(
  _user_id uuid,
  _call_id uuid,
  _course text,
  _kind text,
  _item_key text,
  _right boolean,
  _short boolean,
  _english boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total integer;
BEGIN
  IF _user_id IS NULL OR _call_id IS NULL OR _right IS NULL OR _short IS NULL OR _english IS NULL THEN
    RAISE EXCEPTION 'record_practice_reply: missing argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.practice_calls AS c
    (id, user_id, course, kind, item_key, replies, right_replies, short_replies, english_replies)
  VALUES
    (_call_id, _user_id, _course, _kind, _item_key, 1, _right::int, _short::int, _english::int)
  ON CONFLICT (id) DO UPDATE
    SET replies = c.replies + 1,
        right_replies = c.right_replies + EXCLUDED.right_replies,
        short_replies = c.short_replies + EXCLUDED.short_replies,
        english_replies = c.english_replies + EXCLUDED.english_replies,
        last_reply_at = now()
    WHERE c.user_id = EXCLUDED.user_id
      AND c.course = EXCLUDED.course
      AND c.kind = EXCLUDED.kind
      AND c.item_key = EXCLUDED.item_key
      AND c.finished_at IS NULL
  RETURNING c.replies INTO total;
  IF total IS NULL THEN
    RAISE EXCEPTION 'record_practice_reply: call belongs to another user or item, or is finished'
      USING ERRCODE = '22023';
  END IF;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean)
  TO service_role;

-- Finishes a call once: stores the stars the server computed from this call's tally (read with `_replies` replies)
-- and, for 1 star or more, keeps the best in practice_stars. Returns the call's stars, the best before and the best
-- after. Refused (22023) when the call is not this user's, already finished, or has taken a reply since it was read.
CREATE FUNCTION public.finish_practice_call(
  _user_id uuid,
  _call_id uuid,
  _replies integer,
  _stars smallint
)
RETURNS TABLE (call_stars smallint, best_before smallint, best_after smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  call_row public.practice_calls%ROWTYPE;
  before_best smallint;
  after_best smallint;
BEGIN
  IF _stars IS NULL OR _stars < 0 OR _stars > 3 THEN
    RAISE EXCEPTION 'finish_practice_call: stars must be from 0 to 3' USING ERRCODE = '22023';
  END IF;
  UPDATE public.practice_calls AS c
    SET finished_at = now(), stars = _stars
    WHERE c.id = _call_id
      AND c.user_id = _user_id
      AND c.finished_at IS NULL
      AND c.replies = _replies
    RETURNING c.* INTO call_row;
  IF call_row.id IS NULL THEN
    RAISE EXCEPTION 'finish_practice_call: no open call with that tally for this user' USING ERRCODE = '22023';
  END IF;

  SELECT s.best_stars INTO before_best
    FROM public.practice_stars AS s
    WHERE s.user_id = _user_id AND s.course = call_row.course
      AND s.kind = call_row.kind AND s.item_key = call_row.item_key;

  IF _stars >= 1 THEN
    INSERT INTO public.practice_stars AS s (user_id, course, kind, item_key, best_stars)
    VALUES (_user_id, call_row.course, call_row.kind, call_row.item_key, _stars)
    ON CONFLICT (user_id, course, kind, item_key) DO UPDATE
      SET best_stars = greatest(s.best_stars, EXCLUDED.best_stars),
          plays = s.plays + 1,
          last_played_at = now(),
          updated_at = CASE WHEN EXCLUDED.best_stars > s.best_stars THEN now() ELSE s.updated_at END
    RETURNING s.best_stars INTO after_best;
  ELSE
    after_best := before_best;
  END IF;

  RETURN QUERY SELECT _stars, coalesce(before_best, 0::smallint), coalesce(after_best, 0::smallint);
END;
$$;
REVOKE ALL ON FUNCTION public.finish_practice_call(uuid, uuid, integer, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_practice_call(uuid, uuid, integer, smallint) TO service_role;
