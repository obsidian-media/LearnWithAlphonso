-- Adds embedded, non-lesson-derived question content to review_items for
-- the Hector/free-conversation weakness-detection feature (Option C, see
-- docs/superpowers/specs/2026-09-20-hector-weakness-detection-design.md).
-- A 'weakness' row carries its own gradable question directly instead of
-- pointing at a real lessons/questions row.
ALTER TABLE public.review_items
  ADD COLUMN source text NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson', 'weakness')),
  ADD COLUMN weakness_label text,
  ADD COLUMN weakness_display text,
  ADD COLUMN prompt text,
  ADD COLUMN choices jsonb,
  ADD COLUMN answer_index integer,
  ADD COLUMN explanation text,
  ADD CONSTRAINT weakness_shape_matches_source CHECK (
    (source = 'lesson') OR
    (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL)
  );
