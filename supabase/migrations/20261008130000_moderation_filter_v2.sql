-- Moderation filter v2 for public names (display names and team names).
--
-- Replaces the matcher from 20260930120000_ugc_filter_word_boundary_fix.sql. That version folded leetspeak,
-- accents and Cyrillic/Greek look-alikes, but:
--   * full-width and mathematical letters were deleted instead of folded, so they matched nothing;
--   * an invisible character inside a word became a word break, so the whole-word pass missed the word;
--   * compounds ("FuckYou", "Shithead") are never whole words, so they passed;
--   * real given names and surnames ("Dick", "Coon") were blocked as standalone tokens.
--
-- Pipeline:
--   1. moderation_clean_text: NFKC (folds full-width, mathematical and ligature forms), removes default-ignorable
--      characters (zero-width, bidi controls, tag characters, variation selectors, Hangul fillers) except ZWNJ and
--      ZWJ, which Persian and Indic names need, and collapses whitespace. This is the form a name is STORED in.
--   2. moderation_fold: lower-case, removes ZWNJ, ZWJ and every combining mark (after NFD), folds leetspeak and
--      Cyrillic/Greek homoglyphs. normalize_for_moderation then turns every run outside [a-z0-9*] into one space;
--      '*' is kept because it is the usual masking character.
--   3. contains_blocked_term checks two forms of the text: separators as spaces, and punctuation inside words
--      deleted (so "Fu.ck" cannot hide a word). In each, runs of single letters are joined ("f u c k"), an allowlist
--      masks known legitimate names, then:
--      a. whole words (blocked_moderation_terms), or the whole input with separators removed equal to one;
--      b. severe patterns anywhere inside a token (moderation_anywhere_patterns);
--      c. patterns at the start or end of a token (moderation_edge_patterns): "Shithead", but not "Yoshito";
--      d. contextual words, abusive only next to a marker: moderation_contextual_terms with a sexual or slur marker
--         (moderation_context_markers), and the anatomy words (moderation_anatomy_terms) also with a size or
--         possessive marker (moderation_anatomy_markers). "Big Dick" is blocked; "Dick Van Dyke", "Jenny Coon" and
--         "My Gay Uncle" are not.
--      Accented words that fold onto a blocked word ("râpé", "rapé") are masked before folding.
--
-- display_name_problem(name) is the verdict for display names, team_name_problem(name) the same rules for team
-- names: NULL (fine), 'invalid-name' (after cleaning, not 2 to 40 characters, or nothing but ASCII punctuation) or
-- 'blocked-content' (bidi override or isolate characters in the input, control characters, emoji, or a filter
-- hit). Every writer stores moderation_clean_text(name).
--
-- Grants: the helpers are service-only. The profile trigger and display_name_problem are SECURITY DEFINER, so a
-- client never needs EXECUTE on the lists (which would let anyone read the blocklist and probe around it).
--
-- Rollback (roll back 20261008130100 first; then one transaction): re-run the CREATE OR REPLACE statements for
-- normalize_for_moderation and contains_blocked_term from 20260930120000_ugc_filter_word_boundary_fix.sql and for
-- blocked_moderation_terms and enforce_display_name_filter from 20260930030000_ugc_content_filter.sql; then
--   GRANT EXECUTE ON FUNCTION public.normalize_for_moderation(text), public.contains_blocked_term(text),
--     public.blocked_moderation_terms(), public.enforce_display_name_filter() TO PUBLIC;
--   ALTER FUNCTION public.enforce_display_name_filter() SECURITY INVOKER;
--   DROP FUNCTION public.display_name_problem(text), public.team_name_problem(text), public.moderation_clean_text(text),
--     public.moderation_fold(text), public.moderation_anywhere_patterns(), public.moderation_edge_patterns(),
--     public.moderation_contextual_terms(), public.moderation_context_markers(), public.moderation_anatomy_terms(),
--     public.moderation_anatomy_markers(), public.moderation_allowlist_pattern(),
--     public.moderation_accented_allowlist_pattern(), public.admin_rename_team(uuid, text);

CREATE OR REPLACE FUNCTION public.moderation_clean_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Default-ignorable code points except U+200C (ZWNJ) and U+200D (ZWJ).
  SELECT NULLIF(btrim(regexp_replace(
    regexp_replace(
      normalize(coalesce(input, ''), NFKC),
      '[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]',
      '', 'g'),
    '\s+', ' ', 'g')), '');
$$;

