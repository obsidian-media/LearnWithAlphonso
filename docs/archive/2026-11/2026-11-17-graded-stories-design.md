> Historical record. Delivered in #617 web (2026-11-17), #623 Edge Function, #624 iOS, #625 Android (2026-11-18); later #648, #657, #659, #675, #678, #691. Current behaviour: ARCHITECTURE.md § Graded stories (narration: docs/operations.md).

# Graded stories (read-along leveled reading) - design

Date: 2026-11-17. Status: owner-approved design; web first increment.

## Goal

A "Stories" library that is the reading analog of the Listen library: short leveled texts, grouped by level, that a learner reads while hearing them narrated. Time spent counts toward the `reading` skill. Web first; iOS and Android follow.

## Experience

1. Library: stories grouped by level (A1, A2, ...) for the learner's languages. Only PUBLISHED stories appear.
2. Reader: the text is shown segmented (sentences or paragraphs).
3. Narration: audio through the existing `/api/tts`, with the current sentence highlighted as it is read (sentence-level highlight is enough for v1).
4. Tap any word to hear and define it, reusing the existing tap-to-define.
5. Check: a short multiple-choice comprehension check at the end (2-3 questions), reusing the podcast quiz pattern. Passing credits the `reading` skill.

## Data model

Mirrors the podcast content model (`podcast_episodes`, `podcast_folders`, `podcast_quiz_questions`, `listen_progress`).

- `stories`: id, language, level, title, segments (jsonb array of strings), optional audio reference, `published` flag, `published_at`, created_at.
- `story_quiz_questions`: story_id, position, prompt, choices (jsonb), correct_index.
- `story_progress`: per user and story, like `listen_progress` (position, completed, quiz result, updated_at).
- RLS: learners read only published stories and their questions, and only their own progress. Drafts are hidden. Writes to stories are service-role only.
- Grants follow the default-grants rule (explicit GRANT plus the guard marker).
- Publishing is a data change (`published = true`), so the library grows live with no release.

## Seed

About six proof stories (about two per language, A1-A2), each with 2-3 questions. They are drafted by the agent, not a native speaker, so they are seeded UNPUBLISHED and flagged as needing content review. They must not reach real learners until reviewed.

## Out of scope

Pricing, the lesson engine and the podcast feature are untouched. iOS and Android are a follow-up.
