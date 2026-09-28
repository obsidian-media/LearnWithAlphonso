-- Pre-publication content filter for public-facing user-generated text
-- (Apple Guideline 1.2: an app with UGC needs filtering BEFORE it's
-- posted, on top of the report/block/contact mechanisms this project
-- already has -- verified 2026-09-28 that none existed anywhere in the
-- codebase). Covers the two places a learner's own text becomes visible
-- to other users: their display name (shown on public leaderboards,
-- teams, duels, friend lists) and a team's name (shown to anyone who
-- can see or join it).
--
-- This is a real, working baseline, not a claim of completeness. It
-- catches unambiguous, severe terms with basic evasion-normalization
-- (case, leetspeak substitution, punctuation/spacing stripped) -- it is
-- not a substitute for a proper moderation service if abuse in practice
-- turns out to need one. Extend BLOCKED_TERMS as real cases surface;
-- report/block (already shipped) remains the backstop for anything this
-- misses.

-- Case/leetspeak/punctuation-normalizes `input` so "b4dw0rd", "B A D
-- W O R D" and "bad-word" all match the same way a plain substring
-- check would miss. IMMUTABLE: pure function of its argument, safe to
-- use in a CHECK constraint or index if ever needed later.
CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- translate() maps positionally: from[i] -> to[i]. Both strings must
  -- stay the same length or characters past the shorter one are
  -- silently dropped instead of substituted -- 0/1/3/4/5/7/$/@/!/+ (10)
  -- to o/i/e/a/s/t/s/a/i/t (10).
  SELECT regexp_replace(
    translate(
      lower(coalesce(input, '')),
      '013457$@!+',
      'oieastsait'
    ),
    '[^a-z0-9]',
    '',
    'g'
  );
$$;

-- A starting, non-exhaustive list of unambiguous slurs and severe
-- profanity. Kept as its own function (not inlined into the trigger)
-- so it has exactly one place to review or extend.
CREATE OR REPLACE FUNCTION public.blocked_moderation_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'nigger', 'nigga', 'chink', 'spic', 'kike', 'faggot', 'fag',
    'retard', 'tranny', 'wetback', 'gook', 'coon', 'paki',
    'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'whore', 'slut',
    'asshole', 'motherfucker', 'dick', 'pussy', 'cock', 'rape',
    'pedo', 'pedophile', 'nazi', 'hitler',
    -- Common French/Spanish severe terms, matching the app's 3 courses.
    -- Not remotely exhaustive for either language.
    'salope', 'pute', 'enculé', 'negre',
    'puta', 'maricon', 'gilipollas', 'coño'
  ];
$$;

CREATE OR REPLACE FUNCTION public.contains_blocked_term(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.blocked_moderation_terms()) AS term
    WHERE public.normalize_for_moderation(input) LIKE '%' || term || '%'
  );
$$;

-- profiles.display_name: enforced at the trigger level because it is
-- written by a direct PostgREST PATCH
-- (ProgressSyncClient+DisplayIdentity.swift), not through a server
-- function with its own validation layer -- a trigger is the one point
-- that cannot be bypassed by a future write path either.
CREATE OR REPLACE FUNCTION public.enforce_display_name_filter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL AND public.contains_blocked_term(NEW.display_name) THEN
    RAISE EXCEPTION 'display name not allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_display_name_filter ON public.profiles;
CREATE TRIGGER enforce_display_name_filter
  BEFORE INSERT OR UPDATE OF display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_display_name_filter();

COMMENT ON FUNCTION public.enforce_display_name_filter() IS
  'Apple Guideline 1.2 pre-publication UGC filter -- see 20260930030000_ugc_content_filter.sql';

-- create_team (20260929010000_create_team.sql), re-published with one
-- added check: a blocked-content team name now returns the same
-- structured {ok:false, reason:...} shape every other rejection here
-- already uses, rather than relying only on a raised trigger exception
-- (which this RPC's own callers, per teams.functions.ts's toCreateResult,
-- are not written to catch). Everything else is identical to the
-- original definition.
CREATE OR REPLACE FUNCTION public.create_team(
  _name text,
  _visibility text DEFAULT 'public',
  _member_cap integer DEFAULT 30
)
RETURNS TABLE(ok boolean, reason text, team_id uuid, join_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  trimmed_name text := trim(_name);
  new_id uuid;
  new_code text;
  join_result record;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF char_length(trimmed_name) < 1 OR char_length(trimmed_name) > 40 THEN
    RETURN QUERY SELECT false, 'invalid-name', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF public.contains_blocked_term(trimmed_name) THEN
    RETURN QUERY SELECT false, 'blocked-content', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _visibility NOT IN ('public', 'private') THEN
    RETURN QUERY SELECT false, 'invalid-visibility', NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF _member_cap < 2 OR _member_cap > 200 THEN
    RETURN QUERY SELECT false, 'invalid-member-cap', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  new_code := encode(gen_random_bytes(6), 'base64');
  INSERT INTO public.teams (name, join_code, visibility, member_cap, created_by)
  VALUES (trimmed_name, new_code, _visibility, _member_cap, me)
  RETURNING id INTO new_id;

  SELECT * INTO join_result FROM public._join_team_impl(new_id, me);
  IF NOT join_result.ok THEN
    -- Only ever reachable via the switch-lock branch -- a brand-new team
    -- has zero members, so current_count(0) < member_cap always holds.
    DELETE FROM public.teams WHERE id = new_id;
    RETURN QUERY SELECT false, join_result.reason, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, new_id, new_code;
END;
$$;
