-- Two slang spellings added to the public-name word list: "noods" (nudes) and "pron" (porn).
--
-- Digit swaps were already caught, because moderation_fold maps 0 to o and 3 to e before the check, but these
-- two are spellings, not swaps: "n00ds" folds to "noods" and "pr0n" to "pron", and neither was on the list.
-- Like every other entry they match a whole word only, so Noodle, Pronto, Pronoun and Apron stay allowed.
-- A rolled-back production check found 0 existing display or team names that become blocked.
--
-- Only name_policy_terms changes; the list below is the one from
-- 20261014100000_name_policy_self_harm_drugs_sexual_impersonation.sql plus the two words. CREATE OR REPLACE
-- keeps the function's grants (service_role only).
--
-- Rollback: re-run the name_policy_terms statement from
-- 20261014100000_name_policy_self_harm_drugs_sexual_impersonation.sql.

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
    'erotic', 'hentai', 'boobs', 'tits', 'dildo', 'orgasm', 'incest', 'milf', 'onlyfans',
    -- slang spellings
    'noods', 'pron'
  ];
$$;
