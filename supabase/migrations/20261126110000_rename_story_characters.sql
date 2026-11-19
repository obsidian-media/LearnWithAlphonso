-- Rename three story characters whose names sounded like the support helper Miya (and like each other):
--   "Mia" in the A1 read-along "Mia's Morning"   -> "Kofi" (title becomes "Kofi's Morning")
--   "Maya" in the A2 branching "The Package Mix-Up" -> "Hana"
-- Data only: UPDATEs the stored English rows (the slugs stay, so progress and any recordings keep their keys).
-- No grants change. Word-boundary matches (\m ... \M) so a longer word is never touched. Idempotent: a second
-- run finds nothing to replace. Narration recordings: none exist yet; run scripts/story-audio.ts after this lands.

UPDATE public.stories
SET title = regexp_replace(title, '\mMia\M', 'Kofi', 'g'),
    segments = regexp_replace(segments::text, '\mMia\M', 'Kofi', 'g')::jsonb
WHERE course = 'en' AND slug = 'mias-morning';

UPDATE public.story_quiz_questions q
SET prompt = regexp_replace(q.prompt, '\mMia\M', 'Kofi', 'g'),
    choices = regexp_replace(q.choices::text, '\mMia\M', 'Kofi', 'g')::jsonb
FROM public.stories s
WHERE s.id = q.story_id AND s.course = 'en' AND s.slug = 'mias-morning';

UPDATE public.stories
SET title = regexp_replace(title, '\mMaya\M', 'Hana', 'g'),
    segments = regexp_replace(segments::text, '\mMaya\M', 'Hana', 'g')::jsonb,
    nodes = regexp_replace(nodes::text, '\mMaya\M', 'Hana', 'g')::jsonb
WHERE course = 'en' AND slug = 'the-package-mix-up';
