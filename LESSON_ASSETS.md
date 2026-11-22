# Learn with Alphonso - Lesson Assets

What lesson-related assets exist today, and the pipeline for the one that is built per term: vocabulary photos. Verified 2026-11-22 against main (`d8350542`) and production.

The original 2026-09 asset wish list (a uniform 300-lesson curriculum with per-word audio, 600 illustrations, Lottie animations and so on) was almost entirely never built; it is kept as `docs/archive/2026-11/LESSON_ASSETS-original-plan.md`.

## Curriculum size (production, 2026-11-22)

1,830 lessons: English 609, French 611, Spanish 610 (`lessons` joined to `units.course`). 13,429 questions in `questions`. For the per-level table see `AGENTS.md`'s Content Structure section.

## What is built

| Asset | Where | Notes |
| --- | --- | --- |
| Vocabulary photos | `src/data/vocab-images.ts` (generated), bucket `vocab-images/<lang>/<slug>.jpg`, table `vocab_images` (columns `term`, `url`, `alt`, `credit`) | One self-hosted stock photo per vocabulary term. **1,421 live**: English 471, French 476, Spanish 474 (the committed file and the production table agree). Pipeline below. |
| Spoken audio | Live Deepgram TTS through `src/routes/api/tts.ts` for conversation practice and listening questions; `public/voices/` holds 49 voice-sample MP3s (`aura-2-*`) | There are no pre-generated per-word pronunciation files and no `public/audio/`. |
| Podcast audio | Deepgram Aura-2 episodes in the `podcast-audio` bucket, rows in `podcast_episodes` | Publishing licensed audio only is enforced by a database constraint (`20261012500200_podcast_published_licensed_check.sql`). |
| 3D icons | `public/icons3d/` (30), plus the iOS asset catalog and `android/LearnWithAlphonso/app/src/main/assets/icons3d/` | Fluent Emoji 3D, MIT; see `THIRD_PARTY_NOTICES.md`. |
| Sound effects | `public/sfx/` (9 MP3s), identical copies on iOS and Android | Kenney, CC0; see `THIRD_PARTY_NOTICES.md`. |
| Tutor art, scenes, badges, flags | `public/avatar`, `public/hector`, `public/figures`, `public/scenes`, `public/badges`, `public/flags` (self-drawn SVG) | Not part of the lesson-asset pipeline. |

Not built, and not planned in this file: Lottie/Rive animations, per-topic SVG icon sets, textures, per-lesson illustrations.

## Vocabulary photo pipeline

1. `scripts/vocab-image-terms.ts [--new-only]` plans the imageable terms (`scripts/vocab-imageability.json`; scope `scripts/vocab-images/scope-keys.json`). `--new-only` skips every key that already has a published photo.
2. `scripts/fetch-vocab-images.ts [--limit N]` searches Pexels, then Pixabay (safe search), takes the first clean, big-enough, not-rejected photo, resizes it to a 700px JPEG without metadata and stages it locally under `scripts/vocab-images/work/staging/<lang>/`. Needs `PEXELS_API_KEY` and `PIXABAY_API_KEY` in the environment (never printed). Resumable after a rate limit.
3. `scripts/vocab-image-review.ts` (coordinator-run; reviewers are subagents): `batches`, `second-pass` (a seeded 10% sample), `apply <verdicts>`, `owner-sheet` / `owner-sheet-local --out <dir>`, `apply-owner <objections.json>`, `status`, and `quality` (a metadata-only triage score that orders the human queue; it cannot judge relevance or safety and never approves anything). Verdicts are kept in `scripts/vocab-images/reviews/`.
4. `scripts/vocab-image-signoff.ts` records the owner sign-off in `scripts/vocab-images/signoff.json`.
5. `scripts/upload-vocab-images.ts` (owner-run, service-role key) uploads to the bucket. `--prune` is a dry run listing bucket objects no committed photo references; `--prune --apply` deletes them and refuses a tiny keep-set or more than 10% deletions without `--force-large`.
6. `scripts/write-vocab-images.ts [--planned-urls]` writes `src/data/vocab-images.ts` (published entries are kept as they are; `--planned-urls` writes the data before the upload).
7. Re-export the native bundles with `scripts/export-ios-content.ts` and `scripts/export-android-content.ts`: both write `vocab-images.json`, which the apps bundle, so a new photo reaches a phone only with the next build.
8. The database table is filled by the deploy job: every main deploy runs `scripts/seed-curriculum-db.ts` (ci.yml "Seed curriculum data"), which upserts `vocab_images`. Nobody runs a seed by hand for new photos. `scripts/seed-vocab-images-db.ts` (owner-run; dry run unless `--apply`) is only needed to delete stale rows, because the deploy seed upserts and never deletes.

Adding coverage later: list the new terms in `scripts/vocab-imageability.json`, add their keys to `scope-keys.json`, then run steps 1 to 8. Photos on the rejected-sources list (`scripts/vocab-images/rejected-sources.json`) may never be used again; the data guard checks it.

## Guards

- `src/data/vocab-images.guard.test.ts` enforces host (the project's Supabase storage origin), denylist, review stamp, imageability, sign-off, and that each entry's source, licence, photo page and credit agree, on every PR.
- `.github/workflows/vocab-image-links.yml` checks that every photo URL resolves: on PRs that touch the data or the checker, weekly (Mondays 06:17 UTC) and on demand. It is standalone, so a red result never blocks a deploy.
- Licences and credits for the photos are in `THIRD_PARTY_NOTICES.md` (Pexels License, Pixabay Content License).
