-- Fresh whole-codebase audit finding (2026-09-29): normalize_for_moderation
-- (20260930040000_ugc_filter_accent_fix.sql) folds leetspeak and accented
-- Latin letters to their base ASCII form, then DELETES every remaining
-- character outside [a-z0-9] rather than folding it. A single-letter
-- substitution from a script that isn't in that translit table -- most
-- commonly Cyrillic or Greek, both of which have several letters that are
-- visually identical to Latin ones -- is deleted instead of folded, which
-- corrupts the word rather than normalizing it: "n" + CYRILLIC SMALL
-- LETTER I (U+0456, visually indistinguishable from Latin "i") + "gger"
-- normalizes to "ngger", which does not LIKE-match "nigger". The blocklist
-- word still reads as the slur to a human viewer; the filter never sees
-- it. Traced by hand against the current function -- confirmed real.
--
-- Fix: extend the existing translit table with the standard set of
-- single-character Cyrillic/Greek homoglyphs for Latin letters (the exact
-- evasion class this migration closes, not a general script-detection
-- system). Deliberately NOT a blanket "reject any non-Latin-script
-- character" rule -- that would also reject legitimate non-Latin display
-- names (e.g. a user's real name in Cyrillic, Greek, or any other script),
-- which is a product/i18n decision this fix has no business making
-- unilaterally. A legitimate non-Latin name that shares no characters
-- with a blocked term is unaffected either way: it normalizes to
-- something that matches nothing on the blocklist, exactly as before.
--
-- Codepoints used below (all lowercase -- lower() already ran on the
-- input before translate() sees it, so only lowercase forms need
-- mapping): Cyrillic а(1072) е(1077) о(1086) р(1088) с(1089) у(1091)
-- х(1093) і(1110) ј(1112) ѕ(1109); Greek α(945) ι(953) κ(954) ν(957)
-- ο(959) ρ(961) τ(964) υ(965). Written via chr() rather than pasted
-- glyphs so the exact codepoint is verifiable from this comment rather
-- than trusting that two visually-similar characters were not
-- transposed by a copy-paste.
CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
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
    '[^a-z0-9]',
    '',
    'g'
  );
$$;

COMMENT ON FUNCTION public.normalize_for_moderation(text) IS
  'UGC pre-publication filter normalization -- see 20260930030000_ugc_content_filter.sql, 20260930040000_ugc_filter_accent_fix.sql, and this file for the Cyrillic/Greek homoglyph fold.';
