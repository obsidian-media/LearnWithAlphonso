-- profiles.country is a two-letter country code (the privacy policy describes it that way, and the web profile page
-- only sends two upper-case letters), but the column accepted any text, which leaderboards then show to every
-- signed-in learner. Values that are not two upper-case letters are cleared, then a CHECK keeps it that way.
--
-- Depends on 20260725012934 (profiles.country).
--
-- Rollback:
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_country_iso2;

UPDATE public.profiles SET country = NULL WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$';
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_country_iso2 CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
