-- Name policy for public names (display names and team names): self-harm phrases, drug words, sexual terms and
-- impersonation of staff or the app.
--
-- The final App Store audit found that display_name_problem / team_name_problem (filter v2,
-- 20261008130000_moderation_filter_v2.sql) let through "kill yourself", "KYS", "Admin", "Alphonso Support",
-- "cocaine" and "sexy". Slurs, leetspeak and dotted forms were already blocked.
--
-- Where the rules live: ONLY in the new name_policy_blocked(text), called from display_name_problem (and so from
-- team_name_problem, which delegates, and from create_team, confirm_display_name, the profile trigger and the
-- admin rename). contains_blocked_term is untouched on purpose: the AI output check (20261011100100) also uses it,
-- and a chatbot reply that says "sex education", "support" or "Apple" must not be withheld.
--
-- Pipeline: the same as contains_blocked_term (NFKC, default-ignorable strip, accent/leetspeak/homoglyph fold, then
-- two separator forms: spaces, and punctuation inside words deleted, so "A.d.m.i.n" and "k.y.s" are caught; runs of
-- single letters are joined, so "s e x" is caught). Rules on each form:
--   1. whole words and phrases (name_policy_terms): "kill yourself", "kys", "kms", cocaine, heroin, meth, sex, sexy,
--      porn, nude ... A word is a whole space-delimited token, so "Essex", "Sussex", "Sexton" and "Methodist"
--      are untouched. The phrase with its spaces removed also matches the whole input
--      ("KillYourself").
--   2. inside a token: cocain (cocaine, cocaina; the accented spelling folds to cocaina; never part of a normal word).
--   3. start or end of a token (name_policy_edge_patterns): sexy, cocain ("SexyBoy"), but not "Sexton". porn is a whole
--      word only, plus pornstar and pornking: Thai names such as Pornthip and Siriporn contain it.
--   4. staff words as a whole token anywhere (name_policy_staff_terms): admin, moderator, mod, staff, support,
--      official ("Learner Support", "Mod Squad"); and a token that STARTS with admin, moderator or official
--      ("Admin123", "Administrator").
--   5. the app's own names: "Apple" alone is blocked. "Alphonso" and "Hector" (also Hector with an accent) are real
--      given names and are allowed alone and with a surname ("Hector Garcia"); they are blocked only joined to a role
--      word (name_policy_brand_roles: support, team, tutor, ai, bot, admin ...): "Hector Support", "HectorTutor",
--      "Alphonso Admin". "Apple" plus a role word is blocked too.
--
-- The error code is the existing 'blocked-content', so the copy "That name isn't allowed. Try another." (web and
-- iOS build 50) is unchanged.
--
-- Existing names are NOT renamed here. Run the read-only check in the PR before merging to see who would now fail;
-- a name that fails is only refused the next time it is written, never changed by this migration.
--
-- Grants: the helpers are service-only, like the other lists (a client must not be able to read the blocklist).
-- display_name_problem keeps its existing grants (CREATE OR REPLACE preserves them).
--
-- Rollback (one transaction): re-run the CREATE OR REPLACE FUNCTION display_name_problem statement from
-- 20261008130000_moderation_filter_v2.sql, then
--   DROP FUNCTION public.name_policy_blocked(text), public.name_policy_terms(),
--     public.name_policy_edge_patterns(), public.name_policy_staff_terms(), public.name_policy_brand_terms(),
--     public.name_policy_brand_roles(), public.name_policy_bare_brand_terms();

CREATE OR REPLACE FUNCTION public.name_policy_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    -- self-harm
    'kill yourself', 'kill your self', 'kill urself', 'kill ur self', 'kys', 'kms',
    'commit suicide', 'hang yourself', 'kill myself',
    -- drugs
    'cocaine', 'cocaina', 'heroin', 'heroina', 'meth', 'methamphetamine', 'metanfetamina', 'fentanyl', 'mdma', 'lsd',
    'opium', 'marijuana', 'marihuana', 'crack cocaine',
    -- sexual
    'sex', 'sexy', 'sexting', 'porn', 'porno', 'pornhub', 'pornstar', 'pornking', 'nude', 'nudes', 'naked', 'xxx', 'nsfw', 'horny',
    'erotic', 'hentai', 'boobs', 'tits', 'dildo', 'orgasm', 'incest', 'milf', 'onlyfans'
  ];
$$;

CREATE OR REPLACE FUNCTION public.name_policy_edge_patterns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['sexy', 'cocain'];
$$;

