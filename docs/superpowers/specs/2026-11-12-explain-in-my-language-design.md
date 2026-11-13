# Explain in my language (2026-11-12)

Owner-approved mock: mocks-r8, feature 1. Written after the fact from the merged PR (#488) so the behaviour has a home in `docs/`; the code is the source of truth.

A short WHY in the learner's own language, only when asked. Lesson text stays 100% in the course language.

## Shape

- **One endpoint.** `POST /api/explain` runs, in order: auth, the owner's AI switch, AI consent, the free checks and the cache lookup, the quota, the model. The body is the item only: a wrong answer, a word, or a chat message.
- **The language is never sent.** It is read from the account (`user_metadata.learner_profile.nativeLanguage`). The prompt is built on the server and learner text goes in only as JSON data.
- **Quota.** A new `explain` kind: 40 a day, 10 a minute. A cache hit spends nothing. From Hector (`surface: "hector"`) the request needs Pro and spends Hector's own 150 a day instead. The numbers live in `src/lib/ai-quota.server.ts` (`DAILY_LIMITS`) and in `consume_ai_quota`; a test compares them.
- **Cache.** `public.explanation_cache`, one row per (kind, course, native language, item), keyed by a SHA-256 of those, never the learner's text, no user id. Server only: RLS on, no policy, no client privilege.
- **Settings.** `user_metadata.learner_profile.explainMode`: Tap to explain (the default), Always show, Target language only. No table.
- **Clients (web, iOS, Android).** An "Explain in <language>" chip on the wrong-answer verdict and on word cards; "Say that in <language>" under Practice and Hector tutor bubbles; a Settings section (My language picker plus the mode); the shared AI label; right-to-left per block for fa, ar, he, ur and ps with quoted course-language phrases kept left to right; loading, quota-spent, offline and consent states; hidden when the mode is off, the native language is unset, or it equals the course.
- **Privacy.** The in-app policy says what is sent and that the cache is shared (`docs/privacy-and-data.md`).

## Implementation status (2026-11-13, main at #498)

| Part | State | Notes |
| --- | --- | --- |
| Migration `20261112100000` (table, `explain` quota kind) | **Merged** | the PR was held until the owner applied it |
| `/api/explain`, cache, quota, consent | **Done** (#488) | `explain.test.ts`, `explain-migration.test.ts` (PGlite), `routes/api/explain.test.ts` |
| Web, iOS, Android UI and Settings | **Done** (#488) | in build 62 (TestFlight, not submitted); not yet checked on a device |
| Right-to-left layout | **Done** (#488), unverified on a device | |
| PostHog `explain_requested` event | **Open** | the name is reserved in the three event lists; no call site |
| App Privacy and Play Data safety labels for AI requests | **Open, owner** | Explain sends the item text to the model provider |
| Prompt quality across languages | **Unreviewed by a native speaker** | the model writes the explanation; only the cache makes a second read free |
