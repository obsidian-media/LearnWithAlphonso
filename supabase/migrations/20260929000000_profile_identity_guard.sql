-- Display-name/avatar editing surface (BACKLOG §0.0p): profiles_update_own
-- RLS has always let a user PATCH their own display_name/avatar_seed
-- (20260725012934_...sql), but until now the only writer was the signup
-- trigger, which always produces a short, non-empty value. Once the web
-- and iOS editing UI (this same PR) start writing these columns from
-- arbitrary user input, and iOS's PATCH goes straight to PostgREST with
-- no Zod layer in front of it the way web's updateProfile has, the DB
-- needs its own floor. NOT VALID: an existing row from a long Google
-- full_name must not be retroactively broken by this -- it only gates
-- new writes, matching "existing users keep their current name until
-- they change it."
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length_chk
  CHECK (char_length(trim(display_name)) BETWEEN 1 AND 40) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_seed_length_chk
  CHECK (char_length(avatar_seed) BETWEEN 1 AND 32) NOT VALID;
