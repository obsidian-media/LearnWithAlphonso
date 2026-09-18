alter table profiles
  add column theme text not null default 'meadow'
  check (theme in ('meadow', 'studio-ink'));
