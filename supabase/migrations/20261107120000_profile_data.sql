-- Profile data (BACKLOG 0.0-bq item 1 and 0.0-bg): the data the Profile needs that was never recorded. Data layer only;
-- no screen reads it yet except through getProfileOverview.
--
--   learning_days       lesson and practice seconds per learner per UTC day (the week rings' minutes goal).
--   mastered_words      a saved word stays counted after review retires it (apply_review_grade used to just DELETE it).
--   learner_time_zones  the learner's IANA time zone, validated. STORED AND EXPOSED ONLY: streaks and days stay UTC.
--   skill_days          right and total answers per skill per UTC day (listening, speaking, vocabulary, grammar, reading).
--   get_my_league_standing  the caller's rank among this week's learners in the same league tier, and the week's end.
--
-- Who writes: every write is a SECURITY DEFINER function with search_path='', EXECUTE for service_role only, so only
-- the server routes (complete-lesson Edge Function, /api/chat, /api/practice, a server function) can write, and the
-- server decides the values (a client names nothing). Clients may only SELECT their own rows (RLS select-own plus a
-- SELECT-only grant; REVOKE ALL first, as new public tables start with no client privileges). All tables cascade from
-- auth.users and are in the account export (src/lib/account.functions.ts).
--
-- The day is the UTC date of the server clock, written explicitly (now() AT TIME ZONE 'UTC')::date, the same rule as
-- speech_days, activity_days and the streak.
--
-- Per-call clamps (a larger number can only be a bug and is refused with 22023, never inflating the day):
--   add_learning_seconds: each of lesson and practice 0..3600.
--   add_skill_results: at most 5 entries, each right <= total <= 200, skill one of the five, no skill twice.
--
-- apply_review_grade is replaced with the SAME signature and body of 20261014100200 plus one statement: when a
-- retirement deletes a 'saved_word' item it first records it in mastered_words (ON CONFLICT DO NOTHING, so a word
-- saved and mastered twice counts once). The review queue itself behaves exactly as before.
--
-- Depends on 20261014100200 (apply_review_grade), 20261105100800 (weekly_xp_totals), 20260725012934 (language_progress).
--
-- Rollback: restore apply_review_grade from 20261014100200; DROP FUNCTION public.get_my_league_standing(text);
--   DROP FUNCTION public.set_learner_time_zone(uuid, text); DROP FUNCTION public.add_skill_results(uuid, jsonb);
--   DROP FUNCTION public.add_learning_seconds(uuid, integer, integer);
--   DROP TABLE public.skill_days, public.learner_time_zones, public.mastered_words, public.learning_days;

-- ---- learning minutes ----
CREATE TABLE public.learning_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  lesson_seconds integer NOT NULL DEFAULT 0 CHECK (lesson_seconds >= 0),
  practice_seconds integer NOT NULL DEFAULT 0 CHECK (practice_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.learning_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_days_select_own ON public.learning_days
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.learning_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_days TO authenticated;
GRANT ALL ON public.learning_days TO service_role;

CREATE FUNCTION public.add_learning_seconds(_user_id uuid, _lesson_seconds integer, _practice_seconds integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booked date;
BEGIN
  IF _user_id IS NULL OR _lesson_seconds IS NULL OR _practice_seconds IS NULL
     OR _lesson_seconds < 0 OR _lesson_seconds > 3600 OR _practice_seconds < 0 OR _practice_seconds > 3600 THEN
    RAISE EXCEPTION 'add_learning_seconds: each of lesson and practice seconds must be from 0 to 3600'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.learning_days AS l (user_id, day, lesson_seconds, practice_seconds)
  VALUES (_user_id, (now() AT TIME ZONE 'UTC')::date, _lesson_seconds, _practice_seconds)
  ON CONFLICT (user_id, day) DO UPDATE
    SET lesson_seconds = l.lesson_seconds + EXCLUDED.lesson_seconds,
        practice_seconds = l.practice_seconds + EXCLUDED.practice_seconds,
        updated_at = now()
  RETURNING l.day INTO booked;
  RETURN booked;
END;
$$;
REVOKE ALL ON FUNCTION public.add_learning_seconds(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_learning_seconds(uuid, integer, integer) TO service_role;

-- ---- mastered words ----
CREATE TABLE public.mastered_words (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL,
  item_key text NOT NULL,
  mastered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language, item_key)
);
ALTER TABLE public.mastered_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY mastered_words_select_own ON public.mastered_words
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.mastered_words FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mastered_words TO authenticated;
GRANT ALL ON public.mastered_words TO service_role;

CREATE OR REPLACE FUNCTION public.apply_review_grade(
  _user_id uuid,
  _item_key text,
  _language text,
  _attempt_id text,
  _expected_last_reviewed_at timestamptz,
  _expected_due_on date,
  _retired boolean,
  _correct boolean,
  _new_due_on date,
  _ease real,
  _interval_days integer,
  _repetitions integer,
  _lapses integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.review_items%ROWTYPE;
  _previous jsonb;
  _previous_item_key text;
  _previous_language text;
  _result jsonb;
BEGIN
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review account no longer exists';
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT result, item_key, language INTO _previous, _previous_item_key, _previous_language
      FROM public.review_grade_attempts
      WHERE user_id = _user_id AND attempt_id = _attempt_id;
    IF FOUND THEN
      IF _previous_item_key <> _item_key OR _previous_language <> _language THEN
        RAISE EXCEPTION 'review attempt identity collision';
      END IF;
      RETURN _previous;
    END IF;
  END IF;

  SELECT * INTO _row FROM public.review_items
    WHERE user_id = _user_id AND item_key = _item_key AND language = _language
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF _row.due_on > (now() AT TIME ZONE 'utc')::date THEN
    RETURN jsonb_build_object('status', 'not_due');
  END IF;
  IF _row.last_reviewed_at IS DISTINCT FROM _expected_last_reviewed_at
     OR _row.due_on IS DISTINCT FROM _expected_due_on THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _retired THEN
    -- Keep a mastered saved word counted: the review row goes, the marker stays.
    IF _row.source = 'saved_word' THEN
      INSERT INTO public.mastered_words (user_id, language, item_key)
        VALUES (_user_id, _row.language, _row.item_key)
        ON CONFLICT (user_id, language, item_key) DO NOTHING;
    END IF;
    DELETE FROM public.review_items WHERE id = _row.id;
    IF _row.source = 'weakness' AND _row.weakness_label IS NOT NULL THEN
      INSERT INTO public.weakness_events (user_id, category, event_type)
        VALUES (_user_id, _row.weakness_label, 'resolved');
    END IF;
  ELSE
    UPDATE public.review_items SET
      ease = _ease,
      interval_days = _interval_days,
      repetitions = _repetitions,
      lapses = _lapses,
      due_on = _new_due_on,
      last_reviewed_at = now()
    WHERE id = _row.id;
  END IF;

  _result := jsonb_build_object(
    'status', 'applied', 'retired', _retired,
    'dueOn', _new_due_on, 'correct', _correct
  );
  IF _attempt_id IS NOT NULL THEN
    INSERT INTO public.review_grade_attempts
      (user_id, attempt_id, item_key, language, result)
      VALUES (_user_id, _attempt_id, _item_key, _language, _result);
  END IF;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_review_grade(uuid,text,text,text,timestamptz,date,boolean,boolean,date,real,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_review_grade(uuid,text,text,text,timestamptz,date,boolean,boolean,date,real,integer,integer,integer)
  TO service_role;

-- ---- time zone (stored and exposed only) ----
CREATE TABLE public.learner_time_zones (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  time_zone text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learner_time_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY learner_time_zones_select_own ON public.learner_time_zones
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.learner_time_zones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learner_time_zones TO authenticated;
GRANT ALL ON public.learner_time_zones TO service_role;

-- Validated against the database's own zone list, so only a real IANA name is stored (22023 otherwise).
CREATE FUNCTION public.set_learner_time_zone(_user_id uuid, _time_zone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _user_id IS NULL OR _time_zone IS NULL OR char_length(_time_zone) > 64
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names n WHERE n.name = _time_zone) THEN
    RAISE EXCEPTION 'set_learner_time_zone: not a known time zone' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.learner_time_zones AS t (user_id, time_zone)
  VALUES (_user_id, _time_zone)
  ON CONFLICT (user_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now();
  RETURN _time_zone;
END;
$$;
REVOKE ALL ON FUNCTION public.set_learner_time_zone(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_learner_time_zone(uuid, text) TO service_role;

-- ---- skills ----
CREATE TABLE public.skill_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  skill text NOT NULL CHECK (skill IN ('listening', 'speaking', 'vocabulary', 'grammar', 'reading')),
  right_answers integer NOT NULL DEFAULT 0 CHECK (right_answers >= 0),
  total_answers integer NOT NULL DEFAULT 0 CHECK (total_answers >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, skill),
  CHECK (right_answers <= total_answers)
);
ALTER TABLE public.skill_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_days_select_own ON public.skill_days
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.skill_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.skill_days TO authenticated;
GRANT ALL ON public.skill_days TO service_role;

-- _results: [{"skill": "listening", "right": 3, "total": 4}, ...], one entry per skill. Every entry is checked before
-- any is written, so one bad entry writes nothing. Returns the number of skills written.
CREATE FUNCTION public.add_skill_results(_user_id uuid, _results jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  entry jsonb;
  seen text[] := '{}';
  s text;
  r integer;
  t integer;
  n integer := 0;
BEGIN
  IF _user_id IS NULL OR _results IS NULL OR jsonb_typeof(_results) <> 'array'
     OR jsonb_array_length(_results) > 5 THEN
    RAISE EXCEPTION 'add_skill_results: results must be an array of at most 5 entries' USING ERRCODE = '22023';
  END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(_results) LOOP
    s := entry ->> 'skill';
    IF jsonb_typeof(entry -> 'right') IS DISTINCT FROM 'number'
       OR jsonb_typeof(entry -> 'total') IS DISTINCT FROM 'number'
       OR s IS NULL OR s <> ALL (ARRAY['listening', 'speaking', 'vocabulary', 'grammar', 'reading'])
       OR s = ANY (seen) THEN
      RAISE EXCEPTION 'add_skill_results: bad entry' USING ERRCODE = '22023';
    END IF;
    IF (entry ->> 'right')::numeric <> trunc((entry ->> 'right')::numeric)
       OR (entry ->> 'total')::numeric <> trunc((entry ->> 'total')::numeric)
       OR (entry ->> 'right')::numeric < 0 OR (entry ->> 'total')::numeric > 200
       OR (entry ->> 'right')::numeric > (entry ->> 'total')::numeric THEN
      RAISE EXCEPTION 'add_skill_results: right must be from 0 to total, total at most 200' USING ERRCODE = '22023';
    END IF;
    seen := seen || s;
  END LOOP;
  FOR entry IN SELECT * FROM jsonb_array_elements(_results) LOOP
    r := (entry ->> 'right')::numeric::integer;
    t := (entry ->> 'total')::numeric::integer;
    CONTINUE WHEN t = 0;
    INSERT INTO public.skill_days AS d (user_id, day, skill, right_answers, total_answers)
    VALUES (_user_id, (now() AT TIME ZONE 'UTC')::date, entry ->> 'skill', r, t)
    ON CONFLICT (user_id, day, skill) DO UPDATE
      SET right_answers = d.right_answers + EXCLUDED.right_answers,
          total_answers = d.total_answers + EXCLUDED.total_answers,
          updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.add_skill_results(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_skill_results(uuid, jsonb) TO service_role;

-- ---- league standing ----
-- The CALLER's rank this ISO week (Monday to Sunday, UTC) among learners whose league tier on `_course` is the same
-- as theirs, by weekly XP (weekly_xp_totals). Ties share the better rank. size counts the learners with XP this week
-- plus the caller. Reads only the caller (auth.uid()); another learner's standing cannot be asked for. No rows when the
-- caller has no language_progress row for the course.
CREATE FUNCTION public.get_my_league_standing(_course text)
RETURNS TABLE (league_tier text, rank integer, size integer, week_start date, week_end date, week_xp integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  wk date := (now() AT TIME ZONE 'UTC')::date - (extract(isodow FROM (now() AT TIME ZONE 'UTC')::date)::int - 1);
  my_tier text;
  mine integer;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT lp.league_tier INTO my_tier FROM public.language_progress lp WHERE lp.user_id = me AND lp.language = _course;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  mine := coalesce((SELECT w.xp FROM public.weekly_xp_totals w WHERE w.user_id = me AND w.week_start = wk), 0);
  RETURN QUERY
  SELECT
    my_tier,
    1 + (count(*) FILTER (WHERE o.xp > mine))::integer,
    (count(*))::integer + 1,
    wk,
    wk + 6,
    mine
  FROM public.weekly_xp_totals o
  JOIN public.language_progress p ON p.user_id = o.user_id AND p.language = _course
  WHERE o.week_start = wk AND o.xp > 0 AND o.user_id <> me AND p.league_tier = my_tier;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_league_standing(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_league_standing(text) TO authenticated, service_role;