CREATE OR REPLACE FUNCTION public.name_policy_staff_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['admin', 'admins', 'administrator', 'administrators', 'moderator', 'moderators', 'mod', 'mods',
    'staff', 'support', 'official'];
$$;

CREATE OR REPLACE FUNCTION public.name_policy_brand_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['alphonso', 'hector', 'apple'];
$$;

-- Brand names that are blocked even on their own. Alphonso and Hector are real given names, so they are blocked only
-- together with a role word (name_policy_brand_roles); "Apple" is not a given name.
CREATE OR REPLACE FUNCTION public.name_policy_bare_brand_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['apple'];
$$;

CREATE OR REPLACE FUNCTION public.name_policy_brand_roles()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['support', 'admin', 'official', 'staff', 'team', 'mod', 'moderator', 'tutor', 'ai', 'bot', 'help',
    'app', 'inc', 'security', 'review', 'store', 'learning', 'english', 'french', 'spanish'];
$$;

CREATE OR REPLACE FUNCTION public.name_policy_blocked(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT public.moderation_fold(coalesce(public.moderation_clean_text(input), '')) AS f
  ), forms AS (
    SELECT btrim(regexp_replace(f, '[^a-z0-9*]+', ' ', 'g')) AS t FROM s
    UNION ALL
    SELECT btrim(regexp_replace(regexp_replace(f, '[^a-z0-9*\s]+', '', 'g'), '[^a-z0-9*]+', ' ', 'g')) FROM s
  ), j AS (
    -- Join runs of single characters: "s e x" becomes "sex".
    SELECT regexp_replace(t, '(?<=(^| )[a-z0-9]) (?=[a-z0-9]( |$))', '', 'g') AS tr FROM forms
  )
  SELECT coalesce(bool_or(
    j.tr ~ ('(^| )(' || array_to_string(public.name_policy_terms(), '|') || ')( |$)')
    OR replace(j.tr, ' ', '') ~ ('^(' || (SELECT array_to_string(array_agg(replace(w, ' ', '')), '|')
                                         FROM unnest(public.name_policy_terms()) AS w) || ')$')
    OR j.tr ~ 'cocain'
    OR j.tr ~ ('(^| )(' || array_to_string(public.name_policy_edge_patterns(), '|') || ')')
    OR j.tr ~ ('(' || array_to_string(public.name_policy_edge_patterns(), '|') || ')( |$)')
    OR j.tr ~ ('(^| )(' || array_to_string(public.name_policy_staff_terms(), '|') || ')( |$)')
    OR j.tr ~ '(^| )(admin|moderator|official)'
    OR replace(j.tr, ' ', '') ~ ('^(' || array_to_string(public.name_policy_bare_brand_terms(), '|') || '|('
         || array_to_string(public.name_policy_brand_terms(), '|') || ')(' || array_to_string(public.name_policy_brand_roles(), '|')
         || '))$')
  ), false)
  FROM j;
$$;

CREATE OR REPLACE FUNCTION public.display_name_problem(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cleaned text := public.moderation_clean_text(_name);
BEGIN
  IF cleaned IS NULL OR char_length(cleaned) < 2 OR char_length(cleaned) > 40 THEN
    RETURN 'invalid-name';
  END IF;
  -- Something other than ASCII punctuation and spaces must remain ("!!" is not a name; a CJK name is).
  IF regexp_replace(cleaned, '[\s\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]', '', 'g') = '' THEN
    RETURN 'invalid-name';
  END IF;
  -- Bidi override and isolate characters make text display in a different order from the one checked here.
  IF coalesce(_name, '') ~ '[\u202A-\u202E\u2066-\u2069]' THEN
    RETURN 'blocked-content';
  END IF;
  -- Control characters, emoji and pictographs are refused outright.
  IF cleaned ~ '[\x01-\x1F\x7F]' OR cleaned ~ '[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF]' THEN
    RETURN 'blocked-content';
  END IF;
  IF public.contains_blocked_term(cleaned) THEN
    RETURN 'blocked-content';
  END IF;
  -- Self-harm, drugs, sexual terms and impersonation of staff or the app (this migration).
  IF public.name_policy_blocked(cleaned) THEN
    RETURN 'blocked-content';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.name_policy_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_edge_patterns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_staff_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_brand_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_bare_brand_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_brand_roles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.name_policy_blocked(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.name_policy_terms(), public.name_policy_edge_patterns(),
  public.name_policy_staff_terms(), public.name_policy_brand_terms(), public.name_policy_bare_brand_terms(),
  public.name_policy_brand_roles(),
  public.name_policy_blocked(text) TO service_role;
REVOKE ALL ON FUNCTION public.display_name_problem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;
