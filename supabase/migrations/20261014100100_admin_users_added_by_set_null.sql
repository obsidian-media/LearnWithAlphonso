-- admin_users.added_by referenced auth.users(id) with ON DELETE NO ACTION (the 20260928010000_admin_users.sql
-- default), so deleting an admin who had added another admin failed with a foreign-key violation: the account
-- deletion (and the auth.users row delete under it) could not complete.
--
-- added_by is already nullable (it was created without NOT NULL; the guard below drops NOT NULL if it was ever added
-- before this runs), and it is only an audit note of who granted access, so SET NULL is the right behaviour: the
-- added admin stays, the record of who added them is dropped with the account that did.
--
-- The constraint name is the one Postgres generated for the inline REFERENCES (<table>_<column>_fkey); looked up
-- rather than assumed, so a renamed constraint is still replaced.
--
-- Rollback (one transaction): re-add the constraint as it was.
--   ALTER TABLE public.admin_users DROP CONSTRAINT admin_users_added_by_fkey;
--   ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_added_by_fkey
--     FOREIGN KEY (added_by) REFERENCES auth.users(id);

DO $$
DECLARE
  con text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'added_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.admin_users ALTER COLUMN added_by DROP NOT NULL;
  END IF;

  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.admin_users'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                            WHERE a.attrelid = 'public.admin_users'::regclass AND a.attname = 'added_by')]
  LOOP
    EXECUTE format('ALTER TABLE public.admin_users DROP CONSTRAINT %I', con);
  END LOOP;

  ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
END
$$;
