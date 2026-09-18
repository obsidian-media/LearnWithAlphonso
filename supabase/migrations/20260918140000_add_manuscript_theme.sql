-- Postgres auto-names an unnamed column check constraint as
-- <table>_<column>_check; the constraint added in
-- 20260918130000_add_profile_theme.sql was not explicitly named, so it is
-- expected to be profiles_theme_check.
alter table profiles drop constraint profiles_theme_check;

alter table profiles
  add constraint profiles_theme_check
  check (theme in ('meadow', 'studio-ink', 'manuscript'));
