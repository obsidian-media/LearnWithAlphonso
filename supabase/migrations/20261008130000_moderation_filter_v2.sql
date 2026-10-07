-- W7 / H17 (App Store remediation): moderation filter v2.
--
-- Replaces the matcher from 20260930120000_ugc_filter_word_boundary_fix.sql. That version folded leetspeak,
-- accents and Cyrillic/Greek look-alikes, but:
--   * full-width and mathematical letters ("Ｆｕｃｋ", "𝐟𝐮𝐜𝐤") were deleted instead of folded, so they matched nothing;
--   * a zero-width space inside a word became a word break, so the whole-word pass missed "F<U+200B>uck you";
--   * compounds ("FuckYou", "Shithead", "xXn*ggerXx") are never whole words, so they passed;
--   * "Dick", "Coon" and "Cock" were blocked as standalone tokens although they are real names and surnames.
--
-- Pipeline (both sides of every comparison go through it):
--   1. moderation_clean_text: NFKC (folds full-width, mathematical and ligature forms), strips invisible and
--      bidi-control characters, collapses whitespace. This is also the form a display name is STORED in.
--   2. normalize_for_moderation: lower-case, NFD then drop combining marks (every Latin accent), fold leetspeak
--      and Cyrillic/Greek homoglyphs, turn every other run of characters outside [a-z0-9*] into one space.
--      '*' is kept because it is the usual masking character ("f*ck").
--   3. contains_blocked_term: runs of single letters are joined ("f u c k you" -> "fuck you"); an allowlist masks
--      known legitimate names; then four passes:
--      a. whole-word list (blocked_moderation_terms), or the whole input with separators removed equal to one;
--      b. severe patterns anywhere inside a token (moderation_anywhere_patterns): "FuckYou", "xXn*ggerXx";
--      c. patterns at the start or end of a token (moderation_edge_patterns): "Shithead", "bullshit", but not
--         "Yoshito" or "Toshitaka";
--      d. contextual name-words (dick, cock, coon, cox, gay) only together with a sexual or slur marker token:
--         "Big Dick" is blocked, "Dick Van Dyke" and "Jenny Coon" are not.
--
-- display_name_problem(name) is the one verdict every writer uses: NULL (fine), 'invalid-name' (after cleaning,
-- not 2 to 40 characters, or nothing but ASCII punctuation) or 'blocked-content' (filter hit, emoji or control
-- characters).
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
--   DROP FUNCTION public.display_name_problem(text), public.moderation_clean_text(text),
--     public.moderation_anywhere_patterns(), public.moderation_edge_patterns(), public.moderation_contextual_terms(),
--     public.moderation_context_markers(), public.moderation_allowlist_pattern(),
--     public.admin_rename_team(uuid, text);

