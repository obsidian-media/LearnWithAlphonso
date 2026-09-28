-- Fixes a real bug in 20260930030000_ugc_content_filter.sql, found in a
-- second-opinion audit (2026-09-28): normalize_for_moderation stripped
-- accented characters entirely (they aren't in [a-z0-9]) instead of
-- transliterating them to their base letter, while the blocklist's own
-- French/Spanish entries ('enculé', 'coño') still carried their accents.
-- Traced by hand: 'enculé' -> lower -> translate (no leetspeak chars
-- matched) -> strip 'é' -> 'encul', which does not contain the literal
-- 'enculé' the LIKE pattern was still checking for -- those two entries
-- could never match anything, on either side of the check.
--
-- Fix has two parts: normalize_for_moderation now transliterates the
-- common accented Latin letters to their base ASCII form before
-- stripping (so 'café' -> 'cafe', not 'caf'), and contains_blocked_term
-- now normalizes the blocklist term too, not just the input -- so a
-- future accented addition to the list works correctly without anyone
-- having to remember to pre-strip it by hand.

CREATE OR REPLACE FUNCTION public.normalize_for_moderation(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- translate() maps positionally: from[i] -> to[i], both strings the
  -- same length (35 each): the original 10-char leetspeak set, plus 25
  -- accented Latin letters folded to their base form (à/á/â/ã/ä->a,
  -- ç->c, è/é/ê/ë->e, ì/í/î/ï->i, ñ->n, ò/ó/ô/õ/ö->o, ù/ú/û/ü->u, ý->y).
  -- Postgres translate()/lower() are character-aware in a UTF8 database,
  -- not byte-aware, so each accented letter counts as one position.
  SELECT regexp_replace(
    translate(
      lower(coalesce(input, '')),
      '013457$@!+àáâãäçèéêëìíîïñòóôõöùúûüý',
      'oieastsaitaaaaaceeeeiiiinooooouuuuy'
    ),
    '[^a-z0-9]',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.contains_blocked_term(input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Both sides now go through the same normalization -- an accented
  -- entry added to blocked_moderation_terms() in future works correctly
  -- without needing to be pre-stripped by hand in the array literal.
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.blocked_moderation_terms()) AS term
    WHERE public.normalize_for_moderation(input) LIKE '%' || public.normalize_for_moderation(term) || '%'
  );
$$;
