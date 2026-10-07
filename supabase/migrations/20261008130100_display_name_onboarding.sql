-- W7 / M23 DB half (App Store remediation): public display names are chosen, never derived from an email.
--
-- 1. profiles.name_confirmed_at: NULL means W6's onboarding prompt still has to ask.
-- 2. generate_learner_handle(): 'Learner-' + 4 upper-case hex, the fallback public name. Handles are re-drawn
--    until they pass the display-name filter.
-- 3. handle_new_user never raises because of a name. Before this, a 41+ character Google full_name failed
--    profiles_display_name_length_chk (NOT VALID, but it still checks new rows), and a blocked name failed the
--    filter trigger; either raised inside the auth.users AFTER INSERT trigger and GoTrue rolled the sign-up back.
--    A candidate equal to the email's local part is ignored (web sign-up still sends it as metadata).
-- 4. confirm_display_name(_name): the one validated path for a learner to set their public name.
-- 5. Existing email-prefix names become handles (saved in display_name_migration_backup); everyone else is
--    marked confirmed so only migrated users see W6's prompt.
--
-- Rollback (one transaction, before rolling back 20261008130000):
--   ALTER TABLE public.profiles DISABLE TRIGGER enforce_display_name_filter;
--   UPDATE public.profiles p SET display_name = b.old_display_name
--     FROM public.display_name_migration_backup b WHERE b.user_id = p.id AND p.display_name = b.new_display_name;
--   ALTER TABLE public.profiles ENABLE TRIGGER enforce_display_name_filter;
--   re-run handle_new_user from 20260725012934_3f1c93dd-9305-4ccc-b14a-89f990b5a23b.sql (it has the long-name bug);
--   re-run enforce_display_name_filter from 20261008130000_moderation_filter_v2.sql;
--   DROP FUNCTION public.confirm_display_name(text), public.generate_learner_handle(),
--     public.admin_reset_display_name(uuid);
--   DROP TABLE public.display_name_migration_backup;
--   ALTER TABLE public.profiles DROP COLUMN name_confirmed_at;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_confirmed_at timestamptz NULL;
COMMENT ON COLUMN public.profiles.name_confirmed_at IS
  'When the learner last chose or confirmed their public display name. NULL: the onboarding prompt still asks.';

CREATE OR REPLACE FUNCTION public.generate_learner_handle()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  candidate text;
BEGIN
  FOR i IN 1..50 LOOP
    candidate := 'Learner-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    IF public.display_name_problem(candidate) IS NULL THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN 'Learner-0000';
END;
$$;

REVOKE ALL ON FUNCTION public.generate_learner_handle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_learner_handle() TO service_role;

-- v2 of the trigger from 20261008130000: also stamps name_confirmed_at when a signed-in user renames THEMSELVES
-- (Settings, web profile). A service-role or migration write (auth.uid() NULL) leaves it alone, so an admin
-- reset that sets it to NULL stays NULL and the learner is asked again.
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
    NEW.display_name := coalesce(public.moderation_clean_text(NEW.display_name), '');
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.display_name IS DISTINCT FROM OLD.display_name
     AND auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    NEW.name_confirmed_at := coalesce(NEW.name_confirmed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_display_name_filter() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_name text;
  candidate text;
BEGIN
  raw_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''));
  candidate := public.moderation_clean_text(raw_name);
  IF candidate IS NOT NULL AND NEW.email IS NOT NULL
     AND lower(candidate) = lower(split_part(NEW.email, '@', 1)) THEN
    candidate := NULL;
  END IF;
  -- Judged as written: cleaning removes bidi controls that display_name_problem refuses.
  IF candidate IS NULL OR public.display_name_problem(raw_name) IS NOT NULL THEN
    candidate := public.generate_learner_handle();
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_seed)
    VALUES (NEW.id, candidate, substr(md5(NEW.id::text), 1, 8));
  EXCEPTION WHEN check_violation OR raise_exception THEN
    -- Belt and braces: whatever the name checks missed, the account is still created.
    INSERT INTO public.profiles (id, display_name, avatar_seed)
    VALUES (NEW.id, public.generate_learner_handle(), substr(md5(NEW.id::text), 1, 8));
  END;

  INSERT INTO public.user_progress (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_display_name(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  problem text := public.display_name_problem(_name);
  stored text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '%', problem USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.profiles p
  SET display_name = public.moderation_clean_text(_name), name_confirmed_at = now()
  WHERE p.id = me
  RETURNING p.display_name INTO stored;
  IF stored IS NULL THEN
    RAISE EXCEPTION 'not-found' USING ERRCODE = 'P0001';
  END IF;
  RETURN stored;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_display_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_display_name(text) TO authenticated;

-- Admin "Reset display name" (L10): a fresh handle, and the learner is asked to choose again (W6 prompt).
-- Service role only. Returns the new handle, or NULL when the profile no longer exists.
CREATE OR REPLACE FUNCTION public.admin_reset_display_name(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored text;
BEGIN
  UPDATE public.profiles p
  SET display_name = public.generate_learner_handle(), name_confirmed_at = NULL
  WHERE p.id = _user_id
  RETURNING p.display_name INTO stored;
  RETURN stored;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_display_name(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_display_name(uuid) TO service_role;

-- What the migration below changed, so it can be undone. Drop after 2026-11-08 (BACKLOG item, Task 19).
CREATE TABLE public.display_name_migration_backup (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  old_display_name text NOT NULL,
  new_display_name text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.display_name_migration_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.display_name_migration_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.display_name_migration_backup TO service_role;
-- The learner's own row is part of their data export (it holds their former public name); writes are service-only.
CREATE POLICY display_name_migration_backup_select_own ON public.display_name_migration_backup
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.display_name_migration_backup TO authenticated;

WITH targets AS (
  SELECT p.id, p.display_name AS old_name, public.generate_learner_handle() AS new_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email IS NOT NULL
    AND lower(btrim(p.display_name)) = lower(split_part(u.email, '@', 1))
), saved AS (
  INSERT INTO public.display_name_migration_backup (user_id, old_display_name, new_display_name)
  SELECT id, old_name, new_name FROM targets
  RETURNING user_id, new_display_name
)
UPDATE public.profiles p
SET display_name = s.new_display_name, name_confirmed_at = NULL
FROM saved s
WHERE p.id = s.user_id;

UPDATE public.profiles p
SET name_confirmed_at = p.created_at
WHERE p.name_confirmed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.display_name_migration_backup b WHERE b.user_id = p.id);
