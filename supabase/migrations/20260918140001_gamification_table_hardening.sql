-- Hardening pass for the gamification tables (2026-09-18 comprehensive
-- audit, finding C1): user_progress/language_progress/lesson_completions/
-- user_achievements/activity_days/review_items grant INSERT/UPDATE to
-- `authenticated` with RLS checking only row ownership -- no bound on the
-- actual values. Any signed-in user can PATCH these directly via
-- PostgREST and set hearts/xp/streak/league_tier to anything.
--
-- This migration adds CHECK constraints closing the most damaging shape
-- of that gap (arbitrary/negative/invalid values) WITHOUT revoking the
-- direct-write grants outright, because ios/LearnWithAlphonsoKit's
-- ProgressSyncClient.swift currently depends on those grants being
-- present for its own legitimate writes (heart loss, setCefrLevel,
-- savePlacementResult) -- revoking them here would break that client's
-- write path without coordinating with whoever owns that in-flight work.
-- See ClaudeCodeComprehensiveMulti-AngleAudit—2026-09-18.md's C1 entry for
-- the full reasoning and the deferred full fix (route every write through
-- a SECURITY DEFINER RPC and revoke direct grants entirely).
--
-- MAX_HEARTS below must stay in sync with src/lib/hearts.ts's MAX_HEARTS
-- constant (and its Deno port, supabase/functions/complete-lesson/hearts.ts).

ALTER TABLE public.user_progress
  ADD CONSTRAINT user_progress_hearts_range CHECK (hearts >= 0 AND hearts <= 5),
  ADD CONSTRAINT user_progress_streak_nonneg CHECK (streak >= 0),
  ADD CONSTRAINT user_progress_longest_streak_nonneg CHECK (longest_streak >= 0),
  ADD CONSTRAINT user_progress_streak_freezes_nonneg CHECK (streak_freezes >= 0),
  ADD CONSTRAINT user_progress_league_tier_valid
    CHECK (league_tier IN ('bronze', 'silver', 'sapphire', 'ruby', 'diamond'));

ALTER TABLE public.language_progress
  ADD CONSTRAINT language_progress_xp_nonneg CHECK (xp >= 0),
  ADD CONSTRAINT language_progress_cefr_valid
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  ADD CONSTRAINT language_progress_league_tier_valid
    CHECK (league_tier IN ('bronze', 'silver', 'sapphire', 'ruby', 'diamond')),
  ADD CONSTRAINT language_progress_placement_score_range
    CHECK (placement_score IS NULL OR (placement_score >= 0 AND placement_score <= 100)),
  ADD CONSTRAINT language_progress_placement_level_valid
    CHECK (placement_level IS NULL OR placement_level IN ('A1', 'A2', 'B1', 'B2', 'C1'));

ALTER TABLE public.lesson_completions
  ADD CONSTRAINT lesson_completions_correct_range CHECK (correct >= 0 AND correct <= total),
  ADD CONSTRAINT lesson_completions_total_positive CHECK (total >= 1),
  ADD CONSTRAINT lesson_completions_xp_earned_nonneg CHECK (xp_earned >= 0);

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_progress_nonneg CHECK (progress >= 0);

ALTER TABLE public.activity_days
  ADD CONSTRAINT activity_days_xp_earned_nonneg CHECK (xp_earned >= 0);

ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_ease_range CHECK (ease >= 1.3 AND ease <= 2.8),
  ADD CONSTRAINT review_items_interval_nonneg CHECK (interval_days >= 0),
  ADD CONSTRAINT review_items_repetitions_nonneg CHECK (repetitions >= 0),
  ADD CONSTRAINT review_items_lapses_nonneg CHECK (lapses >= 0);