-- The comparison form before separators are decided: lower-case, no ZWNJ/ZWJ, no combining marks (Latin accents,
-- extended, supplement, symbol and half marks), leetspeak and Cyrillic/Greek homoglyphs folded.
CREATE OR REPLACE FUNCTION public.moderation_fold(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- translate() maps positionally; both strings are 29 characters: 11 leetspeak, 10 Cyrillic, 8 Greek
  -- (codepoints as in 20260930090000_ugc_filter_homoglyph_confusables.sql).
  SELECT translate(
    regexp_replace(
      normalize(lower(regexp_replace(coalesce(public.moderation_clean_text(input), ''), '[\u200C\u200D]', '', 'g')), NFD),
      '[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g'),
    '013457$@!+|'
      || chr(1072) || chr(1077) || chr(1086) || chr(1088) || chr(1089)
      || chr(1091) || chr(1093) || chr(1110) || chr(1112) || chr(1109)
      || chr(945) || chr(953) || chr(954) || chr(957) || chr(959)
      || chr(961) || chr(964) || chr(965),
    'oieastsaiti' || 'aeopcyxijs' || 'aikvoptu');
$$;

CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(public.moderation_fold(input), '[^a-z0-9*]+', ' ', 'g'));
$$;

-- Whole words, in normalized form (ASCII, no accents: 'encule' matches "enculé").
CREATE OR REPLACE FUNCTION public.blocked_moderation_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'nigger', 'nigga', 'chink', 'spic', 'kike', 'faggot', 'fag', 'retard', 'tranny', 'wetback', 'gook', 'paki',
    'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'asshole', 'motherfucker', 'pussy', 'rape',
    'rapist', 'pedo', 'pedophile', 'nazi', 'hitler', 'twat', 'wanker', 'porn', 'porno',
    'salope', 'pute', 'encule', 'puta', 'maricon', 'gilipollas'
  ];
$$;

-- Regexes matched anywhere in the (allowlist-masked) text. '[x*]' accepts a masked letter; '?' an omitted one.
CREATE OR REPLACE FUNCTION public.moderation_anywhere_patterns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'n[i*]?gg[e*]r', 'n[i*]gg[a*]', 'f[a*]gg[o*]t', 'f[u*]ck', 'c[u*]nt', 'wh[o*]r[e*]', 'm[o*]th[e*]rf',
    'p[e*]d[o*]ph', '[a*]ssh[o*]l[e*]', 'r[a*]p[i*]st', 'bl[o*]wj[o*]b',
    'd[i*]ckh[e*]ad', 'd[i*]cks[u*]ck', 's[u*]ckd[i*]ck', 'b[i*]gd[i*]ck',
    'c[o*]ckh[e*]ad', 'c[o*]cks[u*]ck', 's[u*]ckc[o*]ck'
  ];
$$;

-- Regexes matched only at the start or the end of a token.
CREATE OR REPLACE FUNCTION public.moderation_edge_patterns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['sh[i*]t', 'b[i*]tch', 'sl[u*]t', 'p[u*]ss[y*]'];
$$;

-- Real names and words that are only abusive next to a sexual or slur marker.
CREATE OR REPLACE FUNCTION public.moderation_contextual_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['dick', 'cock', 'coon', 'cox', 'gay', 'negre', 'cono'];
$$;

CREATE OR REPLACE FUNCTION public.moderation_context_markers()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'suck', 'sucker', 'sucking', 'lick', 'licker', 'eat', 'eater', 'sex', 'sexy', 'porn', 'nude', 'naked', 'horny',
    '69', 'monkey', 'ape', 'jungle', 'lynch', 'dirty'
  ];
$$;

-- Anatomy words, which are also abusive next to a size or possessive word ("Big Dick", "Hard Cox").
CREATE OR REPLACE FUNCTION public.moderation_anatomy_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['dick', 'cock', 'cox'];
$$;

CREATE OR REPLACE FUNCTION public.moderation_anatomy_markers()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['my', 'your', 'ur', 'big', 'huge', 'tiny', 'small', 'hard', 'head', 'face', 'hole'];
$$;

-- Legitimate names and words that contain a pattern above. Masked to '_' (never deleted, so masking cannot glue
-- two halves of a word together).
CREATE OR REPLACE FUNCTION public.moderation_allowlist_pattern()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'scunthorpe|dickinson|dickens|dickson|dickerson|hancock|peacock|cockburn|hitchcock|babcock|woodcock|'
      || 'sussex|essex|middlesex|wessex|mishit|shiitake|shitake|shitara|shitanshu|shital|slutsk|pussycat|'
      || 'therapist|snigger|matsushita|retardant|en retard';
$$;

-- Accented words that would fold onto a blocked word (French "râpé" grated, Spanish "rapé" snuff). Matched on the
-- lower-case NFC text before accents are removed; the unaccented spelling stays blocked.
CREATE OR REPLACE FUNCTION public.moderation_accented_allowlist_pattern()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '\m(râpé|râpée|râpés|râpées|râpe|râpes|rapé|rapés)\M';
$$;

