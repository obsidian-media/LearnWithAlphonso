-- More look-alike letters folded before names and messages are checked.
--
-- moderation_fold (20261008130000_moderation_filter_v2.sql) already folds leetspeak and the Cyrillic and Greek
-- letters that look like lower-case Latin ones. It missed letters whose CAPITAL form is identical to a Latin
-- capital, so a name could pose as staff by swapping one letter: a Cyrillic M in "ADMIN", a Cyrillic T in
-- "SUPPORT". It also missed three Latin look-alikes (script a, dotless i, script g) and Cyrillic komi de.
--
-- Added, as (codepoint -> Latin): 1281 -> d, 1084 -> m, 1082 -> k, 1090 -> t, 1085 -> h, 1074 -> b,
-- 593 -> a, 305 -> i, 609 -> g. Everything else in the function is unchanged, including its grants
-- (CREATE OR REPLACE keeps them).
--
-- Real Cyrillic names are not affected: a name only matches when the WHOLE word folds onto a blocked Latin
-- word, and the tests pin a list of common names that must stay allowed.
--
-- Rollback: re-run the moderation_fold statement from 20261008130000_moderation_filter_v2.sql.

CREATE OR REPLACE FUNCTION public.moderation_fold(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- translate() maps positionally; both strings are 38 characters: 11 leetspeak, 10 + 6 Cyrillic, 8 Greek,
  -- 3 Latin look-alikes.
  SELECT translate(
    regexp_replace(
      normalize(lower(regexp_replace(coalesce(public.moderation_clean_text(input), ''), '[\u200C\u200D]', '', 'g')), NFD),
      '[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g'),
    '013457$@!+|'
      || chr(1072) || chr(1077) || chr(1086) || chr(1088) || chr(1089)
      || chr(1091) || chr(1093) || chr(1110) || chr(1112) || chr(1109)
      || chr(1281) || chr(1084) || chr(1082) || chr(1090) || chr(1085) || chr(1074)
      || chr(945) || chr(953) || chr(954) || chr(957) || chr(959)
      || chr(961) || chr(964) || chr(965)
      || chr(593) || chr(305) || chr(609),
    'oieastsaiti' || 'aeopcyxijs' || 'dmkthb' || 'aikvoptu' || 'aig');
$$;
