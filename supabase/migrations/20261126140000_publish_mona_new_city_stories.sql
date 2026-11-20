-- Mona's New City goes live. The twelve stories were seeded hidden (20261126130000) so their narration could be
-- recorded first (scripts/story-audio.ts --include-unpublished); all 196 sentences are recorded, so learners hear the
-- real voice from the first read. needs_review is already false, so only published changes.
UPDATE public.stories
SET published = true, published_at = now()
WHERE course = 'en'
  AND published = false
  AND slug IN ('touchdown', 'the-first-coffee', 'keys-to-the-new-place', 'market-day',
               'the-wrong-train', 'dinner-with-new-friends', 'the-interview', 'under-the-weather',
               'the-favour', 'crossed-wires', 'the-negotiation', 'the-goodbye');
