# Explain in my language (2026-11-12)

## Status (verified 2026-11-22 against d8350542)

Delivered in #488 (merged 2026-11-13) on web, iOS and Android; the behaviour below was re-checked against code and is current. LIVING because this file is the only place the endpoint order, the cache key and the settings contract are written down, and three items are still open (listed under "Open work"). Nothing else in `docs/` describes `/api/explain`, except the privacy table (`docs/privacy-and-data.md`) and the `explain` quota line in `docs/operations.md`.

Checked in code: `src/routes/api/explain.ts`; `EXPLAIN_DAILY_LIMIT = 40` in `src/lib/explain.ts` and `explain: 40` / `hector: 150` in `src/lib/ai-quota.server.ts`; the 40 a day and 10 a minute in `supabase/migrations/20261112100000_explain_in_my_language.sql`; RTL languages `ar fa he ur ps` in `src/lib/explain.ts`; settings read in `src/lib/explain-settings.ts`; the native rule copies `ExplainRules.swift` and `ExplainRules.kt`; the analytics event `explain_requested` in `src/lib/analytics-events.ts` and the iOS and Android event lists.

Open work:
- App Privacy (App Store) and Data safety (Google Play) answers for AI requests: owner step, tracked in `docs/OPEN-ITEMS.md` item 3.
- Right-to-left layout and the three clients on a real device: no device record exists (unverified: device checks are owner-run; `docs/OPEN-ITEMS.md` item 37 lists RTL in Explain).
- Prompt quality across languages: unreviewed by a native speaker (no review exists in the repo).

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

## Implementation status (carried from 2026-11-13; re-verified 2026-11-22)

| Part | State | Notes |
| --- | --- | --- |
| Migration `20261112100000` (table, `explain` quota kind) | **Merged** | the PR was held until the owner applied it |
| `/api/explain`, cache, quota, consent | **Done** (#488) | `explain.test.ts`, `explain-migration.test.ts` (PGlite), `routes/api/explain.test.ts` |
| Web, iOS, Android UI and Settings | **Done** (#488) | first shipped in build 62 (TestFlight; verified: #488 `cc70949d` is an ancestor of the build 62 commit `f86cc7d4`, #498); not submitted to App Review; no device check on record |
| Right-to-left layout | **Done** (#488) | (unverified: no device check on record) |
| PostHog `explain_requested` event | **Done** (round 14) | source = kind of item; fires where the item is sent, after consent; web, iOS, Android |
| App Privacy and Play Data safety labels for AI requests | **Open, owner** | Explain sends the item text to the model provider; tracked in `docs/OPEN-ITEMS.md` item 3 |
| Prompt quality across languages | **Unreviewed by a native speaker** | the model writes the explanation; only the cache makes a second read free |