CREATE OR REPLACE FUNCTION public.contains_blocked_term(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT public.moderation_fold(regexp_replace(
      lower(normalize(coalesce(public.moderation_clean_text(input), ''), NFC)),
      public.moderation_accented_allowlist_pattern(), ' ', 'g')) AS f
  ), forms AS (
    -- Separators as spaces ("fu ck you"), and punctuation inside words deleted ("fu.ck" -> "fuck").
    SELECT btrim(regexp_replace(f, '[^a-z0-9*]+', ' ', 'g')) AS t FROM s
    UNION ALL
    SELECT btrim(regexp_replace(regexp_replace(f, '[^a-z0-9*\s]+', '', 'g'), '[^a-z0-9*]+', ' ', 'g')) FROM s
  ), j AS (
    -- Join runs of single characters: "n i g g e r" becomes "nigger".
    SELECT t, regexp_replace(t, '(?<=(^| )[a-z0-9]) (?=[a-z0-9]( |$))', '', 'g') AS tr FROM forms
  ), a AS (
    SELECT t, tr, regexp_replace(tr, public.moderation_allowlist_pattern(), '_', 'g') AS ta FROM j
  )
  SELECT coalesce(bool_or(
    EXISTS (SELECT 1 FROM unnest(public.blocked_moderation_terms()) AS w
            WHERE a.ta ~ ('(^| )' || w || '( |$)') OR replace(a.t, ' ', '') = w)
    OR EXISTS (SELECT 1 FROM unnest(public.moderation_anywhere_patterns()) AS p WHERE a.ta ~ p)
    OR EXISTS (SELECT 1 FROM unnest(public.moderation_edge_patterns()) AS p
               WHERE a.ta ~ ('(^| )' || p) OR a.ta ~ (p || '( |$)'))
    OR (EXISTS (SELECT 1 FROM unnest(public.moderation_contextual_terms()) AS c WHERE a.tr ~ ('(^| )' || c || '( |$)'))
        AND EXISTS (SELECT 1 FROM unnest(public.moderation_context_markers()) AS m WHERE a.tr ~ ('(^| )' || m || '( |$)')))
    OR (EXISTS (SELECT 1 FROM unnest(public.moderation_anatomy_terms()) AS c WHERE a.tr ~ ('(^| )' || c || '( |$)'))
        AND EXISTS (SELECT 1 FROM unnest(public.moderation_anatomy_markers()) AS m WHERE a.tr ~ ('(^| )' || m || '( |$)')))
  ), false)
  FROM a;
$$;

COMMENT ON FUNCTION public.contains_blocked_term(text) IS
  'Filter v2 (20261008130000_moderation_filter_v2.sql): NFKC + default-ignorable strip + accent/leet/homoglyph fold, two separator forms, whole-word, anywhere, edge and contextual passes, allowlists.';

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
  -- Something other than ASCII punctuation and spaces must remain ("!!" is not a name; "李雷" is).
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
  RETURN NULL;
END;
$$;

-- Team names follow exactly the display-name rules.
CREATE OR REPLACE FUNCTION public.team_name_problem(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.display_name_problem(_name);
$$;

-- The profile trigger judges the name as written, then stores the cleaned form. It is SECURITY DEFINER (it was
-- invoker, which forced EXECUTE on the helpers for every authenticated user). Length stays the CHECK constraint's
-- job (profiles_display_name_length_chk, 1..40); this raises only for content.
CREATE OR REPLACE FUNCTION public.enforce_display_name_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    IF public.display_name_problem(NEW.display_name) = 'blocked-content' THEN
      RAISE EXCEPTION 'blocked-content' USING ERRCODE = '23514';
    END IF;
    -- An all-invisible name becomes '' and fails profiles_display_name_length_chk (23514), like any empty name.
    NEW.display_name := coalesce(public.moderation_clean_text(NEW.display_name), '');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_clean_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_fold(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_for_moderation(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.blocked_moderation_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_anywhere_patterns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_edge_patterns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_contextual_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_context_markers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_anatomy_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_anatomy_markers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_allowlist_pattern() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_accented_allowlist_pattern() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contains_blocked_term(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_name_problem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_display_name_filter() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_clean_text(text), public.moderation_fold(text),
  public.normalize_for_moderation(text), public.blocked_moderation_terms(), public.moderation_anywhere_patterns(),
  public.moderation_edge_patterns(), public.moderation_contextual_terms(), public.moderation_context_markers(),
  public.moderation_anatomy_terms(), public.moderation_anatomy_markers(), public.moderation_allowlist_pattern(),
  public.moderation_accented_allowlist_pattern(), public.contains_blocked_term(text), public.team_name_problem(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.display_name_problem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;

-- Admin rename of a reported team name. Service role only. NULL on success, else a reason code the admin UI shows.
CREATE OR REPLACE FUNCTION public.admin_rename_team(_team_id uuid, _name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  problem text := public.team_name_problem(_name);
BEGIN
  IF problem IS NOT NULL THEN
    RETURN problem;
  END IF;
  UPDATE public.teams t SET name = public.moderation_clean_text(_name) WHERE t.id = _team_id;
  IF NOT FOUND THEN
    RETURN 'team-not-found';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rename_team(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rename_team(uuid, text) TO service_role;
