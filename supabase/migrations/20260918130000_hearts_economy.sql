-- Hearts economy: track once-per-day claim of the review-queue-cleared
-- heart bonus. Additive only; does not touch any other table.
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS last_review_bonus_date date;
