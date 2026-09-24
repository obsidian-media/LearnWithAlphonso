-- Adds 'canopy' (iOS-only theme, see docs/superpowers/specs/
-- 2026-09-23-ios-canopy-theme-redesign-design.md) to the set of values
-- profiles.theme accepts. Web has no CSS for this theme and never offers
-- it as a picker option -- src/lib/theme.ts's THEME_NAMES/isThemeName
-- deliberately do NOT include it, so a web session that reads a
-- canopy-valued profile still falls back safely to meadow rather than
-- rendering unstyled. This migration only has to satisfy iOS's direct
-- PostgREST PATCH write path.
alter table profiles drop constraint profiles_theme_check;

alter table profiles
  add constraint profiles_theme_check
  check (theme in ('meadow', 'studio-ink', 'manuscript', 'canopy'));
