-- The app now offers two themes, Royal (the default) and Meadow. The three retired themes
-- (studio-ink, manuscript, canopy) move to Royal. A null theme means "no choice yet" and stays null.
--
-- 1. Drop the old CHECK first: it does not allow 'royal', so the rewrite below would fail
--    against it (the first deploy failed exactly there; nothing was applied).
-- 2. Rewrite the stored values, then add the narrowed CHECK for the two themes.
-- 3. Coerce any later write of a retired value to Royal, so an older app build that still sends
--    'canopy' keeps working instead of failing on the narrowed constraint.

alter table public.profiles drop constraint if exists profiles_theme_check;

update public.profiles
set theme = 'royal'
where theme is not null
  and theme not in ('royal', 'meadow');

alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('royal', 'meadow'));

create or replace function public.profiles_normalize_theme()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.theme is not null and new.theme not in ('royal', 'meadow') then
    new.theme := 'royal';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_theme on public.profiles;

create trigger profiles_normalize_theme
  before insert or update of theme on public.profiles
  for each row execute function public.profiles_normalize_theme();

revoke all on function public.profiles_normalize_theme() from public, anon, authenticated;
