-- V4: adds Spanish ("es") as a third course. The only place a course
-- value is actually constrained at the DB level (units/placement_questions
-- store course as free text with no CHECK) is duels.course, added in
-- 20260920060000_v3_engagement_mechanics.sql as
-- `CHECK (course IN ('en', 'fr'))` (constraint name duels_course_check,
-- confirmed via pg_get_constraintdef). Widen it rather than drop it
-- entirely -- course is still meant to be one of a known, small set.
alter table public.duels
  drop constraint duels_course_check;

alter table public.duels
  add constraint duels_course_check check (course in ('en', 'fr', 'es'));