CREATE OR REPLACE FUNCTION public.moderation_clean_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(btrim(regexp_replace(
    regexp_replace(
      normalize(coalesce(input, ''), NFKC),
      '[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0]',
      '', 'g'),
    '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- translate() maps positionally; both strings are 29 characters: 11 leetspeak, 10 Cyrillic, 8 Greek
  -- (codepoints as in 20260930090000_ugc_filter_homoglyph_confusables.sql).
  SELECT btrim(regexp_replace(
    translate(
      regexp_replace(normalize(lower(coalesce(public.moderation_clean_text(input), '')), NFD), '[\u0300-\u036f]', '', 'g'),
      '013457$@!+|'
        || chr(1072) || chr(1077) || chr(1086) || chr(1088) || chr(1089)
        || chr(1091) || chr(1093) || chr(1110) || chr(1112) || chr(1109)
        || chr(945) || chr(953) || chr(954) || chr(957) || chr(959)
        || chr(961) || chr(964) || chr(965),
      'oieastsaiti' || 'aeopcyxijs' || 'aikvoptu'),
    '[^a-z0-9*]+', ' ', 'g'));
$$;

-- Whole words, in normalized form (ASCII, no accents: 'encule' matches "enculé", 'cono' matches "coño").
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
    'salope', 'pute', 'encule', 'negre', 'puta', 'maricon', 'gilipollas', 'cono'
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

-- Real given names and surnames that are only abusive next to a marker.
CREATE OR REPLACE FUNCTION public.moderation_contextual_terms()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['dick', 'cock', 'coon', 'cox', 'gay'];
$$;

CREATE OR REPLACE FUNCTION public.moderation_context_markers()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'suck', 'sucker', 'sucking', 'lick', 'licker', 'eat', 'eater', 'big', 'huge', 'tiny', 'small', 'hard', 'my',
    'your', 'ur', 'head', 'face', 'hole', 'sex', 'sexy', 'porn', 'nude', 'naked', 'horny', '69', 'monkey', 'ape',
    'jungle', 'lynch', 'dirty'
  ];
$$;

-- Legitimate names and words that contain a pattern above. Masked to '_' (never deleted, so masking cannot glue
-- two halves of a slur together).
CREATE OR REPLACE FUNCTION public.moderation_allowlist_pattern()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'scunthorpe|dickinson|dickens|dickson|dickerson|hancock|peacock|cockburn|hitchcock|babcock|woodcock|'
      || 'sussex|essex|middlesex|wessex|mishit|shiitake|shitake|shitara|slutsk|pussycat|therapist|snigger|'
      || 'matsushita|retardant|en retard';
$$;

CREATE OR REPLACE FUNCTION public.contains_blocked_term(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH n AS (
    SELECT public.normalize_for_moderation(input) AS t
  ), j AS (
    -- Join runs of single characters: "n i g g e r" and "N.I.G.G.E.R" become "nigger".
    SELECT t, regexp_replace(t, '(?<=(^| )[a-z0-9]) (?=[a-z0-9]( |$))', '', 'g') AS tr FROM n
  ), a AS (
    SELECT t, tr, regexp_replace(tr, public.moderation_allowlist_pattern(), '_', 'g') AS ta FROM j
  )
  SELECT
    EXISTS (SELECT 1 FROM unnest(public.blocked_moderation_terms()) AS w
            WHERE a.ta ~ ('(^| )' || w || '( |$)') OR replace(a.t, ' ', '') = w)
    OR EXISTS (SELECT 1 FROM unnest(public.moderation_anywhere_patterns()) AS p WHERE a.ta ~ p)
    OR EXISTS (SELECT 1 FROM unnest(public.moderation_edge_patterns()) AS p
               WHERE a.ta ~ ('(^| )' || p) OR a.ta ~ (p || '( |$)'))
    OR (EXISTS (SELECT 1 FROM unnest(public.moderation_contextual_terms()) AS c WHERE a.tr ~ ('(^| )' || c || '( |$)'))
        AND EXISTS (SELECT 1 FROM unnest(public.moderation_context_markers()) AS m WHERE a.tr ~ ('(^| )' || m || '( |$)')))
  FROM a;
$$;

COMMENT ON FUNCTION public.contains_blocked_term(text) IS
  'Filter v2 (20261008130000_moderation_filter_v2.sql): NFKC + invisible-strip + accent/leet/homoglyph fold, whole-word, anywhere, edge and contextual passes, allowlist.';

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
  -- Control characters, emoji and pictographs (the eggplant-and-droplets class of name) are refused outright.
  IF cleaned ~ '[\x01-\x1F\x7F]' OR cleaned ~ '[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F]' THEN
    RETURN 'blocked-content';
  END IF;
  IF public.contains_blocked_term(cleaned) THEN
    RETURN 'blocked-content';
  END IF;
  RETURN NULL;
END;
$$;

-- The profile trigger now stores the cleaned name and is SECURITY DEFINER (it was invoker, which forced EXECUTE
-- on the helpers for every authenticated user). Length stays the CHECK constraint's job
-- (profiles_display_name_length_chk, 1..40); this raises only for content.
CREATE OR REPLACE FUNCTION public.enforce_display_name_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    -- An all-invisible name becomes '' and fails profiles_display_name_length_chk (23514), like any empty name.
    NEW.display_name := coalesce(public.moderation_clean_text(NEW.display_name), '');
    IF public.display_name_problem(NEW.display_name) = 'blocked-content' THEN
      RAISE EXCEPTION 'blocked-content' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_clean_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_for_moderation(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.blocked_moderation_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_anywhere_patterns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_edge_patterns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_contextual_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_context_markers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_allowlist_pattern() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contains_blocked_term(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_display_name_filter() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_clean_text(text), public.normalize_for_moderation(text),
  public.blocked_moderation_terms(), public.moderation_anywhere_patterns(), public.moderation_edge_patterns(),
  public.moderation_contextual_terms(), public.moderation_context_markers(), public.moderation_allowlist_pattern(),
  public.contains_blocked_term(text) TO service_role;
REVOKE ALL ON FUNCTION public.display_name_problem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;

-- Admin rename of a reported team name (L10, admin "Rename team"). Service role only. NULL on success, else a
-- reason code the admin UI shows through social-reason copy. Team names keep create_team's 1..40 rule.
CREATE OR REPLACE FUNCTION public.admin_rename_team(_team_id uuid, _name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text := public.moderation_clean_text(_name);
BEGIN
  IF cleaned IS NULL OR char_length(cleaned) > 40 THEN
    RETURN 'invalid-name';
  END IF;
  IF public.contains_blocked_term(cleaned) THEN
    RETURN 'blocked-content';
  END IF;
  UPDATE public.teams t SET name = cleaned WHERE t.id = _team_id;
  IF NOT FOUND THEN
    RETURN 'team-not-found';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rename_team(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rename_team(uuid, text) TO service_role;
