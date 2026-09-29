-- Third-party pre-submission audit (2026-09-30, ChatGPT/Fable): the UGC
-- filter's substring match rejects real, common names and words --
-- confirmed live: contains_blocked_term() returns true for 'Conor'
-- (contains 'coño' post-accent-fold... actually matches via 'cono'
-- substring), 'Dickson'/'Hancock'/'Peacock' (contain 'dick'/'cock'),
-- 'Draper' (contains 'rape'), 'Fagan' (contains 'fag'), 'Spicer'
-- (contains 'spic'), 'Nazim' (contains 'nazi'), 'Yoshito' (contains
-- 'shit'). Because this runs as a BEFORE INSERT trigger on `profiles`
-- (enforce_display_name_filter, 20260930030000_ugc_content_filter.sql)
-- and profiles are inserted by handle_new_user on every single sign-up
-- (20260725012934_...sql), any of these names raised an exception that
-- propagates out of the AFTER INSERT trigger on auth.users -- GoTrue
-- rolls back the whole user and sign-up fails outright, for web email,
-- iOS OTP, Google, and Sign in with Apple alike. This is an active
-- production defect blocking real sign-ups, not a theoretical one --
-- the highest-priority fix from this audit round.
--
-- Root cause: normalize_for_moderation strips ALL non-alphanumeric
-- characters (including spaces) down to nothing, so 'Dickson' and
-- 'dick' are compared as plain substrings with no word boundary at all.
--
-- Fix: fold separators to a SINGLE SPACE instead of deleting them, and
-- match blocked terms as whole words (word-boundary regex) rather than
-- anywhere-in-the-string substrings. 'Dickson' normalizes to one token
-- ('dickson'), which is not equal to the whole word 'dick', so it no
-- longer matches; 'dick' used as its own word, or joined by punctuation
-- ('dick-head'), still does. A second check -- the ENTIRE input, with
-- separators fully collapsed, exactly equalling a blocked term --
-- restores coverage for a single evasion technique this trade-off would
-- otherwise weaken (letters spaced out one at a time, e.g. "n i g g e
-- r"): exact whole-input equality can never produce a Dickson-style
-- false positive, since 'dickson' (7 letters collapsed) is never equal
-- to 'dick' (4 letters).
--
-- Deliberately NOT preserved: catching a slur glued INSIDE a longer
-- fabricated word via spacing tricks other than "every letter
-- individually spaced" (e.g. "di ck") is now missed. Accepted trade-off
-- -- real users being unable to sign up is active, guaranteed harm;
-- this narrower evasion gap is a report/block backstop case, same
-- posture as this filter's own original "not a substitute for a proper
-- moderation service" comment already states.
CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      translate(
        lower(coalesce(input, '')),
        '013457$@!+àáâãäçèéêëìíîïñòóôõöùúûüý'
          || chr(1072) || chr(1077) || chr(1086) || chr(1088) || chr(1089)
          || chr(1091) || chr(1093) || chr(1110) || chr(1112) || chr(1109)
          || chr(945) || chr(953) || chr(954) || chr(957) || chr(959)
          || chr(961) || chr(964) || chr(965),
        'oieastsaitaaaaaceeeeiiiinooooouuuuy'
          || 'aeopcyxijs'
          || 'aikvoptu'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

COMMENT ON FUNCTION public.normalize_for_moderation(text) IS
  'UGC pre-publication filter normalization -- see 20260930030000_ugc_content_filter.sql, 20260930040000_ugc_filter_accent_fix.sql, 20260930090000_ugc_filter_homoglyph_confusables.sql, and this file (folds separators to spaces, not nothing, so contains_blocked_term can whole-word match instead of substring match).';

CREATE OR REPLACE FUNCTION public.contains_blocked_term(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.blocked_moderation_terms()) AS term
    WHERE
      -- Whole-word match: the blocked term must appear as its own
      -- space-delimited token, not as a substring of a longer word.
      public.normalize_for_moderation(input) ~ ('(^|\s)' || public.normalize_for_moderation(term) || '($|\s)')
      -- Exact full-input match after collapsing all separators --
      -- restores coverage for "every letter spaced out" evasion without
      -- reintroducing substring false positives (only ever a check
      -- against the WHOLE input, never a piece of it).
      OR regexp_replace(public.normalize_for_moderation(input), '\s', '', 'g') = public.normalize_for_moderation(term)
  );
$$;

COMMENT ON FUNCTION public.contains_blocked_term(text) IS
  'Whole-word + full-collapsed-equality match, not substring -- see 20260930120000_ugc_filter_word_boundary_fix.sql for why (real names like Dickson/Draper/Spicer were being rejected).';
