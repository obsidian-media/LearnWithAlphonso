# Changelog

Versioned history of Learn with Alphonso (repo internal name
`english-buddy-app-33`). Grouped by milestone, not strictly one entry
per PR — see `gh pr list --state merged` or `git log` for the literal
commit-by-commit history. PR numbers are given for traceability; this
file itself won't be kept perfectly current — treat entries as a guide
to _when_ something shipped, and re-check the actual code for _how it
works now_.

## V5 — iOS Canopy theme, English content quality, GDPR export fix, podcast library (2026-09-23 – in progress)

**Opt-in matching on iOS and Android (2026-10-07, study together Phase 3b, native). Study together is now complete on web, iOS and Android.** Kit / `:core`: matching wording (word-for-word the web, pinned by the shared fixtures), `MyBuddy.isMatch` (a server without matching sends none: a friend pair), `BuddyPool`, `joinBuddyPool` / `leaveBuddyPool` / `getBuddyPool` (throw on failure). Apps: while unpaired the buddy section shows the opt-in explanation, an "I'm 13 or older" confirmation (the find buttons stay disabled until it is ticked; the server refuses without it) and one "Find me a study buddy (<course>)" per course studied, or "Looking for a study buddy ..." with Stop looking (always available, even while switched off); a matched buddy shows "Matched learner" with block (confirm, then the pair ends) and report. iOS Kit 24 tests locally; Android tests in CI only; app targets compile in CI only; nothing run on a device. In no build/release until the owner cuts one.

**Opt-in matching with another learner, server and web (2026-10-07, study together Phase 3b).** Owner decision: minimum age 13 (App Store 13+), ship study together complete. A learner without a buddy can choose to be matched with another learner of the same course at a similar level (CEFR within one step). Guardrails, because App Store guideline 1.2 (Feb 2026) names "random or anonymous chat": opt-in with an explanation and a declared-age confirmation ("I'm 13 or older"; the server refuses with `age_required` and records `age_confirmed_at`, since the app collects no birthdate); never re-matched with a past buddy; never across a block; preset messages only; only display name and weekly progress visible; "Matched learner" label with block and report on the card; and a server-side switch (`UPDATE public.buddy_settings SET matching_enabled = false;`) that turns matching off for everyone without a release. `join_buddy_pool` matches under one pool lock and pairs through `_create_buddy_pair` (which skips the friendship check only for matches, still re-checks blocks under the per-person locks, and clears both pool rows); `leave_buddy_pool`, `get_buddy_pool`; `get_my_buddy` gains `is_match`. Proven before merge in a rolled-back transaction (23 checks: not studying, waiting, block and past buddy skipped, level distance, oldest first, pool cleared on pairing, matched pairs message, switch off, block ends a matched pair and they are never re-matched, RLS own row only, no client writes). Web card tests ran in CI only (the machine could not start jsdom workers at the time). Native matching UI follows in the next PR.

**Preset messages on iOS and Android (2026-10-07, study together Phase 6).** iOS Kit and Android `:core`: the 8 presets, the hourly limit and the message lines (word-for-word the web, pinned by the shared fixtures), `BuddyMessage`, `sendBuddyMessage` / `getBuddyMessages` (throw on failure, never an empty history). Apps: the buddy section gets a "Send <buddy> a message" menu with the 8 presets and the last 10 messages; messages load with the buddy (a messages failure is a load failure) and refresh every minute while the section is on screen. iOS Kit 20 tests locally; Android tests in CI only. In no build/release until the owner cuts one. **This completes study together on all three platforms, except Phase 3b (stranger matching), which waits on the owner's age-rating decision.**

**Preset messages between study buddies, server and web (2026-10-07, study together Phase 5).** Buddies can send each other one of 8 fixed encouragements ("Nice work!", "Good night!", ...); there is no free text anywhere, so the App Store privacy answers and age rating do not change. `buddy_messages` stores only a preset id (CHECK constraint plus a check in the function); `send_buddy_message` needs an active pair, takes the same per-person lock as pairing (an unfriend or block that wins the race stops the message; two parallel sends cannot both pass the limit) and allows 20 per sender per hour; `get_buddy_messages` returns the active pair's newest 50. Web: the buddy card gets the 8 preset buttons and the last 10 messages, polled every minute while the Friends page is open; a failed read shows "Couldn't load your study buddy", never an empty history. The export now reads every pair-scoped table (`RLS_SCOPED_EXPORT_TABLES`: `buddy_weeks`, `buddy_messages`). The new statuses are also in the iOS and Android wording tables (the shared fixtures require it); the native message UI is Phase 6. Proven before merge in rolled-back transactions on the live database (send, free text / null / wrong case refused, not paired, both sides read, outsider reads nothing, exactly 20 per hour then `rate_limited` and again after an hour, unfriend stops sending, history kept for the ex-buddies only).

**Study buddies on Android (2026-10-07, study together Phase 4, part 2).** `:core`: `BuddyRules`, `BuddyCopy`, `MyBuddy`, `BuddyRequest` and the `getMyBuddy` / `getBuddyRequests` / `requestBuddy` / `respondBuddyRequest` / `cancelBuddyRequest` / `endBuddy` client (throws on a server error or a row that does not decode), tested against the shared `buddy.fixtures.json`. App: `BuddyViewModel` (newest load wins, cancellation rethrown, a failure is `loadFailed` and never the "ask a friend" state, busy until the reload after an action lands) and `BuddySection` on the Friends screen with the same wording and states as web and iOS. Tests run in CI only (the machine had too little free memory for Gradle); in no release until the owner cuts one.

**Study buddies on iOS (2026-10-07, study together Phase 4, part 1).** Kit: `BuddyRules` (week rules), `BuddyCopy` (every word of the card and every server status, word-for-word the web), `MyBuddy` / `BuddyRequest` row decoding, and `ProgressSyncClient` `getMyBuddy`, `getBuddyRequests`, `requestBuddy`, `respondBuddyRequest`, `cancelBuddyRequest`, `endBuddy` (throw on a server error or malformed row, so a failure never reads as "no buddy"); 15 Kit tests against the shared `buddy.fixtures.json` (now also carrying the card wording, which the web card reads from `src/lib/buddy.ts` instead of inline strings), mutation-checked. App: `BuddySection` on the Friends screen (buddy's week, streak and grace, end with confirmation; incoming and outgoing requests; an "Ask a friend" menu of friends with no pending request; "Couldn't load your study buddy" + Try again on failure; newest load wins, cancelled loads are not failures). Compiled by `ios-app-build`, not run on a device; in no build until the owner cuts one. The fixtures are copied byte-for-byte into the iOS Kit and Android core tests, pinned by `src/lib/buddy-native-fixtures.test.ts`.

**Study buddies between friends, server and web (2026-10-06, study together Phase 3a).** Two accepted friends can agree to be study buddies (both consent: `request_buddy`, `respond_buddy_request`, `cancel_buddy_request`, `end_buddy`; asking someone who already asked you pairs you). Each week both aim for 3 distinct lessons (counted from the pairing, any course); `get_my_buddy` resolves past weeks lazily (no cron): both hit -> streak + 1 and the grace week is restored, otherwise one grace week holds the streak, otherwise it resets; the week the pair was formed can only help. One active buddy per user is the primary key of `buddy_members` (the spec's "partial unique index per user" could not have enforced it). Unfriending or blocking ends the pair through triggers on `friendships` and `blocked_users`. A block is recorded as `unfriended`, never `blocked`: `buddy_pairs` is readable and exported to both buddies, while a block is visible only to the blocker (found by the final review). Every pairing, request and ending path takes per-person advisory locks in a fixed order, so a block that races an acceptance always wins, two friends asking each other at once are paired, and finished weeks are judged before any ending (CodeRabbit). Web: a Study buddy card and an "Ask to be study buddy" button on the Friends page, "Couldn't load your study buddy" + Try again on failure; privacy line; GDPR export includes `buddy_pairs`, `buddy_requests`, `buddy_weeks`. No free text (preset messages are Phase 5). **Not built: 3b, opt-in matching with strangers, waiting on the owner's age-rating decision.** Proven before merge in three rolled-back transactions on the live database (nine scenarios, method in `docs/sql-probes.md`; one 29 KB script was too large for the MCP and was split). Migration `20261006180000_buddy_pairing.sql`; plan `docs/superpowers/plans/2026-10-06-buddy-pairing-web.md`.

**A failed team lookup no longer looks like "no team" (2026-10-06, follow-up to the teams fix).** On web, iOS and Android the Teams screens swallowed an error from `get_my_team` and showed the create/join forms, which is how the broken function went unnoticed. Web: `getMyTeam` throws on an RPC error; `/teams` shows "Loading…" while the lookup is pending (the forms used to render immediately) and the query does not retry, so there is no ~7 s window of create/join forms during an outage; both team pages show "Couldn't load your team." with a Try again button on failure (4 new tests, red before the change; found by the independent reviewer: the loading-state hole). iOS: `loadFailed` state in `TeamsView` (a cancelled load is not a failure; a failed refresh keeps the team on screen; leaving clears the team and kicking drops the member before the reload, a failed refresh keeps the members with the kept team, and only the newest reload commits, so an older one finishing late cannot put back a team just left). Android: `TeamsUiState.teamLoadFailed` and a retry card in `TeamsScreen` with the same rules as iOS plus cancellation propagated from the lookup (5 new `TeamsViewModelTest` cases: failure then recovery on retry, a failed refresh keeps the loaded team and its members, leaving clears the team even if the reload fails, a removed member disappears even if the reload fails, and "no team" is not a failure; the newest-load-wins guard is not unit-tested). The native code is merged but in no build or release; Android tests ran only in CI, the iOS app-target change is verified only by `ios-app-build`.

**Teams were broken in production, now fixed; XP payouts now pay the course learners study (2026-10-06, BACKLOG 0.0-af).** `_join_team_impl` (behind join_team, join_public_team, auto_join_team and create_team) and `get_my_team` declared a `team_id` output column and then used an unqualified `WHERE team_id = ...`; plpgsql rejects that at RUN time (42702), so nobody could create or join a team and a member could not load their own team, on web, iOS and Android. It had been that way since the functions were written (production had 0 team members, which is why nothing was noticed). Found by running the deployed functions as seeded users in rolled-back transactions. Migration `20261006170000_fix_team_joins_and_course_aware_payouts.sql` qualifies the references; new guard `src/lib/plpgsql-output-column-clash.test.ts` reads every migration and fails on the common forms of this mistake (an output column used unqualified in a condition, `SELECT col INTO`, `ORDER BY`, `RETURNING`, `USING`; plpgsql functions only). The same migration fixes the same mistake in `claim_weekly_quest` (`SELECT xp INTO cur_xp ...` while returning an `xp` column), which stopped every weekly quest claim on every platform. The same migration fixes 0.0-af: the weekly challenge reward (+100) and the weekly team bonus (+100) paid on `profiles.active_language`, which nothing writes, so French and Spanish learners were recorded as paid and received nothing; they now pay the language of the learner's most recently completed lesson (and both functions pin `SET timezone = 'UTC'`). Proven live in rolled-back transactions (method and scenarios in `docs/sql-probes.md`): create, join by code and auto-join work, a quest claim pays once and then answers already-claimed, a French-only learner gets +300 for three challenges, a Spanish team member gets the +100 team bonus, a member with no lessons gets none. Nothing needed repairing retroactively.

**Team mission on Android (2026-10-06, study together Phase 2c, merged as #234).** `:core`: `TeamMission`, `getTeamMission`, `TeamMissionModel` with 11 + 5 tests (the first group decodes all 11 shared fixture cases; mutation-checked, 12 of 12 killed); app: `TeamMissionViewModel`, `TeamMissionCard`, mounted on the Learn screen and the team screen. The Android copy of the fixtures is now pinned byte-for-byte too. Merged but in no release; not run on a device (see DEVICE-CHECKLIST.md).

**Team mission on iOS (2026-10-06, study together Phase 2b).** `TeamMission` + `ProgressSyncClient.getTeamMission` in the Kit (13 tests incl. the shared fixture contract and client behaviour, mutation-checked), `TeamMissionSection` on the team screen and the Learn tab. Merged to main but in no build; the SwiftUI layer is compiled by CI only. Android follows.

**Team player badge (2026-10-06, study together Phase 2).** Members who are paid for a finished team mission also unlock `team_player`, granted inside the same atomic payout by `_resolve_team_mission` (migration `20261006160000_team_player_badge.sql`). The new `team` achievement category has no client stat, so lesson completion can never unlock it (test-pinned). The catalog entry is mirrored in `src/data/achievements.ts` and the three bundled JSON copies (iOS app, iOS Kit, Android assets), regenerated with the export scripts; iOS/Android catalog tests updated. Verified live in a rolled-back transaction: badge and XP to exactly the contributors, none to a member who contributed nothing, no duplicate on a second read.

**Team missions, web + server (2026-10-06, BACKLOG 0.0-ac item 2 / Study together Part 1).** Every team of 2+ members gets a weekly shared goal (members x 4 lessons, snapshotted on the first read of the week); reaching it pays each contributing member +50 XP once, lazily, no cron. New tables `team_missions` (server-only) and `team_mission_rewards` (owner-readable, in the GDPR export), `get_team_mission()`, a card on the team screen and the Learn page, one privacy-policy line. SQL logic verified in a rolled-back transaction on the live database (target snapshot, late joiner, single payout). iOS, Android and the Team player badge follow in Phase 2. Spec `docs/superpowers/specs/2026-10-06-study-together-design.md`, plan `docs/superpowers/plans/2026-10-06-team-mission-web.md`.

**GDPR export was silently missing four tables; read privileges trimmed (2026-10-06, BACKLOG 0.0-ae).** `challenge_completions`, `duel_queue`, `season_cohort_members` and `season_placements` had no SELECT policy, so `exportMyData` (which reads as the user) returned nothing for them. `20261006140000_read_privileges_and_export_policies.sql` adds own-row SELECT policies, limits `anon` SELECT to the nine public content tables, and removes `authenticated` SELECT on four server-only tables. A test now fails if any export table lacks a SELECT policy.

**Web lesson completion showed 0 XP when it earned XP (found and fixed 2026-10-06, BACKLOG 0.0-ae review).** `completeLessonRemote` inserted the friends-feed event through the user's RLS client; `friend_activity_events` has no INSERT policy, so the call threw after progress was saved and the lesson screen showed 0 XP. Now written with the service role, as the Edge Function does. New guard `src/lib/rls-client-writes.test.ts` checks every `supabase.from(...)` write in server code against the policies in the migrations.

**Unbacked `authenticated` DML privileges removed (2026-10-06, BACKLOG 0.0-ae follow-up 1).** `20261006130000_trim_authenticated_unbacked_dml.sql` revokes INSERT/UPDATE/DELETE on 34 tables where no RLS policy backed the privilege (RLS already denied them; SELECT untouched). `deleteMyAccount` stops pre-deleting from `activity_days`, `user_progress`, `ai_usage`, `ai_rate_limits` (grant without a DELETE policy = silent no-op; CASCADE removes them). A test pins the per-table list and fails if a policy depends on a revoked privilege.

**Database privileges tightened (2026-10-06, BACKLOG 0.0-ae).** Supabase had granted `anon` and `authenticated` every privilege on every `public` table, leaving RLS as the only barrier. Migration `20261006120000_tighten_default_table_privileges.sql` removes all write privileges plus TRUNCATE/TRIGGER/REFERENCES from `anon`, TRUNCATE/TRIGGER/REFERENCES from `authenticated`, and makes new tables start with no client privileges. `authenticated`'s own DML is deliberately untouched (follow-up in `docs/database-privileges.md`). New CI guard `src/lib/migration-grants.ts`: a migration that creates a table must GRANT what clients need or carry `-- client-grants: none public.<table>`.

**Demo seed writes the CEFR level to the column the apps read (2026-10-05, BACKLOG 0.0-ab).** `scripts/seed-demo-account.ts` set `user_progress.cefr_level`, frozen since the multi-course migration, and never `language_progress.cefr_level`, which iOS, Android and the web all read, so the seeded account's Learn tab opened on A1. It now writes the language-progress column only; a source-reading test guards both directions (`src/lib/seed-demo-account.test.ts`). Existing seeded accounts keep A1 until the seed is re-run.

**Save-any-word: sentence splitting no longer breaks at abbreviations (2026-10-05; web live on merge, iOS in no build).** Tapping "Smith" in "Mr. Smith went home." used to save the fragment "Smith went home.", which gave the model truncated context and stored a fragment on the card. A full stop now ends a sentence only when whitespace follows it and it does not close a title or abbreviation (Mr, Dr, etc, e.g., i.e.), sit inside a number (3.14) or follow a capital initial ("J. Smith"); "I" and "A" still end sentences. Same rule in `src/lib/word-segmenter.ts` and Kit `WordSegmenter.swift`; every rule fails a test when removed. Known limit: the abbreviation list is short and English-only.

**Learning goal planner, iOS (2026-10-06; in no build yet).** The Learn tab shows the same goal card as the web: "Finish B1 by 1 Mar 2027", progress, on track / ahead / behind / date passed, lessons a week, a suggested date, and Change / Remove, with a setup sheet (level, UTC date picker, 3/6/12-month presets, live preview). The device does no plan maths: Kit `LearningGoalClient` calls the same `/api/learning-goal`, `LearningGoalDecoding` reads the shared contract (`learning-goal.fixtures.json`, copied into the Kit tests and pinned byte-for-byte by `src/lib/learning-goal-ios-fixtures.test.ts`), `GoalCopy` holds the wording (identical to the web card), and `GoalCache` keeps the last plan per user and course for being offline only (never for a 401 or server error). Unknown future statuses decode to `.unknown` instead of breaking the app. Found while copying the wording: the web card printed dates with the browser locale ("Sept") and showed the suggested date twice for a behind-and-unrealistic plan; both fixed on the web in the same PR. NOT verified: the SwiftUI layer (layout, VoiceOver, Dynamic Type, the setup sheet) is compiled by CI's ios-app-build only and has not run on a device. No iOS build was cut.

**Learning goal planner, Android (2026-10-06; merged code, not released to Play).** The Learn tab shows the same goal card as web and iOS: "Finish B1 by 1 Mar 2027", progress, on track / ahead / behind / date passed, lessons a week, a suggested date, and Change / Remove, with a setup dialog (level chips, a Material3 date picker limited to UTC tomorrow and later, 3/6/12-month presets, live preview). The device does no plan maths. In `:core`: `ApiHttp` gained GET, PUT and DELETE; `LearningGoalClient` calls the same `/api/learning-goal`; `LearningGoalDecoding` reads the shared contract (`learning-goal.fixtures.json`, copied into the core test resources and pinned byte-for-byte by the same web test that pins the iOS copy); `GoalCopy` is the wording (identical to web and iOS, fixed English month table); `GoalCache` keeps the last plan per user and course for being offline (an `IOException`) only; and `GoalCardModel` is the card's whole state machine, with the stale-request guard (a slow load, save or remove for a course the learner left is dropped) UNIT-TESTED, which the iOS SwiftUI version could not be. A coroutine cancellation is never shown as an error or as offline. Unknown future statuses decode to `UNKNOWN`. 67 new core tests cover it (295 core and 74 app unit tests pass in total); every guard was broken on purpose and fails a test. A fresh reviewer's findings were fixed before merge: the card now reloads quietly (no "Loading" flash) every time the learner returns to the Learn screen, because its view-model outlives the screen and used to show stale numbers after a lesson; a save runs in the view-model's scope so leaving the screen mid-save no longer leaves the old goal on screen; the level chips and month buttons wrap at large font sizes; errors are announced to TalkBack; and an expired goal opens the dialog on tomorrow instead of an unselectable past day. Deferred: the offline cache survives sign-out and account deletion (keyed by user id, so another account cannot read it; web and iOS behave the same), and the date picker treats "today" as UTC. The Compose layer compiles (`:app:compileDebugKotlin`) and the existing app unit tests pass, but it has NOT been run on a device or emulator: layout, TalkBack, 200% font scale, the date picker and the offline cache on a real device are unverified (added to `android/LearnWithAlphonso/DEVICE-CHECKLIST.md`). Nothing is uploaded to Google Play.

**Learning goals: default table privileges revoked (2026-10-06).** After the planner's migration deployed, a production check (`information_schema.role_table_grants`) showed `anon` and `authenticated` each held INSERT/UPDATE/DELETE/TRUNCATE on `learning_goals`: Supabase's default privileges grant ALL on every new public table, and the migration's `GRANT SELECT` only added to that. Not exploitable through PostgREST (RLS is on with a SELECT-only policy), but TRUNCATE is not governed by RLS, so `20261006110000_learning_goals_revoke_default_grants.sql` revokes everything from both roles and re-grants SELECT to `authenticated`. A text test of the SQL could not have seen this; the lesson is in AGENTS.md.

**Learning goal planner, web (2026-10-06; live on merge; iOS and Android clients not built yet).** A learner sets "finish B1 by <date>" on the Learn page and sees how many lessons a week that takes, whether they are on track, ahead or behind, and a suggested later date when behind or when the goal is unrealistic. The plan is computed ONCE on the server (`planGoal` in `src/lib/learning-goal.ts`; `GET/PUT/DELETE /api/learning-goal`, with a preview `GET` that writes nothing) and the card only renders it, so iOS and Android will show the same numbers; `src/lib/learning-goal.fixtures.json` is the shared response contract. New table `learning_goals` (one goal per user and course; clients can only SELECT, writes go through the route). "Finish B1" means finishing the level; lessons remaining are counted from the learner's current level up; the pace is the last 7 days of first-time lesson completions against the weekly requirement; 14 and 35 lessons a week are the "ambitious" and "unrealistic" warning limits (named constants). Free and Pro both get it; no AI call, no quota. Privacy policy updated in the same change. A fresh reviewer's findings were fixed before merge: an expired goal now has its own status instead of a nonsense weekly number; the pace counts only lessons in scope; `createdAt` is normalised for Swift; the offline cache is per user and only for network-offline; server validation reasons reach the learner; the date picker and month presets cannot pick an invalid date; focus returns to the card. Deferred: days are UTC on both ends (a learner far from UTC can see "pick a date after today" near midnight), no confirmation on Remove, a course change mid-setup discards the panel, and the level select defaults to B1 even for a B2 learner. NOT verified: the card in a browser or at phone width, a screen reader, and the migration against production until the deploy runs; `types.ts` has a hand-written `learning_goals` entry that the types workflow overwrites after deploy.

**Save-any-word: keyboard access to transcript words (2026-10-05; web, live on merge).** Transcript words are deliberately out of the tab order, which left keyboard-only users with no way to save one. The transcript now has one tabbable "Browse words with the keyboard" button that moves focus to the first word; the arrow keys then walk the words (clamped at both ends, not wrapping), Enter opens the save dialog, and the arrows are left alone on every other control. Chat and explanation words were already tabbable. Not verified with a real screen reader or in a browser.

**Save-any-word: the extra-practice explanation is tappable too (2026-10-05; web live on merge, iOS in no build).** The "Generate more practice" section after a lesson showed its explanation as plain text, the one place an explanation was not tappable. Web passes the course to its `AnswerFeedback`; iOS gives both its right-answer caption and its tip card the same `SavedWordPolicy` gate and `saveWordHandler` as `ExplanationView` (so English course only), plus the first-three-times hint (`SaveWordHintLine` is no longer private). The iOS change compiles only in CI's `ios-app-build` and is not run on a device.

**Save-any-word on the web, phase 4 (2026-10-05; live on merge).** The same save flow as iOS, using the same `POST /api/define-word` route and row shape unchanged. Tutor replies in Practice and Campaign, the explanation shown after answering in the lesson player and the review queue (English course only), and podcast transcripts: each word is a button that opens one dialog showing the word and the sentence it was tapped in, and saying that saving sends them to an AI service; nothing is sent until the learner presses Save. New `src/lib/word-segmenter.ts` (same token rule as the server's validator, the tapped sentence chosen by position and windowed in code points around the TAPPED occurrence, never cutting a surrogate pair), `src/lib/saved-word-client.ts` (same error wording as iOS, a 200 of the wrong shape is not a save), `src/components/{SaveWord,TappableText}.tsx`. Transcript words are out of the tab order (hundreds of tab stops); a keyboard path for them is a backlog item. **Privacy policy updated in the same change** (it now says saved words are stored and what NVIDIA receives; its date is bumped), because unlike iOS the web ships on merge. Hector does not exist on the web, so there is no Hector surface. Fresh-reviewer fixes: the dialog traps Tab and locks page scroll, words are memoised so a playing transcript does not re-render thousands of buttons, the policy mentions stored answer choices. Known and deferred: every word being a button hurts screen-reader prose navigation and drag-selecting/copying text (BACKLOG); the sentence splitter treats every full stop as a sentence end ("Mr. Smith" saves as "Smith went.").

**Save-any-word, phase 3: lesson explanations and podcast transcripts (2026-10-05; iOS, in no build yet).** Words in the explanation shown after answering a question (the plain caption and Alphonso's tip card), in both the lesson player and the review queue, and in the podcast transcript sheet, can now be tapped to save. Lessons are deliberately **English-course only** (`SavedWordPolicy`, tested in the Kit): in the French and Spanish courses an explanation is English text with quoted foreign words, so a tapped word could be filed under the wrong language; prompts are left out for the same reason and because tapping before answering could give an answer away. The screens provide one `saveWordHandler` environment value that the shared `ExplanationView` / `AlphonsoTipCard` read, so every question type is covered without touching each call site. Because the words look like plain text, a small "Tap a word to save it." line shows under an explanation the first three times (`SavedWordHint`, tested) and then goes away. In Alphonso's tip card the words stay reachable for VoiceOver (the card becomes a container labelled "Incorrect." instead of one combined element, only when words are tappable, so nothing is read twice); the plain "Correct." caption still needs a VoiceOver check on a device. Web (phase 4) is still to do.

**Save-any-word, phase 2: Practice and Campaign replies (2026-10-05; iOS, in no build yet).** Assistant replies in Practice scenarios and Campaigns are now tappable exactly like Hector's, through the one shared `TappableText` (it takes the course and returns a ready `SaveWordRequest`, so each screen is a few lines). Also from the earlier reviews: a word that occurs in two sentences now saves the sentence it was tapped in (`WordSegmenter.sentence(containing:in:atOffset:)`, the link carries the Character offset), a "letter" is now exactly the server's `\p{L}` (Swift's `Character.isLetter` also accepts Roman-numeral and circled letters the server rejects, now covered by a parity test against the server's regex), and words over the server's 40-unit limit are no longer linked. Free users can save from Practice and Campaign, bounded by the `define` quota (40/day). Lessons, podcast transcripts and web are still to do.

**Save-any-word on iOS, Hector replies (2026-10-05, BACKLOG §0.0-ac #4; in no build yet).** Tap a word in Hector's reply and save it with its sentence: the AI-written meaning shows at once and a multiple-choice card joins the Review queue (first due the next day). Kit: `WordSegmenter` (tap segmentation and whole-word sentence selection that matches the server's rule), `WordLink`, `SavedWordError`, `AIConversationClient.defineWord`, `ReviewItem.isSelfContained`. App: `TappableText`, `SaveWordSheet`, adopted in Hector bubbles only; `ReviewQueueView` renders any self-contained item. Sentences are clamped in UTF-16 units to match the server's limit, and the save sheet refreshes its token like every other AI screen. The web review page now renders `saved_word` rows too (it used to drop them while still counting them), and the two temporary type casts in `define-word.ts` are gone now that the generated types know the columns. Phases 2-4 (Practice/Campaign, lessons and transcripts, web save UI) are not done. Spec and plan: `docs/superpowers/specs|plans/2026-10-05-save-any-word-*`.

**Save-any-word backend (2026-10-05, BACKLOG §0.0-ac #4; inert until the iOS client ships).** New `POST /api/define-word`: one NVIDIA call turns a tapped word plus its sentence into a stored multiple-choice review item (new `review_items.source = 'saved_word'`, columns `saved_word`/`saved_context`), with its own `define` AI quota (40/day, 10/minute), a 500-word-per-course cap, and a free no-AI path for a word already saved. `grade-review` (Edge) and web `gradeReview` grade saved words from the stored choices. The quota migration restates every existing limit as it is live; basing it on the older translate migration would have silently reverted the STT daily cap from 300 to 60, so a test now pins them. Spec: `docs/superpowers/specs/2026-10-05-save-any-word-design.md`; plan: `docs/superpowers/plans/2026-10-05-save-any-word-phase1.md`.

**iOS review polish (2026-10-05, BACKLOG §0.0-z #4/#5; open PR, not yet in a build).** The review sheet only closed by swiping down; it now has a Done button. The Learn tab badge stayed at 2, then 3, after the queue was cleared, for two reasons: an online grade never updated the cached due list (only the offline path did), and `SyncQueueStore` was not observable, so SwiftUI could not see cache changes made through a SwiftData fetch inside `body`. `ReviewGradeOutcome.isStillDue(on:)` (Kit, unit-tested) now decides from the server's own answer whether a graded item leaves the count (a wrong answer stays due today), and `SyncQueueStore` is `@Observable` with a revision counter read through `dueReviewCount`. Not done: the clipped "Continue to next lesson" button on the lesson-complete screen (§0.0-z #6), which needs a device look rather than a blind layout change.

**Declining AI consent no longer blocks lessons (2026-10-05, iOS, BACKLOG §0.0-z #2; open PR, not yet in a build).** `.aiDisclosureGate()` wrapped all of `LessonPlayerView`, so "Not now" popped the learner out of every lesson, including ones with no AI question, which Apple dislikes for a core feature. Consent is now enforced where an answer actually leaves the device: `TranslationGradingPolicy` (Kit, unit-tested) allows the server/NVIDIA second opinion on a written translation only with network, token AND consent, so without consent the curated-phrasing verdict stands and nothing is sent; `SpeakQuestionCard` shows its existing typing fallback (no AI) until the learner taps "Use your voice instead", which presents the disclosure on demand (new `aiDisclosureSheet` modifier). The Practice, Hector, Campaign and Review screens keep the full-screen gate. Not verified locally: the Kit test runner is blocked by a Windows application-control policy and the app target needs macOS, so CI's `ios-swift-tests` and `ios-app-build` are the evidence.

**CI no longer prints the demo account's tokens (2026-10-05, BACKLOG §0.0-aa).** `capture-app-store-screenshots.yml` appended `mint-demo-session.ts`'s output straight to `$GITHUB_ENV`; values added that way are not secrets to GitHub, so `UI_TEST_REFRESH_TOKEN` printed in the clear in every later step's env dump of this public repo's job logs (only the access token was masked). The backlog named one workflow; `maestro-e2e.yml` had the identical leak. Both now pipe through the new `scripts/export-masked-env.sh`, which masks each value before exporting it (7 tests, mutation-checked on both the bare-secret and unset-`GITHUB_ENV` cases). Tokens already printed in old logs stay readable until the demo user is signed out in Supabase Auth (owner step, BACKLOG §0.0-aa).

**AI-route latency is now measurable (2026-10-05, BACKLOG §0.0-z #3).** The demo recording showed Practice/Hector replies taking 16-36 s and one never arriving, but nothing logged where the time went. `/api/hector-respond` and `/api/chat` now time each stage (auth, entitlement, quota, llm, tts) with a small injectable-clock helper (`src/lib/stage-timer.server.ts`), return a `Server-Timing` response header and write one `[ai-timing] route=... status=... total=...ms stage=...ms` line per request to the Vercel runtime logs. Response bodies are unchanged. No speed-up is claimed: reading the code, a Hector turn makes about six sequential network calls before the LLM even starts (two of them `getUser`) but those are on the order of a second; the NVIDIA call has no `max_tokens`, no streaming and no timeout, and earlier production logs show that same call taking 4 s once and hitting a 20 s timeout on retry. The real fix needs a measured run on a real device, then a decision (cheaper model, hedged request, streaming).

**Vercel builds fixed again, CI deploy deadlock removed (2026-10-05).** Vercel had started refusing every build of `main` (it flagged `@tanstack/react-start` 1.168.56 as vulnerable). PR #202 bumped it to 1.168.60 and, to keep `tsc` passing, also `@tanstack/react-router` to 1.170.41 and `@tanstack/router-plugin` to 1.168.42: the start bump had pulled a second copy of `@tanstack/router-core`, so the `server` route-option type augmentation landed on the wrong copy and every `src/routes/api/*` file failed to typecheck. PR #203 added the Instagram Reel upload script. The Supabase generated-types freshness check moved out of `lint-and-typecheck` into its own `types-fresh` job, which `deploy-supabase` does not depend on, so a PR that adds a table can no longer block the deploy that would make the check pass (BACKLOG §0.0h/§0.0i).

**SUBMITTED for App Review, 2026-09-30 ~1:20am EDT -- "Waiting for Review".** One submission: iOS App 1.0 (build 49) + Alphonso Pro Monthly + the Alphonso Pro subscription group (a first subscription must be submitted together with its group). Expedited Review requested for the Shipaton deadline. **Build 49 (PR #196)**: Add for Review demanded 13-inch iPad screenshots; unzipping build 48's `.ipa` showed `UIDeviceFamily [1, 2]` -- XcodeGen's target preset had overridden the project-level `TARGETED_DEVICE_FAMILY "1"` for every build so far. Set per target; `ios-release.yml` now fails any `.ipa` not exactly `[1]` (build 49 confirmed `[1]`). **PRs #194/#195**: `update-app-review-info.ts` proves the reviewer sign-in end to end before writing notes (passed live), and keeps the demo-password hint under Apple's 100-char cap. Reviewer uses a new dedicated account (the agent inbox) with seeded progress and lifetime Pro. `support@`/`privacy@`/`report@alphonsoecosystem.app` now forward via Forward Email DNS records (the domain previously had no MX, so they bounced) -- to the agent inbox until approval, then back to the owner's gmail (`docs/BACKLOG.md` §0.0-x).

**Last audit before App Store submission (2026-09-29) -> build 48 + metadata fixes (PR #193).** A cold-context, all-angles review against the App Review Guidelines found four likely rejections and several smaller risks. Code (build 48): access tokens now refresh proactively (`Session.refreshIfNeeded`, timer + every foreground) -- ~47 call sites used a token that expired an hour into a session, so account deletion, export, reporting and sync failed until relaunch; delete/export also retry once after a 401, and offline/rate-limited refreshes no longer sign anyone out. Teams gets Report/Block on member rows and "Report Team Name" on the public list (Guideline 1.2). The AI consent sheet names Deepgram and NVIDIA and offers "Not now" (5.1.2(i)). The paywall states the free trial and the price after it, for StoreKit-eligible users only (3.1.2). iPhone is portrait-only. Server: `/api/review-demo-code` gives App Review a fresh sign-in code for a dedicated review account (off unless its env key is set). Metadata: the description gains the Terms of Use / Privacy links and auto-renewal terms; the review notes drop the "can't load options is expected" excuse and explain how to reach the paywall.

**Android push fan-out landed on the backend (2026-09-30, additive, no-op until configured).** `device_tokens.platform` now accepts `'android'`, and `sendPushToUser` sends iOS rows to APNs and Android rows to Firebase Cloud Messaging through a new `_shared/fcm.ts` (service-account JWT signed with WebCrypto, HTTP v1 `messages:send`, dead tokens pruned only on FCM's `UNREGISTERED` code, every call bounded by a 10 s deadline). Nothing changes for iOS; the FCM path stays silent until the owner sets `FCM_SERVICE_ACCOUNT_JSON` and `FCM_PROJECT_ID`. The one backend change the Android app (branch `android`, Plan 4) needs from `main`.

**A real hands-on QA pass on build 46 found 2 more real bugs (fixed) and confirmed 2 real iOS-parity gaps deliberately deferred to a post-submission feature build, per the account owner's own call.** Fixed: (1) "Generate more practice" -- confirmed via real Vercel logs from the account owner's own attempts (`0 questions in 4172ms`, then a genuine 20s timeout on retry) that the `max_tokens: 800` cap from an earlier fix was likely truncating real completions; raised to 2048. (2) The review due-count badge showed 0 while the Review screen itself showed 11 due items -- the cache both read from was only ever populated by opening that screen once; now also refreshed during `RootView.triggerSync()`. Confirmed real but deferred: iOS never gates lesson starts on 0 hearts anywhere (web already does), and "buy a heart/streak freeze with XP" has zero UI on iOS (web already has one) -- both real screens to build, not one-line fixes. Also investigated and resolved as NOT bugs, with real evidence: hearts refill scheduling is genuinely correct server-side (the account owner's own exported data confirms `hearts_refill_at` was set correctly) -- iOS just has no live countdown UI; and a real GDPR data export was reviewed by hand and found clean (no leaked credentials, no cross-user data). Full writeup in `docs/BACKLOG.md` §0.0-v.

**Pre-submission readiness sweep found one real blocker.** Checked live, not trusted from prior session notes: the PREPARE_FOR_SUBMISSION version had `relationships.build.data: null` -- no build attached at all, despite builds 43-47 all showing `processingState: VALID`. Fixed with a new read-only-first `readiness` check plus an `attach-latest-build` SAVE-ONLY command (both extend `scripts/check-subscription-status.ts`); build 47 is now attached, confirmed via read-back. Everything else was already correct: listing localization, appInfo, App Review Information all set. Full writeup in `docs/BACKLOG.md` §0.0-w.

**Build 47** ships the two fixes from the account owner's first real hands-on QA pass on build 46 (generate-practice's `max_tokens`, the review due-count badge staleness) -- `CURRENT_PROJECT_VERSION` bumped 46 → 47, CI green, uploaded via `ios-release.yml` with `upload_to_testflight=true`, confirmed by `altool`'s own output ("UPLOAD SUCCEEDED with no errors"). Two real, confirmed iOS-parity gaps (the 0-hearts lesson gate, "buy heart/streak freeze with XP" UI) remain deliberately deferred to a feature build after submission. The hold-to-talk race fixes from build 46 are still unverified on a real device.

**Build 46** ships everything below (both audit rounds, 12 real findings total) -- `CURRENT_PROJECT_VERSION` bumped 45 → 46, CI green, uploaded via `ios-release.yml` with `upload_to_testflight=true`, confirmed by `altool`'s own output ("UPLOAD SUCCEEDED with no errors"). No real device was available to test either hold-to-talk race fix in this environment -- recommend a rapid-double-tap pass on all four recording screens once installable from TestFlight. Full writeup in `docs/BACKLOG.md` §0.0-u.

**A fresh-context pre-ship audit of everything above found 2 more real, high-severity bugs -- both fixed and deployed.** (1) Friend-invite codes contained URL-unsafe base64 characters (`/`, `+`) spliced unencoded into a URL path segment on both platforms -- roughly 22% of generated invite links would 404 instead of reaching the invite-accept screen, a bug nothing in the test suite could ever have caught since every fixture uses a hand-picked alphanumeric string. Fixed by switching to hex encoding, no client change needed. (2) The hold-to-talk fix above still left a second race in the same code: all four recording screens share one `recorder` instance across every press, and a rapid second press during the first press's own minimum-duration sleep could start a new recording on that shared instance -- the first press's delayed stop() then finalizes the SECOND press's recording early (mislabeled as the first turn) while the second press's own real release finds a cleared recorder and silently drops. Fixed with a per-screen generation counter so a stale delayed stop() can tell it's been superseded and no-ops instead. Full writeup in `docs/BACKLOG.md` §0.0-s.

**Four independent third-party audits after build 45 (ChatGPT 5.6 Astra, Fable 5, Codex #3, Codex #4) — 15+ findings triaged, 10 fixed and deployed to production.** Every finding re-verified against live code/DB before acting, per this session's standing discipline. Fixed: (1) an XP-mint exploit where `buy_heart_with_xp`/`buy_streak_freeze_with_xp` trusted a client-supplied `_cost` parameter -- dropped it, hardcoded the real costs server-side; (2) the UGC content filter's false-positive fix had itself introduced a regex bug rejecting real names (`Dickson`, `Draper`); (3) the demo account's real email and the owner's real phone number were hardcoded in a script committed to this PUBLIC repo -- self-caught, moved to repo secrets (the already-committed values remain in git history, a rotate/scrub decision left to the account owner); (4) web lesson-completion translate grading had no AI-quota gate at all, unlike every other AI-cost path in the app; (5) the AI-processing disclosure sheet only ever covered the four voice screens, never the written-translation grading paths (`LessonPlayerView`, `ReviewQueueView`) that also send learner text to NVIDIA; (6) a friend-forcing exploit -- `accept_friend_invite` took any uuid with zero consent verification, and uuids are already incidentally exposed via leaderboard/team/duel rows, so any authenticated user could force a friendship on anyone. Fixed by replacing the uuid-keyed invite with an opaque per-user code in its own table with no client-facing read policy at all, mirroring the existing team `join_code` pattern; (7) an iOS hold-to-talk race across all four recording screens -- a DragGesture's repeated `.onChanged` during a hold could call `startRecording()` more than once before the async permission callback resolved, and a tap shorter than that same hop could leave a recording with no way left to stop it; fixed with two new synchronous guard flags per screen; (8) a kicked team member could rejoin their old team instantly, since kicking only deleted the membership row that also held the only switch-lock information -- fixed by recording the kick separately and treating it like the existing switch-lock; (9) `/api/chat` accepted an arbitrary client-controlled system prompt with no server-side check, letting a caller who bypassed the app UI turn a quota-gated route into a general-purpose LLM proxy funded by the app's own NVIDIA key -- fixed by whitelisting against the real scenario/campaign personas; (10) none of the five batched gamification writes in lesson completion (web and iOS) ever checked their own `{ error }`, so a failed upsert silently reported success -- now throws on a partial failure instead. **Deliberately deferred, not attempted under deadline pressure**: fixing the underlying lack of atomicity across those same gamification writes needs a real SECURITY DEFINER RPC with row locking, a larger rewrite of the app's most central write path -- flagged as honest unstarted follow-up work rather than rushed. Full writeup in `docs/BACKLOG.md` §0.0-r.
**Native Android app started (2026-09-29, `android` branch, Plan 1 of 5).** Kotlin + Jetpack Compose against the same backend. Plan 1 ships the foundation and the learning loop: Google/email-code/password auth, Learn tab with status header and band picker, the lesson player with all six question types (speak via a typing fallback until the recorder lands), reinforcement questions, hearts and XP and streak, review queue with offline optimistic grading, adaptive placement, four themes with dark variants, settings with export and account deletion, Room offline queue and sync. `core` carries the logic ports with the same vectors as their TS test files (157 core and 22 app JVM tests green locally, debug APK builds); `android-ci.yml` runs them plus an API 34 emulator job. Spec: `docs/superpowers/specs/2026-09-29-android-app-design.md`.

**Android: a fresh-eyes review of the whole branch found and fixed three real defects (2026-09-30).** (1) Rotating the phone on a speak question, in Practice or in Hector killed the microphone for the rest of the screen, because the composable's dispose tore the shared turn engine down permanently while the view model that owns it survived the rotation; the engine now distinguishes a compose leave (cancel, stay usable) from the view model's clear (tear down), and weakness analysis moved to the clear. (2) A system pause (audio focus lost, headphones unplugged) left the podcast mini bar showing "playing", so the next tap paused an already-paused player; the player port now reports the player's own play state. (3) Any failed token refresh signed the learner out, including a plain network failure, so opening the app offline with an expired token logged people out, the exact bug Session.swift fixed on 2026-09-29 that this port had copied from before that fix; only a 400/401/403 from the token endpoint ends the session now. The automated reviewer's findings on the two backend PRs (#192: bounded FCM calls, prune only on `UNREGISTERED`; #198: least-privilege token, branch guard, a folded emulator command that never reached Gradle, screenshots pulled before a failing test propagates) were all valid and fixed before merging. Also on `main` now: `public/.well-known/assetlinks.json` for Android App Links and the release workflow registration.

**Android Plan 5 (release) landed on `android` (2026-09-30).** `android-release.yml` builds a signed bundle from secrets only, validates the produced `.aab` with bundletool rather than trusting the source, optionally uploads to a Play track, and captures the store screenshots on the emulator as the demo account; the Play listing copy, data-safety answers and review notes are adapted from the App Store material; `DEVICE-CHECKLIST.md` names what CI cannot prove and gates the first upload. Everything past the artifact waits on the owner's Play, RevenueCat and Firebase setup (`OWNER-SETUP.md`).

**Android Plan 4 (podcasts, notifications, push, widget) landed on `android` (2026-09-30).** The Listen tab with the folder tree, search, resume, transcripts, offline downloads behind a budget that refuses and names candidates rather than deleting, one ExoPlayer in a Media3 `MediaSessionService` with lock-screen controls and a next-episode control, and the mini bar on every screen; the four local reminders as unique WorkManager jobs with the iOS copy and times; FCM token registration gated on the notification permission (backend fan-out in PR #192); a Glance streak widget fed by the same progress funnel the iOS widget uses. Found while porting: the iOS podcast client's first position save omits `user_id` on a table whose column has no default, so it can only ever fail; the Android client sends it (the web upsert always did). Core 225 JVM tests.

**Android Plan 3 (audio, AI and Pro) landed on `android` the same day.** Hold-to-talk recording through a shared core state machine (one press at a time, minimum press and capture sizes, the per-screen generation guard iOS needed two audits to get right is a single engine here), spoken answers graded from `/api/stt`, Practice scenarios and Campaigns with TTS replies, Hector with the tutor memory priming turn sent once at the head of the history, the AI disclosure gate on every AI path including the written translation grading gap carried from Plan 2, generated practice on the finish screen with a real timeout, and the RevenueCat paywall behind a `BillingPort` so a build without a store key says so instead of crashing. RevenueCat 10.23.4 added.

**Android Plan 2 (social and gamification) landed on `android` the same day.** Profile hub with leaderboard (overtake toast, weekly recap), teams, season, friends over the new opaque invite codes with an App Link, nudges, activity feed, duels, achievements with the weakness trend, block and report on every row, display name and avatar editing, weekly challenges and streak-freeze purchase. Core 176 and app 50 JVM tests green; CI green including the API 34 emulator job for Plan 1.

**More real TestFlight feedback on build 44, fixed same-day, pending a fresh audit before shipping as build 45.** (1) "Generate more practice" erroring after ~30s -- real Vercel logs for the actual attempts show the route always returning 200, never throwing server-side; bounded the previously-unbounded `max_tokens`, added a real 20s fetch timeout, and log duration on every outcome so a recurrence gives an exact number instead of another guess. (2) Built "Continue to next lesson" -- `LessonPlayerView.lesson` is now `@State` rather than `let` so the same view instance can transform itself into the next lesson in place (within the unit, then the next unit at the same CEFR band) instead of needing a bindable `NavigationPath` threaded down just to push one stack entry per lesson. (3) A screenshotted bug: a lesson's primary button could land exactly where the podcast mini-bar sits -- `LessonPlayerView` is pushed via `NavigationStack` and doesn't inherit the tab root's safe-area reservation for the bar; applied it again directly to the pushed destination, fixing every lesson phase at once. (4) Confirmed Practice tab's "Hold to talk" label already shipped identically to Hector's in build 44 -- no code change needed, just re-verification. Full writeup in `docs/BACKLOG.md` §0.0-p.

**A third whole-codebase audit (cold context, scope expanded mid-run to the full codebase) found and fixed 5 more real issues, folded into build 45.** (1) HIGH: iOS never spent a heart on a wrong lesson answer, ever -- `recordAnswer()` only ever queued a reinforcement question, confirmed by grepping the entire app target for `loseHeart` (zero call sites outside its own definition/tests); `complete-lesson` only ever grants hearts, never deducts, so nothing else was covering for it. Fixed with the same fire-and-forget pattern web already uses, plus an optimistic local cache update. (2) HIGH: `getMyTeam()`/`getTeamMembers()` parsed real `timestamptz` fields with plain `ISO8601DateFormatter()`, which fails on PostgREST's actual fractional-second precision -- the exact bug `parsePostgresTimestamp` already exists to fix, just invisible across files since Swift's `private` is file-scoped. Likely made teams invisible to real users (`getMyTeam()` returning nil for someone who has one; `getTeamMembers()` silently dropping every row). Fixed, widened the helper's access, and updated the tests' fixtures to realistic timestamps that actually exercise the bug. (3) A stale doc comment in `PodcastMiniBar.swift`, already false when found. (4) A reinforcement-question id collision risk across lessons (ids are only unique within a lesson) that could leak reorder-question tap state across a main/reinforcement transition -- fixed by folding `isReinforcing` into the view's `.id()`. (5) A doc/code mismatch on `attemptSeed`'s reset. Full writeup in `docs/BACKLOG.md` §0.0-q.

**Also closed out both open items from build 44**: App Store listing screenshots were confirmed genuinely at zero via a direct API check (a real submission blocker) -- found and fixed two real bugs in the screenshot-capture CI pipeline by actually looking at the captured PNGs (`captureHector()` never dismissed the first-run AI-disclosure sheet, silently blocking every capture after it; `captureLessonPlayer()` hardcoded an A1-only lesson title invisible once the test correctly waits for the demo account's real B2 level), then wrote and fixed a real endpoint-path bug in the upload script -- all 7 screenshots now confirmed live (`assetDeliveryState: COMPLETE`).

**Build 45** ships all of the above -- TestFlight feedback fixes, all 5 audit fixes, and the screenshot pipeline. CI fully green (including new regression tests proving the timestamp fix) before triggering the upload.

**Real TestFlight feedback on build 43, investigated and fixed same-day, shipped as build 44.** Every item checked against real code and real production logs before touching anything: (1/2) Practice and Hector's "mic doesn't catch anything" reports were NOT a regression of build 41's gesture fix -- real `debugTiming` data showed presses consistently under 0.3s across ten attempts, and neither screen had ever shown any "hold to talk" text (unlike `SpeakQuestionCard`, which does) -- added it to both. (3) "Generate more practice" showing endless buffering -- the one real log for it shows the request actually succeeded server-side with no error, most likely just a slow LLM call with zero "this can take a moment" messaging -- added a 45s client-side timeout plus clearer loading text. (2/4) The Learn tab's lesson-completion dot never reflected real completion (`index == 0 ? ember : moss`, unconditionally) -- wired to a new `fetchCompletedLessonIds`, and the list now auto-scrolls to where the learner left off. (5) Removed a podcast episode published twice, once outside its correct folder -- a content mistake, not a code bug. (6) Teams had no way to actually share a join code (plain text only) -- added a native share sheet. (7) Teams had no owner authority at all, not even a visible member list -- added `get_team_members`/`kick_team_member` (owner-only) and `get_my_team` now reports `is_owner`. (8) Added a "Next episode" button to the podcast mini-bar -- no queue concept existed anywhere in the player before this.

**Build 44** ships all seven fixes above. CI fully green before triggering the TestFlight upload.

**A second, cold-context whole-codebase audit found four more real issues; all fixed, two shipped as build 43.** A fresh subagent this time given zero briefing on what the first audit (below) already found, to avoid anchoring on the same ground. Most notable: `HeartsEconomy.resolveHeartsRefill` (added 2026-09-18) had never been wired into any iOS path, so a user who ran out of hearts and waited out the 30-minute window saw "0 Hearts" indefinitely on reopening the app -- fixed by having `fetchProgress()` call the already-deployed `restore_hearts_if_due` RPC when a read-back refill time has elapsed, mirroring the web client exactly. Also fixed: all four recording screens could leak `RecordingState`'s counter if torn down mid-hold (SwiftUI doesn't guarantee a drag gesture's `.onEnded` fires on teardown), permanently suppressing the podcast player's post-interruption resume -- each screen's `onDisappear` now balances it (`SpeakQuestionCard` had no `onDisappear` at all). Two backend-only fixes, deployed via the normal CI pipeline: `normalize_for_moderation` deleted unmapped non-ASCII characters instead of folding them, letting a single Cyrillic/Greek homoglyph (e.g. Cyrillic "і" for Latin "i") slip a slur past the UGC filter -- fixed by extending the translit table with the standard Latin-lookalike set, not a blanket non-Latin-script ban that would also reject legitimate international names; and `respond_to_duel` never checked `blocked_users`, unlike `create_duel` and the queue-join path, so a blocked user could still accept a pending duel from someone who'd blocked them. Full writeup in `docs/BACKLOG.md` §0.0-n.

**Build 43** ships the two iOS-side fixes above (hearts-refill resolution, RecordingState leak). CI fully green before triggering the TestFlight upload.

**Build 42: ships the SRS lapse-interval fix (audit finding #3) to a real device.** The fix itself was committed and CI-verified as part of the whole-codebase audit above, but a Windows Application Control policy blocked local `swift test` for the whole task, so it had only ever run through CI, never on a real phone. Bumped `CURRENT_PROJECT_VERSION` 41 → 42 (app + widget in lockstep) and triggered the release pipeline. No other behavior change.

**The real cause of a signed archive's missing `aps-environment` entitlement, found after two wrong fixes.** `ios-release.yml`'s post-archive check kept failing "Signed app's aps-environment is 'MISSING'" across three separate real signed-archive runs. First fix (deprecated `codesign --entitlements :PATH` syntax, missing `--xml`) was real and necessary but didn't resolve it. Second fix (regenerating the Distribution provisioning profile) also looked necessary — the regeneration script's own diagnostic print seemed to confirm the new profile was missing the capability too, which turned out to be a bug in that print's own filter (`.includes("com.apple")` silently drops `aps-environment`, which has no such prefix; confirmed by decoding the profile's raw CMS payload directly with `openssl smime -verify -noverify`, which showed the capability was there all along — fixed the filter). A diagnostic step added straight to the workflow, comparing the archived `.app`'s own signature against its embedded provisioning profile before export ever runs, finally isolated it: the profile had the capability, the signed app did not. Root cause: `project.yml`'s `entitlements.properties` block — what XcodeGen uses to register a target's capabilities into the generated `.pbxproj`, consulted separately from and before whatever `CODE_SIGN_ENTITLEMENTS` override file is set — only listed App Groups and Sign in with Apple. Without a matching `aps-environment` entry there, `xcodebuild archive` doesn't know Push Notifications is a capability this target has, so it silently drops it from the real signed binary regardless of what the hand-written `.entitlements` files or the profile say. Unlike App Groups or Sign-in-with-Apple, which fail codesigning outright when missing, this fails silently — which is why it took three attempts. Fixed by adding the missing property; confirmed with a full real signed archive run that finally printed "All post-archive checks passed."

**Build 29 hung on launch on a real device -- watchdog-killed before the first frame ever rendered. Found and fixed.** Confirmed via the device's own crash log (`.ips`, pulled from Settings -> Privacy & Security -> Analytics Data, no Mac available): `EXC_CRASH`/`SIGKILL`, termination reason `0x8BADF00D` (FRONTBOARD watchdog), `WatchdogEvent: "scene-create"`, "exhausted real (wall clock) time allowance of 19.76 seconds" -- not a real crash, a hang the OS kills. Ruled out via source review before touching anything: the `test_` RevenueCat key crash (confirmed real production key), `AppDelegate` (no `didFinishLaunching` override exists), semaphore/blocking-wait patterns (none found), and `ContentStore`'s JSON decode. Predates this session's other fixes entirely -- happened identically on builds 27, 28 and 29.

Neither a console log (no Mac to read it) nor on-screen debug text (nothing ever renders long enough to show it) could localize this, so build 30 added `LaunchBreadcrumbs.swift`: a timestamped checkpoint written to a file in the app's Documents directory, `fsync`ed after every line, at every `@State` singleton's `init` and the top of `RootView.body` -- readable from the Files app regardless of whether the app ever successfully launches, since Files reads the directory from disk rather than through the running process. The resulting log was the answer on its own: 106,630 lines, the last ~100,000 of them the single line `RootView.body evaluating, isRestoring=true`, repeating in a tight loop for the full ~20s before the kill -- an infinite re-render, not a one-time slow step.

Root cause: `AlphonsoThemeManager.updateSystemColorScheme(_:)` unconditionally reassigned `systemColorScheme` on every call, with no equality guard -- unlike the very next method, `setTheme`, which already guards for exactly this reason (`guard id != themeID else { return }`). `@Observable`'s generated setter fires a change notification on *any* assignment, even to an identical value (unlike `@Published`, it doesn't gate on equality). `RootView.body` reads that same property (via `AlphonsoColor.surface` and `.preferredColorScheme`), so every redundant reassignment re-triggered a re-render, which re-fired `.onChange(of: systemColorScheme, initial: true)`, which reassigned again -- a tight synchronous loop with no fixed point, pinning the main thread and starving `session.restoreSession()`'s task of any chance to run (which is also why `isRestoring` never flipped to `false`). Fixed with a one-line equality guard, matching `setTheme`'s existing pattern. `LaunchBreadcrumbs.swift` and its call sites removed again in build 31, the fix.

**Builds 32-35: "Empty or missing audio" on Practice and Hector -- three real fixes that didn't touch the actual bug, then the one that did.** Testing the fixed build 31 immediately surfaced a new, unrelated issue: holding the mic button and releasing produced a raw server error (`api/stt.ts`'s own 400 when the uploaded file is under 512 bytes). Build 32 guaranteed a real minimum recording duration and, on a sweep, fixed two more copy-pasted instances of the same recorder pattern (`CampaignView`, `SpeakQuestionCard`). Build 33 fixed a real permission-request gap in three of the four screens. Build 34, a systematic sweep using the codebase knowledge graph rather than continued ad-hoc grep, fixed a `RecordingState` desync and an identically-shaped bug on the *reply* audio's `AVAudioPlayer.play()`. **All three rounds were real, correct fixes for real bugs -- and none of them could have ever fixed the reported symptom**, which is exactly why the identical error kept recurring after each one. The actual cause, found in build 35 after the error persisted on 34: `AIConversationClient.transcribe()` sent the recorded audio as a raw binary POST body, but `api/stt.ts` expects `multipart/form-data` with a field literally named `"file"` -- exactly what the web app's own caller already correctly sends. A raw-body POST isn't multipart, so the server found nothing and returned the error unconditionally, on literally every call, regardless of recording duration, permission, or audio content. Web was never affected. Rewrote the client to build the same multipart body the web client sends, and fixed the test that had been asserting the wrong wire format as correct (a fully mocked response that never exercised the server's real parsing). Also fixed, found while re-verifying the server's full logic: none of the four iOS callers ever sent the optional `course` field, so French/Spanish speaking questions were always transcribed with the English model -- wired through where a real course context exists (`SpeakQuestionCard`). Full writeup, including the earlier layers and the explicit self-correction of a wrong "checked, found clean" claim from build 34, in `docs/BACKLOG.md` §0.0-h.

**Build 37: the actual cause of build 35's follow-on symptom -- Hector working once, then going silent.** Build 35's fix confirmed the hard "Empty or missing audio" error was gone, but a live test found a new symptom: it took several tries for Hector's voice to come through, and even then the mic button sometimes just reset with no error. Added `console.error` logging to `api/stt.ts` and read real production logs via the Vercel MCP tools rather than guessing: `file.type` was always correct, but Deepgram's own reported audio duration was consistently ~0.5s regardless of the file being 60-61KB -- proof the file itself, not the wire format, was the problem this time. Root cause theory: `AVAudioRecorder.stop()`'s synchronous return doesn't guarantee the file is finalized on disk; reading it immediately after, as every recorder did, could catch it mid-finalization -- audio bytes flushed, but duration metadata still stale, so Deepgram only recognized a fraction of a second as real audio. Fixed by making `stop()` `async` in all four recorders and awaiting `AVAudioRecorderDelegate.audioRecorderDidFinishRecording` -- the actual "file is done" signal -- before reading the file. **Correction, confirmed live on a real build-37 device (superseded the "not yet confirmed" note this entry originally had): this did NOT fix it.** The identical failure signature recurred minutes after the build shipped. See `docs/BACKLOG.md` §0.0-j for the new evidence and the three other real bugs found investigating this (a session-refresh gap in Hector/Speak, a silent-failure UX regression, and STT quota exhaustion from the debugging itself).

**Build 38: the moov/mdat theory was also wrong -- the recording genuinely only captures ~0.5s of real audio.** `api/stt.ts` now walks the actual MPEG-4 box structure instead of a raw hex dump; the real output was `ftyp(28) moov(637) free(56671) mdat(3722)` -- `mdat`, the real audio, is only ~3.5-4KB, matching Deepgram's own reported duration exactly. No corruption, no mismatch: the file is short because the recording is short, matching the account owner's own description ("buffers for a couple seconds then goes back to mic, doesn't record anything practically"). ~0.5s lands suspiciously close to the client's own `minimumDuration` safety floor (0.4s), suggesting the recording is being stopped almost immediately after it starts. Two mechanisms could explain that and neither is distinguishable from server logs alone: the button gesture's `onEnded` firing almost immediately regardless of real hold time, or `record()` itself (an `AVAudioSession` category switch away from Hector's own just-finished TTS playback) taking nearly the full press just to actually start capturing. Rather than guess a third time, all four recorders now measure both spans independently (true press-to-release, and actual `record()`-to-`stop()` duration) and report them via a new `debugTiming` field on `AIConversationClient.transcribe`, logged server-side on the next empty-transcript case. Root cause still open, but the next real test should settle it with data instead of another guess.

**Build 39: build 38 hung on launch -- the SAME watchdog signature as build 29's, from a different cause.** Confirmed via two real device crash logs (`.ips`, pulled from Settings -> Privacy & Security -> Analytics Data): `EXC_CRASH`/`SIGKILL`, `0x8BADF00D` FRONTBOARD watchdog, `WatchdogEvent: "scene-create"`, ~20s over the allowance -- identical shape to build 29's hang. But `AlphonsoThemeManager.updateSystemColorScheme`'s equality guard (that fix) is confirmed still present and unchanged in the current code, and no theme-related file has changed since it shipped, ruling out a simple regression/revert. One of the two crash logs' stack trace is richer than build 29's: real CPU time (not just blocked wall-clock) spent in `EnvironmentValues._set`/Swift generic metadata instantiation, reached via `_UIHostingView.updateEnvironment()` and `_systemUserInterfaceStyle`/trait-collection resolution -- the same environment-propagation machinery the original bug looped through, now apparently triggered by something else. Rather than guess a fourth time on a launch-blocking crash, re-added `LaunchBreadcrumbs.swift` (the exact mechanism that found build 29's cause), reinstrumented the same five checkpoints (`App.init()`'s five `@State` singletons, `Session.init`, `PodcastAudioPlayer.init`, `RootView.body`), plus a new one around the `systemColorScheme` `onChange` handler specifically. TEMPORARY -- remove once this hang is found and fixed. Sentry is planned as the durable answer to needing crash diagnosis at all; not yet added; needs a DSN from the account owner.

**Build 40: the real cause, found in the breadcrumb log.** The account owner reproduced the hang; `launch-breadcrumbs.log` (132,547 lines) showed it in the first dozen lines -- `systemColorScheme` alternating `dark`/`light` on literally every single render, from the very first frame, at sub-millisecond intervals. Root cause: `RootView`'s `@Environment(\.colorScheme)` read, combined with `.preferredColorScheme(...)` applied to that same view's content, formed a feedback loop -- `.preferredColorScheme` can write back into the hosting window's own trait collection, which the environment then re-reports as a "new" system change on the very next render, forever. (Checked and ruled out first: every theme's palette data is internally self-consistent -- this was never a data-tagging bug.) Fixed by replacing the reactive environment read with an imperative read of `UIScreen.main.traitCollection.userInterfaceStyle` at two controlled points (launch, and returning to foreground) -- `UIScreen` is never affected by this app's own `.preferredColorScheme` override, so there's no reactive binding left to feed back into. Trade-off: a Dark Mode toggle via Control Center while the app is already open won't be picked up live anymore, only on next foreground -- accepted, given the alternative was the app not launching at all. **Confirmed fixed 2026-09-29** -- the account owner updated and reported no more crashes. `LaunchBreadcrumbs.swift` and the two temporary `Info.plist` keys it needed removed again in build 41.

**The audio saga's real root cause, found via live user feedback and real timing data, not another guess.** Reports made it unmistakable: a full sentence in, one word out; "can you help me prepare for a job interview" heard as "could you"; "yes yes" transcribed as "Sorry." Pulled the `debugTiming` field (build 38) from real Vercel logs across ~15 attempts: real press-to-release duration was almost always under 0.3s (as low as 0.05s) while captured audio duration sat right at the 0.4s safety floor regardless -- the floor was the *only* reason any audio ever existed. Root cause: the mic button was one `Circle` whose own fill color changed with `isRecording`, with the drag gesture attached directly to that same view -- a view mutating its own appearance in response to state a gesture attached to it just set can reset the in-flight gesture recognizer, firing a false release almost instantly no matter how long the button was actually held. Fixed across all four recording screens by moving the gesture to a stable outer container whose appearance never changes, with the color-changing circle now purely visual and nested inside. Shipped in build 41, bundled with the confirmed launch-hang fix above. Not yet confirmed working on a real device. Full writeup in `docs/BACKLOG.md` §0.0-h.

**A third-party (Codex) audit correctly flagged a real, currently-live production regression: `create_team` was broken again.** `20260930030000_ugc_content_filter.sql` re-published `create_team` (to add a blocked-content check) by copying its body from before an earlier migration schema-qualified its one `gen_random_bytes(6)` call -- silently reintroducing the exact "function gen_random_bytes(integer) does not exist" bug that migration fixed, since the UGC migration sorts after it. Verified live before fixing anything: queried the deployed function's source directly and confirmed the unqualified call was live in production, `auto_join_team` (the sibling function) was unaffected. Fixed via a new migration re-qualifying the one call site; applied directly to the live DB and verified working. Full writeup in `docs/BACKLOG.md` §0.0-l.

**A fresh-context whole-codebase audit ("in case we forgot something"), five confirmed findings, all fixed.** Given full history of everything already audited/fixed this session so it wouldn't waste time re-finding it. Most severe: the 2026-09-22 SRS lapse-interval fix (`src/lib/srs.ts`) was never ported to the Deno `grade-review` function -- iOS's *sole* authoritative grader -- or the Swift `SRSEngine` port, so every iOS lapse on a well-established item was silently getting the disowned, more punishing fixed-step behavior for a week; both ports' own "parity guard" tests never actually diffed against the TS source of truth, so they stayed green through the whole divergence. Also fixed: unbounded NVIDIA cost exposure on translate AI grading (no quota enforcement at all on either the web or Deno grading paths -- the one AI-cost path in the app missing it); `/api/grade-translation` returning real verdicts with no auth check on two early-return paths; a real push-notification harassment vector (`nudges_push_after_insert` fires a real APNs push on every insert with no server-side rate limit, so any accepted friend could bypass the client's cooldown button and spam a real person's lock screen indefinitely); and the same silent-revert pattern as the `create_team` bug above, this time in `get_leaderboard`. All five independently re-verified against the live code/DB before fixing. Full writeup in `docs/BACKLOG.md` §0.0-m.

**Apple revocation: closed the observability and manual-fallback gaps a second-opinion audit correctly flagged.** The revocation pipeline itself was already real and working end-to-end (verified by tracing the whole chain), but had no way to notice a silent failure and no fallback for the user when automatic revocation can't be guaranteed. Verified one claim directly against the live deployment rather than trusting the audit: probed `/api/apple-link` with a bogus-but-present Bearer token and got `{"linked":false,"reason":"unauthorized"}`, not `"not-configured"` -- proof all four Apple secrets are genuinely live in production. Added server-side `console.error` on every failure branch in `apple-link.ts` (checkable from Vercel's dashboard, no Mac needed) and a matching client-side log for the one failure mode server logging can't see. Added Apple's own recommended manual-revocation fallback to `privacy.tsx` and a pointer to it in the iOS delete-account alert. Deliberately did not build a durable retry queue -- already explicitly scoped out as the wrong architecture for a synchronous inline deletion request.

**Two independent second-opinion audits (Kimi, Genspark), verified against the live repo and API before fixing anything.** Kimi's claim that Apple grant revocation "doesn't exist yet" was false — the pipeline is fully wired end-to-end — but the code that made it look true was real: three stale doc comments (`Session.swift`, `SettingsView.swift`, `AppleSignInPresenter.swift`) describing a design that predated the actual implementation, plus a dead `appleAuthorizationCodeForRevocation` stored property nothing ever reads. Removed the dead property, corrected the comments. Genspark correctly flagged `PodcastDownloadManager.swift`'s `attributesOfItem(atPath:)` call as an undeclared Required Reason API — added `NSPrivacyAccessedAPICategoryFileTimestamp` (reason `3B52.1`) to `PrivacyInfo.xcprivacy`. Also fixed a stale `project.yml` comment (Genspark quoted it directly) still calling the bundle identifier "a placeholder pending a real decision" years after it was registered and baked into App Store Connect, RevenueCat, entitlements and every provisioning profile — comment only, value untouched. Both audits' remaining claims either didn't hold up against the live repo (an "empty RevenueCat key is silently accepted" guard that was already hardened in an earlier commit; a claimed "search history" data-type gap with no corresponding code) or are real but outside code's reach: a live, read-only App Store Connect API check confirms the "Alphonso Pro Monthly" subscription is still `MISSING_METADATA` (no localization/price/review screenshot) and the app version is still `PREPARE_FOR_SUBMISSION` — neither fixable except by the account owner, in App Store Connect.

**A third-opinion (ChatGPT) audit, verified and fixed — 8 findings.**
Confirmed zero pre-publication content filtering existed anywhere for
public display names/team names (Guideline 1.2 needs it on top of the
report/block this project already ships) — added a Postgres trigger on
`profiles.display_name` (the one write path with no server function to
validate in) plus an inline check in `create_team`, sharing one
blocklist. Confirmed Apple-grant revocation failures were silent
end-to-end — `revokeAppleGrantForUser` now returns a 3-state result
instead of a boolean, logged on failure, decoded by the iOS client too.
Completed the privacy manifest fix from the last audit round — it only
had the required-reason API section filled in, `NSPrivacyCollectedDataTypes`
was still empty. Hardened `ios-release.yml`: rejects a misconfigured
`test_` RevenueCat key before archiving and re-checks the actual
exported `.ipa` after, asserts the resolved Xcode version meets
Apple's current 26+ floor, and inspects the unzipped `.ipa` for the
embedded widget/privacy manifest/entitlements instead of trusting
source-level checks alone. Added a persistent Privacy/Terms link to
Settings (previously only on the paywall and AI-disclosure sheet) and
a native "Manage Subscription" button next to Restore Purchases.

**Documentation accuracy pass.** ARCHITECTURE.md and AGENTS.md still
described Hector as running on AlphonsoCompanion's separate "Cloud
Voice" backend with its own Supabase project and sign-in — true before
the 2026-09-27 decouple, false since, and two of the files it named
(`HectorSession.swift`, `DeviceEnrollmentClient.swift`) no longer exist.
Both docs also still said RevenueCat had "no real Offering/Package
yet," which has been confirmed live and working for days. Corrected
both, plus the same claim in README.md, plus a stale `appleRevoked`
field-name reference superseded by the audit above.

**A second-opinion (ChatGPT) audit, verified and fixed.** The App
Group entitlement the widget needs was missing from both Debug and
Release's hand-written entitlements — confirmed missing, fixed, and
proven with a real signed archive run rather than just a code read.
`support.tsx` still said Hector needed a separate, manual-email
deletion, directly contradicting `privacy.tsx`'s already-correct
"deletes with the account" — fixed, with a regression test added since
none existed. The paywall had no Terms of Use / Privacy Policy links
(Guideline 3.1.2 requires them directly on the subscription screen);
added. The delete-account confirmation now says deleting the account
does not cancel an active Apple-billed subscription. Separately, a live
App Store Connect check found the subscription sitting at
`MISSING_METADATA` because its review screenshot is genuinely absent —
left as a deliberate, documented gap, since a real non-error paywall
screenshot can't exist until the app is actually submitted for review.

**Admin: a "New episode" upload form.** Until now, publishing a brand
new podcast episode's first MP3 had no UI at all — only
`scripts/podcast-tool.ts add` could do it. Added
`adminCreateEpisodeUploadUrl`/`adminCreateEpisode`, reusing the CLI's
own `validateEpisodeDraft`/`storagePathFor` so the two paths can't
disagree about what's valid or where the audio lands, plus a new
`slugPathFor` helper (folder id → root-to-leaf slug path). Because
`podcast_episodes.duration_seconds` is `NOT NULL CHECK (> 0)`, the
audio has to be uploaded and verified *before* the row can be
inserted — there's no "create a draft row, fill in the file later"
order available the way replacing an existing episode's audio has.

**Practice and Hector both showed a misleading generic error.**
`ConversationView`/`HectorView`'s catch blocks unconditionally said
"Something went wrong. Try again." even when the server had sent back
something specific and useful — most importantly
`ai-quota.server.ts`'s real "Daily CHAT limit reached (60/day). Try
again tomorrow." A learner who'd simply used up today's AI quota saw
the exact same message as an actual crash. Both screens now surface
the server's own message when it sent one.

**App Store submission-readiness fixes**, from a 2026-09-28 audit: added
the `PrivacyInfo.xcprivacy` privacy manifest to both the app and widget
targets (missing entirely; Apple's mandatory since May 2024 for the
`NSUserDefaults` required-reason API this app uses) — verified green in
CI before landing. Removed stale "Link Hector Account" text from the
delete-account alert (dead since the Hector decouple, #189). Confirmed
live, not just in code, that Sign in with Apple's App ID capability
(`APPLE_ID_AUTH`) is actually enabled, and that all 4 Apple ID
revocation secrets are set in Vercel production — both had been sitting
as "not yet confirmed" for a while. Applied docs/BACKLOG.md sec 0.0y's
age-rating fix (`userGeneratedContent`/`messagingAndChat`/`socialMedia`/
`contests`, with the account owner's go-ahead) — confirmed live, though
the *displayed* `appStoreAgeRating` tier still shows 4+ and is expected
to only recompute at actual App Store submission time, not on every API
write (a real, if under-documented, quirk of Apple's API). The actual
App Store submission itself is still a deliberate, separate decision,
not yet made.

**Three small fixes** (#191): `complete-lesson` and `start-lesson-session`
were both missing `"es"` from their course schema, predating Spanish's
launch — the latter is the more serious half, since it issues the token
`complete-lesson` verifies, so a Spanish-course iOS lesson could never
even start a completion attempt. The GDPR export's `user_progress`
selection was widened past just `xp`: `cefr_level`, `league_tier` and
all three `placement_*` columns are also duplicated on
`language_progress` and frozen since the multi-course migration, so a
downloaded "your data" file was showing disagreeing values with no way
to tell which was real — now excludes all five. `podcast_playback` had
an RLS policy already permitting a user to delete their own listening
history, but the `GRANT` alongside it never listed `DELETE`; one-line
fix. Found but left alone: `mergeGuestProgress` writes into the same
frozen `user_progress.xp` column and has no course parameter at all —
a real latent bug, but dead code with no caller anywhere in the app.

**`complete-lesson` now re-grades every answer server-side** (closes
docs/BACKLOG.md §0.1-d #6, found by the 2026-09-26 red-team pass).
Previously the trust boundary only checked that a client-claimed
`missedQuestionIds` list named real questions in the lesson — it never
verified any answer was actually graded, so a forged client could report
a perfect score regardless of what it submitted. The request contract
changed on both platforms: the client now sends `answers: { questionId,
answer }[]`, one raw submission per real question, and the server
derives correctness itself against the real answer key (reusing
`grade-review`'s existing per-question grading, now shared via
`supabase/functions/_shared/`). Touches web (`sync.functions.ts`,
`lesson.$id.tsx`), the `complete-lesson` Edge Function, and iOS
(`ProgressSyncClient.swift`, `LessonPlayerView.swift`, the offline sync
queue). Full web suite green (153 files / 1,369 tests) and the Kit
verified locally (`swift test`, 410/410) — the iOS app-target half is
CI-only (SwiftData/SwiftUI need macOS). Also closed in the same pass:
the homepage's stale English-only copy (§0.1d), a podcast grants
cleanup migration, and `podcast-tool.ts` rejecting non-MP3 uploads by
magic bytes instead of silently mislabeling them.

**Hector decoupled from Alphonso Companion** (#189). The Pro AI tutor
moved off the separate Cloud Voice backend and account onto our own
backend and the main Supabase account: a new `/api/hector-respond` route
(NVIDIA reply + Deepgram audio, stateless, Pro-gated and fail-closed),
the iOS client repointed to it, and the whole cross-project bridge
deleted — the `hector_links` table, the link/shadow/revocation routes,
and the separate Hector sign-in UI. Net roughly -900 lines. This closes
the audits' one real P0: deleting an account now removes all Hector data
by construction, because there is no separate account and nothing is
persisted, and the privacy policy drops its "separate system" caveat.
Also: leaked-password protection (HaveIBeenPwned) was enabled for the
password-based web sign-in.

**Submission-readiness pass** (build 24, build 25, #183 and the
supporting CI). Two things only a person opening the app could catch,
both found by the account owner on a real device and neither visible to
any audit, test or CI job: three "distinct" screenshots that were the
same screen with a different clock (the capture pipeline was leaving a
sheet open and re-photographing it -- fixed so navigation is verified,
not assumed), and the Hector paywall rendering a raw RevenueCat SDK
error to users (#183 -- debug instrumentation from 2026-09-23 whose own
comment said to remove it once diagnosed; it was). Also: the screenshot
pipeline's demo-account email moved off a public workflow input onto a
secret, the seed marks placement as taken so a seeded account is a
coherent established learner rather than one dropped onto the placement
gate, a read-only check confirms RevenueCat's current offering contains
the exact product id the App Store subscription must match, and
`/accessibility` and `/support` pages were added for the App Store
Connect URLs they require.

**Accessibility, from nothing to four features** (#179, #180, #181,
#182). App Store Connect's Accessibility section had to be answered
**No** on every count: text locked at fixed sizes across 219 call sites,
VoiceOver labelling in 6 of 49 files, no reduced-motion handling, and a
dark theme that `RootView` overrode with `.preferredColorScheme` so the
system setting did nothing. Dynamic Type now scales at the single
`AlphonsoFont` chokepoint, every theme has a computed dark variant and
follows the system, correct/incorrect state is announced to VoiceOver
(it was previously never exposed at all), and every animation site
honours Reduce Motion. Still unverified by use -- nothing in the build
environment runs a simulator -- so the App Store answers stay No until
someone completes a lesson with VoiceOver on at the largest text size.

**Let people rename themselves and create a team** (#178). Leaderboards
published whatever Google supplied, usually a real name, with no way to
change it on iOS. Teams could be joined and never created. Both closed
-- and building the second surfaced a latent hole: `create_team` is the
first path that can produce a _private_ team, and `teams`' blanket
`SELECT USING (true)` would have let any authenticated user read its
`join_code`. Fixed with column-level grants, since RLS is row-level.

**The iOS app caught up with the web app** (#169, #172/#175, #174).
The Learn tab had lost its CEFR bands and was one endless scroll; the
placement exam existed only on the web, so a new iOS user was assigned a
default level and never asked. Both closed, the placement port verified
against `scorePlacement`'s actual rules rather than self-consistency --
pass at two of three, break at the first failure, place into the band
after the last passed, cap at C1. `/support` was a 404 while every other
legal page resolved, and App Store Connect requires it.

**Screenshot automation, and a test hook that ran nowhere** (#171). The
UI-test pipeline drove a signed-out app for several runs: the CI step's
shell environment never reached the simulator-hosted xctest process, so
the bootstrap never fired and the screenshots went to the simulator's
own sandbox. Fixed with a scheme-level Test-action variable. The hook
itself is `#if DEBUG` and cannot ship in Release.

**A PR with no CI at all** (#172 -> #175). GitHub silently withheld every
Actions run because the stale branch appeared to modify
`.github/workflows/`. No red X, no queued job -- just absence, which
reads as "unchecked" rather than "unverified". Two compile errors rode
in behind it. Worth knowing as a failure mode: with no branch
protection, a PR that has never run is indistinguishable at a glance
from one that passed.

**Hector re-parenting, and the defect the fix introduced** (#157, #159,
#160, #163). Phase 0 linked each account to its separate Cloud Voice
account so deletion can revoke it; Phase 1 added a server-side Pro gate
that fails closed on every "we could not tell". Phase 0 also shipped an
endpoint that accepted a Cloud Voice user id as a client-supplied claim
— anyone who knew a victim's id could plant it and later revoke their
Hector. #163 made the server derive that id from a verified token
instead, mirroring `/api/apple-link`. Phase 2 remains open.

**The Practice tab was broken by a stale base URL, not a stale token**
(#170). `AppConfig.apiBaseURL` still pointed at the old Vercel alias,
which now 308-redirects cross-origin — and URLSession drops
`Authorization` across an origin change, so every authenticated call
arrived anonymous. Session token refresh (#168) landed alongside it and
is a real fix for a real bug; it just wasn't this one.

**Signup email was broken in two ways only an inbox could see** (2026-09-26).
`site_url` was still `http://localhost:3000`, so every signup mail's
fallback link was dead, and the code was eight digits while the app asked
for six. Found by receiving the mail, not by reading the code; fixed and
re-verified the same way.

**CI guards that could not fail** (#161, #162). A sweep found that
`deploy-supabase` didn't depend on the only job validating the Edge
Function code it deploys, and that `main` has no branch protection at all
— every check in this repo is advisory. The GDPR export also silently
omitted the account's own email address.

**App Store compliance: the blockers an external audit found, closed in a
day** (#144–#151). An audit of the public repo flagged ten P0s. Every
claim in it was verified against the code before acting — all held, and
the Hector finding was worse than described.

**Sign in with Apple** (#146), mandatory under Guideline 4.8 once an app
offers Google. Built as a sibling to the Google presenter rather than a
shared abstraction, since Apple's is a native controller and Google's is
a web session. The nonce is the detail that matters: SHA-256 hash to
Apple, **raw** string to GoTrue — reversed, it still authenticates and is
a replay hole. The entitlement went to **three** files, because
`project.yml`'s generated one is not what either build config signs
with; adding it only to the obvious place compiles and fails at runtime.

**Apple token revocation** (#149). Apple requires revoking the grant on
account deletion. Server-side, because the `client_secret` is an ES256
JWT signed with the team's `.p8` and that key cannot ship in a binary.
We store the **refresh token**, not the authorization code, which is
single-use and does not survive app relaunch. **Deletion never fails on
it** — a user's right to delete their account cannot depend on Apple
being reachable.

**Native account deletion and data export** (#147), calling the _same_
server functions the web uses rather than a second implementation.
Apple requires deletion to be initiated in the app; linking out to a web
profile is what gets rejected.

**AI data disclosure** (#144), gating all four AI entry points through
one shared modifier — not four copies, because four copies is how one
gets missed and the missed one ships.

**Block and report** (#150). Apple's UGC rules require both once an app
carries social features. **The table was the easy half:** a block is
enforced at seven paths — friends, activity, leaderboards, duel
matchmaking, duel creation, invites and nudges — because a block that
stores a row and still shows the user on a leaderboard is a guard that
cannot act.

**Paywall pricing** (#148). A hard-coded "$9.99/month" sat next to a
button rendering `localizedPriceString`, so every non-US storefront
disagreed with itself. StoreKit is now the only source of price and
period.

**Legal pages** (#145, #151). Contact addresses were still
`privacy@lingua.app` — pre-rebrand leftovers on pages the product is
legally held to — **and a test was pinning the wrong one**, so the guard
protected the stale branding. The privacy policy now discloses that
**Hector is a second account in a separate Supabase project that
deleting the main account does not remove**, and names Deepgram and
NVIDIA as processors. Four new assertions guard all of it.

**Also fixed: new-user signup was broken.** The app asked for a 6-digit
code Supabase never sends to a first-time address — it sends the
Confirm-signup template, which shipped without `{{ .Token }}`. A 2026-09-21
fix had patched only the magic-link template and was "confirmed working"
by a test run from an account that already existed. Both templates now
render from one shared constant. Found on a clean simulator by signing
up as a genuinely new user — the one thing nobody with the app already
installed can do.

**Podcast admin subsystem, and offline download** (#140, which carried
#136). A second TanStack Start build from the same repo —
`vite.admin.config.ts` sets `srcDirectory: "admin"` — so no admin route
can reach the learner bundle, checked in both directions by a test,
because losing that override silently turns the admin app into a copy of
the learner app and is invisible in review. **Code-complete and
deliberately undeployed**: it needs a second Vercel project and a
hand-inserted first admin row, and episode uploads continue through
`scripts/podcast-tool.ts` until then.

Authorization is `admin_users` — **RLS enabled with zero policies** plus
`REVOKE ALL FROM anon, authenticated`, so only `service_role` can read
it. The first row is inserted by hand because every self-bootstrapping
admin mechanism is an authentication bypass waiting for a
misconfiguration. `requireAdmin` throws a message **identical** to an
ordinary auth failure; the achievable property is "a non-admin cannot be
distinguished from a bad token", not "reveals nothing", since endpoint
existence still leaks through HTTP status.

Review caught a Critical before it shipped. **"Replace audio" signed an
upload URL at the live object** with upsert, so the browser overwrote
published audio _before_ the server sniffed it — and on a sniff failure
the server then deleted it. One mislabelled file would have 404'd every
learner on a published episode, with no bucket versioning and no backup,
leaving the row `published=true` pointing at nothing. Fixed with a
staging key promoted only on success, holding the same invariant the iOS
cache already does: **a file at the final path always means a finished,
verified object.**

It also corrected a claim rather than defending it: the `admin_users`
RLS test was documented as running in CI and **ran nowhere**, because
`bun run test` executes in a job that sets no Supabase env. It now runs
in `deploy-supabase` with `ADMIN_RLS_TEST_REQUIRED=1` so it fails rather
than skips — post-merge on main, not on the PR.

**Spanish reaches question-type parity** (#134, #137, #138, #139),
closing the audit's step 7 and making it the first time all three
courses have carried the same set. Spanish gains `translate`,
`listening` and `speak` — 375 questions, 15 packs — taking it to **583
lessons / 2,915 questions**. `speak` is backed by `spoken-answer-es.ts`
across TypeScript, Deno and Swift with mirrored, mutation-tested
vectors and a CI step, and wiring `es` through every grading call site
exposed a real gap: `grade-review/index.ts`'s schema did not permit
`"es"` at all. Every speak line was round-tripped through the real
normaliser before shipping.

Spanish needed no generator change — `bank-engine.ts` had learned all
five pack kinds during French's phase 2, which was the point of putting
that work in the shared engine rather than a French-only file, and PR 1
verified it against real Spanish content rather than inferring it from
French's passing tests.

The three content PRs all appended to the same five arrays, and
reconciling them is where the interesting failure lived: two locations
had **independently made the identical edit by the same delta from the
same base**, so git saw "same change on both sides" and kept one `+5`
instead of summing. No conflict marker, clean type-check, wrong answer.
Caught by recomputing every count from the merged content rather than
trusting the arithmetic. Resolving those conflicts as text also
destroyed content twice in review — once eating an object boundary so
125 questions vanished while the file still type-checked, once
mojibaking every accented character — so the merges were rebuilt
structurally and verified on four independent axes.

**Spanish content audit — 57 duplicate prompts to 0, and the 95% nobody
had measured** (#122, #127, #130, #132). Spanish had no
`.audit-baseline/spanish-ids.json` at all, so an inserted line would have
silently repointed real learners' review items with nothing to catch it;
that baseline exists now. Of the 57 cross-pack duplicates the newly-gated
check surfaced, **40 were true repeats** and **17 were contradictory** —
the same prompt with different correct answers, which marks a correct
learner wrong: `"nurse"` accepted `enfermero` in one pack and `enfermera`
in another, and `yo ___ (hacer) mi tarea.` wanted `hago` in one and
`he hecho` in another with no tense cue in the prompt to choose between
them. All fixed by 1:1 in-place replacement, so no question id moved.

Two decisions were recorded rather than left implicit. **Variety: Latin
American** — measured, not preferred: `vosotros` and `vos` each appear
**zero** times across the existing 2,540 questions, so anything else
would have introduced the first Spain/Latin-America split into shipped
content. **Short packs: accepted and documented, not filled** — 83 of 130
packs carry fewer than 25 lines, and filling them means authoring ~710
unreviewed lines under audit cover.

And a measurement worth more than a fix: **95.0% of resolvable distractors
in Spanish verb-conjugation drills come from a different verb** (1,611 of
1,695), so `Yo ___ (hablar) español.` is answerable by matching the stem
rather than knowing the conjugation. **This is not a ranking defect** — a
conjugation pack holds one form each of several different verbs, so the
pool contains almost no same-verb alternatives to rank, and porting
`orderDistractorCandidates` would look like a fix and change nothing.
Closing it is structural, and separately scoped.

**Podcast library gets transcripts, search, and three guards** (#114,
#118, #119, #120, #123, #125, #126, #129). Episode 1 ("Ordering Coffee",
English A1, 2:52) is published — the first real audio behind the Listen
tab. **Phase 2a adds transcripts on web and iOS**, an accessibility
obligation rather than a feature: the players carry no captions, so
without text on screen an episode is unavailable to deaf and
hard-of-hearing learners. `--transcript` **rejects markup**, because a
TTS script is not a transcript — episode 1's script carries ElevenLabs
SSML that would otherwise have rendered to exactly those readers. Flat
search escapes both LIKE wildcards and PostgREST `or=()` syntax, each
mutation-tested separately, since both return plausible results for the
wrong query. `podcast-tool` stopped silently dry-running on a mistyped
`--confirm`; `validate` exits non-zero when it reports problems instead
of printing `[ERROR]` lines and returning 0; `music-metadata` is imported
lazily so commands that never read audio no longer die at import; and the
iOS mini bar docks inside each tab rather than on the `TabView`, which
had left it overlapping the tab bar on device.

**The admin app is live** at `admin.alphonsoecosystem.app`, on its own
Vercel project built with `bun run build:admin`. Vercel Auth stays at
`all_except_custom_domains`, which means the `*.vercel.app` URLs answer
with an SSO redirect before the app loads and only the custom domain
reaches it -- so the custom domain is the only place a "non-admin is
refused" check exercises the allowlist rather than Vercel. The
service-role and publishable keys are scoped to production only, so
previews build but cannot reach Supabase; a preview URL of a
service-role-holding app is a liability rather than a convenience.

**Four follow-ups from the branch review.** No admin write reports a
success it did not have: a PostgREST update or delete against a vanished
id succeeds with zero rows touched, and every mutation returned
`{ ok: true }` for it, so deleting an already-deleted folder was reported
as done -- this repo's recurring defect in its plainest form. The folder
move refusal now **names the cycle** (`findCycle` always returned the
path and the caller discarded it), and a **parent picker** finally makes
that move reachable: it was gated, counted and tested but callable from
nowhere, so the cycle guard protected nothing a person could do. Two CI
comments were corrected rather than left to mislead -- `admin-build`
catches a _missing_ route tree, not a stale one, and the allowlist RLS
check runs in `deploy-supabase`, which is `push && ref == main`, so it
fires **post-merge, not on the PR**: a regression alarm, not a merge gate.

**A podcast admin app, separately deployed** (Phase 4). The account
owner can now manage the library from a browser instead of a terminal:
folders, episode metadata, audio upload, publish/unlist and transcripts.
It is a **second TanStack Start build from the same repo** pointed at
`admin/routes`, so no admin code reaches the learner bundle, and a test
checks that in both directions.

Access is an allowlist table with **RLS enabled and zero policies**, plus
a revoked grant, so only the service role can read it — an allowlist the
guarded app can read is one an attacker can enumerate. The first admin is
inserted by hand; there is deliberately no bootstrap endpoint. Every
admin server function lives in one file so a single test can enumerate
them and fail if any lacks the gate, and that test reads the source,
because TanStack does not expose its middleware chain at runtime.

Audio uploads go straight to Storage through a signed URL — a serverless
body is capped near 4.5 MB and base64 inflates by a third, so an ordinary
3 MB episode would have failed at the platform — and the server then
verifies the stored object by **signature rather than extension**,
deleting it when it is not audio. Validation reuses the CLI's tested
functions throughout, so the two publishing paths cannot drift.

Two defects found by mutation rather than by reading: a sniff test that
passed with its guard removed (`bytes(0xff)` returns null either way),
and the plan's assumption that `normalizeTranscript` returns null for
markup when it actually throws — a handler built on that would have saved
an empty transcript and reported success.

**Offline download for podcasts on iOS** (#133, #136). Listening happens
on trains and planes, which is where the Listen tab previously stopped
working. Downloaded episodes live in **Application Support** rather than
Caches (the system purges Caches; a deliberate download should not
evaporate) and are excluded from iCloud backup. Staging name → byte-count
verification → atomic move → _then_ the database row, so a file at the
final path always means a finished download; launch reconciles both
directions, since being killed mid-transfer is ordinary on iOS.

**Nothing is ever deleted automatically** — exceeding the budget names
what could be removed and waits. The first design evicted automatically
while exempting explicit downloads, and with automatic downloading out of
scope every download is explicit, so that policy could never have run.
The budget is injectable at every level for the same reason the old one
was unreachable: at the 500 MB default, a library this small can never
reach the refusal path, and a guard that cannot execute is the defect,
not the test. Republish detection rides on Supabase's `ETag`, probed and
confirmed to be the **MD5 of the object's content** and stable through
Cloudflare — so it needed no migration. Offline browsing is flat and
title-ordered rather than the folder tree, and "offline with nothing
downloaded" is its own state.

Every rule lives in the Kit and none in the app target, because
`ios-swift-tests` covers the Kit and nothing covers the app target;
`ios-app-build` compiles it and runs nothing. **The app-target half is
compile-checked only** and carries seven device checks in #136, plus two
still outstanding from earlier phases.

**`maxWorkers` pinned in `vitest.config.ts`** (#116). A starved run had
been printing `124 passed (124)` beside `Errors 6 errors` — six files
that never executed, next to a line that reads as success. Three sessions
lost time to it in a single day. Suite is now **137 files / 1,189 tests**.
The pin fixed CPU contention and cannot fix memory: a starved run on this
machine can still fake a _named_ test failure.

**French reaches question-type parity with English** (#115). `speak`
joins `listening` and `translate`, backed by `spoken-answer-fr.ts` ported
across TypeScript, Deno and Swift with mirrored vectors and a CI step, and
5 packs authored against the real normaliser. French: 115 packs, 575
lessons, 2,875 questions, six question types. The generator work landed in
`bank-engine.ts` rather than a French-only file, so **Spanish inherits all
five pack kinds for free**.

**Placement exam stops reusing lesson questions** (#128) — the exam decides which
band a learner starts in, and **25 of English's 60 placement questions were also
lesson questions**, so anyone who had met one was scored on recall of that item
rather than on level. The error only ran upward, and a learner placed a band too
high starts on content they cannot do. All ten listening questions were the worst
of it: their sentences were lifted verbatim from the course's own listening packs
when the exam learned that question type. French was clean; Spanish had 2.

No existing check could see this, structurally: one suite compares lesson
questions with each other and never reads the placement pool, the other compares
placement questions with each other and never reads the banks.
`placement-lesson-overlap.test.ts` now covers that pair, gated at zero for all
three courses, plus a repeats-within-one-pool check (the pool is sampled three per
band, so the same content in two bands can be drawn twice in one sitting). All 27
questions were re-authored on the placement side, keeping band and construct —
placement ids are not review keys, so no learner's saved review state was touched.

**English content quality — 8 repeated questions removed, and the check that
found them stops whispering** (#121) — `curriculum-consistency.test.ts` looks for
the same sentence appearing in two packs, which a learner experiences as a
repeat. For English and Spanish it was report-only and printed via `console.log`,
which vitest intercepts: every run showed 46/46 passed and printed nothing while
holding 7 English and 57 Spanish findings. Two sessions independently recorded
that check as "already clean" on the strength of a quiet run.

The reported 7 was itself understated. A hand-written question's id is `q7`, so
the check's pack-id derivation produced `""` and collapsed every hand-written
question into one pseudo-pack, making duplicates _between_ hand-written units
invisible — that hid two more, including an identical question with an identical
answer in two units. A third bug rendered `listening` and `translate` answers as
`(undefined)`, so three real findings looked like reporting artifacts. All three
are fixed, and the check now asserts against a recorded per-course count
(`{ en: 0, fr: 0, es: 57 }`) so a new duplicate fails the run with the findings in
the message. English content: 8 duplicates fixed in place, no question id moved.
The two worst put an identical A1 task in the A2 translation pack.

**English content quality — a1p15's distractors stop crossing word classes**
(#117) — closes the content audit's one deferred defect. Multiple-choice
distractors are drawn from a pack's own answers and ranked by part of speech, but
tags are read from each answer's own cloze sentence and a "pair" pack line has
none. So a1p15 "Shapes & Sizes", which mixes shape nouns with size adjectives,
had no tags and no ranking: **23 of its 25 questions** offered a distractor from
the other class, and "is a perfect cube shape" offered [cube, huge, narrow,
average] — three of four size adjectives, answerable with no geometry. Now **0 of
25**, via 25 hand labels held in a per-pack override map. No pack data changed, so
no question id moved, and a1p15's 25 questions are the only ones in the course
whose choices changed.

The interesting part is what was tried first and withdrawn, because both looked
like the careful option. Reading each pair pack's prompt template as a
declaration of its answers' class ("Which verb goes with …?" cannot be answered
by a noun) is true but **inert** — ranking is relative within a pool, so a class
shared by every candidate expresses no preference — while its side effects were
real: 43 questions degraded across 11 packs, 0 improved. And that damage came
from assuming a dropped tag is a neutral abstention. It is not: `rank()` resolves
an untagged candidate to the answer's own class, so **dropping a tag promotes the
word**. Both were caught by whole-branch review, and the audit log records the
measurements.

**Podcast library Phase 1b — the iOS Listen client** — browse the folder tree, play an
episode, keep playing with the screen locked, and resume across devices. **This lifts the
Phase 0/1b release constraint**: Listen is no longer a placeholder.

`PodcastClient` is the first time the iOS app fetches _content_ from the server rather than
its bundle — `ContentStore` is explicitly "No network calls, no async" because curriculum
ships in the binary, which podcast content cannot do if the library is to grow without an
App Store release. Models, folder-tree logic, resume clamping and URL building are ported
into `LearnWithAlphonsoKit`, where they are actually tested; each port names its TypeScript
original and that file's tests so drift is visible in review.

Three decisions worth knowing:

- **Play events go through `record_podcast_play_event`**, never a direct insert. iOS was
  new code walking toward a hole just closed on web, and it would have failed silently
  inside a fire-and-forget call. Mutation-tested.
- **Resume uses optimistic concurrency on `updated_at`.** Guarding on position magnitude
  would reject a deliberate rewind; guarding on `now()` would accept the stale write it is
  meant to reject, since `now()` is evaluated when the write lands. Only observation
  recency separates them.
- **Interruptions are handled by type.** `.shouldResume` is honoured for a call, an alarm
  or Siri — never resuming would make a podcast silently die after a phone call — and
  suppressed only when one of the app's own mic screens took the session. The four
  recorders now mark `RecordingState`, read at interruption-_began_ because a recorder's
  `stop()` is itself what makes iOS send `.shouldResume`.

`UIBackgroundModes=audio` is new and App Store review-visible. The audio layer has no
automated coverage and cannot have any here, so it is device-verified or not at all.

**Podcast play events are written through a validating function** — `podcast_play_events`
shipped with a direct INSERT grant to `authenticated`, so any signed-in client could write
arbitrary `seconds_listened`, arbitrary `started_at`, and any episode id including
unpublished ones (foreign keys do not consult RLS). It is the one table Phase 2's XP and
SRS wiring is meant to trust, and Phase 1a was already live and accumulating rows, so this
bounds how much data of uncertain provenance exists rather than only protecting future
rows. Same shape as the gamification hardening in `20260920050000`. The web client moved
to the function in the same change — revoking the grant alone would have failed silently
inside a fire-and-forget call, stopping play recording with no error anywhere.

**Podcast library Phase 0 — iOS tab consolidation** — five tabs (**Learn · Listen ·
Practice · Hector · Profile**), down from seven. This fixed a live defect rather than
only making room for Listen: iPhone renders five tabs and collapses the rest into the
system "More" list, so Achievements was already buried, and League and Achievements were
both using `trophy.fill`.

League, Friends and Achievements moved behind a new `ProfileHubView`. They are presented
rather than pushed, because each owns its own `NavigationStack` (and two of them push
Teams/Season/Duels through it) — nesting stacks compiles cleanly and gives two navigation
bars on a real screen.

The review queue needed an entry point built, not moved. The Phase 1 spec had claimed
Learn already carried a due-count badge; that is true on web and was false on iOS, where
`ReviewQueueView` was instantiated in exactly one place — the tab bar. Learn now has a
review row (visible even at zero, so the queue is never unreachable) and a tab badge that
hides at zero. The badge rule lives in `LearnWithAlphonsoKit` so it is unit-tested; the
app target has no test coverage anywhere in this repo, only `xcodebuild` in CI.

**Listen shipped as a placeholder here and was filled by Phase 1b above, so the release constraint this entry originally carried is lifted.**

**Podcast/audio library, Phase 1a (web)** — a Listen tab: a folder tree of
short audio episodes, browsable at any depth through one splat route, with a
mini-player mounted in the app shell so playback survives navigation between
folders, and a per-user resume position that syncs across devices.

Four new tables (`podcast_folders`, `podcast_episodes`, `podcast_playback`,
`podcast_play_events`) plus a public-read `podcast-audio` Storage bucket — the
first binary-media subsystem in the app; everything before this was live
Deepgram TTS and stock-image URLs. Content is published by the account owner
via `scripts/podcast-tool.ts`, which takes either a recorded MP3 or a script it
has Deepgram speak, so the library grows without a deploy or an App Store
release.

Two things this work turned up elsewhere: the GDPR export list had to learn the
two new per-user tables (`account.functions.test.ts` caught it, which is exactly
the drift that test was added for), and mounting a component in `AppShell` that
statically imports server functions pulls the Supabase auth middleware into
every page's import graph — now imported lazily.

Live since the migration applied on merge (`deploy-supabase` ran green); the bucket
and its read-only policy are created by that same migration. iOS landed in Phase 1b
above; transcripts, questions, XP and SRS are Phase 2. Spec:
`docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`.

V5 work runs as parallel isolated worktrees, one per feature, kicked off
from `docs/v5-kickoffs/` (gitignored). Three PRs merged 2026-09-24 in
one sitting (#84 → #83 → #85, in that order and for a reason — see
"Merge sequencing" below).

**Canopy theme (#83, iOS)** — a fourth, iOS-only theme (emerald/coral,
mascot-forward), now the default for installs/accounts with no saved
theme preference, rolled out across all ~17 already-styled screens.
Prompted by direct feedback that the original three themes read "too
much like a book and wordish", plus a real usage gap (mascot art was
bundled but barely used). Meadow/Studio Ink/Manuscript are unchanged.
`canopy` is a deliberate exception to the "themes stay in sync with the
web's `THEME_NAMES`" rule — it is in `AlphonsoThemeID` and the
`profiles.theme` CHECK constraint but absent from `THEME_NAMES`, since
web has no CSS for it; `resolveInitialTheme` already falls back to
`meadow` for unknown values, so web is unaffected. A subagent review
caught a Critical bug pre-merge: `profiles.theme`'s `NOT NULL DEFAULT
'meadow'` silently defeated the new default for every signed-in user,
fixed by a follow-up migration making the column nullable.

**English content quality (#84)** — plausible-distractor fix plus an
audit of all 534 English lessons. Adds `src/data/answer-pos.ts`
(part-of-speech data), `src/lib/distractor-affinity.ts`, an audit
baseline (`.audit-baseline/english-ids.json`) and scanning tooling
(`scripts/audit-scan.ts`, `snapshot-english-ids.ts`,
`gen-answer-pos.ts`), with ID-parity and distractor-quality tests.
Lesson _counts_ are unchanged — this changed question quality, not
structure.

**GDPR export fix + lint scope (#85)** — `exportMyData` had been
returning **incomplete** data. It listed 9 tables keyed by `user_id`
while the migrations define 18: the gamification (#64–67) and push
(#59) batches each added user-scoped tables that were never registered,
so every "download my data" file had been missing 9 tables since those
landed. It also missed `nudges`/`duels`, which are user-owned but keyed
by `sender_id`/`challenger_id`. **Account deletion was never affected** —
all of them cascade from `auth.users`. The one list became three
(`USER_ID_EXPORT_TABLES`, `OTHER_OWNED_EXPORT_TABLES`,
`USER_DELETE_TABLES`), because export and deletion genuinely need
different sets: deletion runs as the caller and only `device_tokens`
among the new tables grants DELETE to `authenticated`. Since this list
had now drifted four times, always silently, a test parses
`supabase/migrations/` and fails the build on drift.

Same PR scoped ESLint to the live tree: `.claude/worktrees/**` (full
checkouts of other branches, nested inside the repo) was never ignored,
so `eslint .` linted all 15 of them — 3,632 problems, of which 3,630
were other branches' code and 2 were real.

**Merge sequencing** — worth remembering, because the symptom was
misleading. #83 and #85 both showed `lint-and-typecheck` failing, which
looked like two broken PRs. Neither was: a pre-existing
`prettier/prettier` break in `scripts/upload-review-screenshot.ts`
(landed in `566b71c`) was failing CI on _every_ PR, and #84 happened to
contain the fix. Merging #84 first turned both others green with no
work. #83 and #85 both touched `ARCHITECTURE.md` but in different
sections, so they auto-merged with zero conflicts (verified by
`git merge-tree` dry-run before merging, rather than discovering it
mid-merge). #83/#84's branches were updated via `gh pr update-branch`
rather than a rebase force-push, since live sessions were still working
in those worktrees.

**Placement covers the new question types (#107)** — the exam now assesses
`listening` (10 questions, two per band) and `translate` (5, one per band)
alongside multiple choice. Before this it tested only multiple choice, then
placed learners into a course where roughly one question in eight is listening,
speaking or translation.

`speak` is left out on purpose: asking for microphone permission during
onboarding, where a denial makes the question unanswerable and the typing
fallback would assess writing while claiming to assess speaking, is a worse
trade than not asking. Argued in the plan so it can be overturned knowingly.

The shape change underneath is that `PlacementQuestion` became a union and
grading moved behind one helper that takes the submitted **text** — the exam
previously compared an option index, which only multiple choice can express.
`/api/grade-translation` also learned to resolve placement ids: that pool lives
outside the curriculum's question index, so without it every placement
translation would have 400ed, and since the client reads a 400 as "no verdict",
it would have failed silently and mis-placed people rather than erroring. Same
shape as the `consume_ai_quota` bug in phase 4 — a refusal read as an absent
opinion.

Two testing notes came out of it and are now in AGENTS.md, because two other
sessions write React tests against controlled inputs: `user.type` can leave
only the last character in a controlled field (it read as "grading is broken"
and cost three wrong hypotheses about the scoring rules), and running two
vitest or two build processes at once produces failures that look exactly like
real regressions.

**Free-form translation question type (#107)** — a sixth question type,
`translate`: the learner is shown an idea to express ("Ask someone their name")
and writes it in English themselves. 125 questions across all five CEFR bands
(one pack each), taking English to 609 lessons / 3,096 questions.

Grading is hybrid and local-first. A curated list of acceptable wordings settles
most answers for free and works offline; only what it rejects is put to an AI
grader (NVIDIA NIM), which can upgrade a local miss but never the reverse. The
web paths resolve the model through `resolveNvidiaChatModel`; the Edge Function
cannot import from `src/`, so it mirrors that constant — and is now listed
alongside the other hardcodes in `nvidia-chat-model.server.ts`'s doc comment,
which exists because four of them broke at once when NVIDIA retired a model. The AI verdict is never written back
into the content — what counts as correct stays a content decision rather than a
side effect of someone's answer.

The design decision that shaped everything else: **a translate answer is graded
in three places**, and they have to agree. `/api/grade-translation` serves the
lesson player, `gradeReview` serves web review, and the `grade-review` Edge
Function serves iOS review. Putting the AI half in only one of them would
recreate the bug the speaking type was already bitten by — a wording accepted on
screen and re-derived by string comparison in the scheduler, so the learner
reads "Still got it" on an item that was just lapsed. The review players now
**display the verdict from the call that scheduled the item** instead of
grading a second time, which is what makes that disagreement impossible rather
than merely unlikely. An independent review caught the first attempt getting
this exactly wrong on iOS — displaying `/api/grade-translation`'s answer while
`grade-review` independently decided the schedule.

Two rules the whole feature rests on:

- **`null` is not `false`.** Vendor down, key missing, quota spent, model
  replying in prose — all mean "no opinion", and the local verdict stands. A
  learner is never marked wrong because a vendor was unavailable.
- **Offline still grades.** The acceptable wordings are bundled content, so a
  translation resolves with no network — stricter, but resolvable. The spec had
  said to skip speaking and translation questions when offline; that would break
  `deriveLessonCompletion`'s count check, which is how a learner finishes a
  lesson and silently receives no XP, no streak and no unlock.

Also in this phase: the deploy pipeline was repaired (see above), CI's
never-executed curriculum-seed step was switched from `bunx tsx` to `bun` so its
first real run is not also the first test of its command, and AGENTS.md stopped
claiming three-course parity — English is now 609 lessons to French's 500 and
Spanish's 508, with three English-only question types.

**Deploy pipeline repair (2026-09-24)** — `supabase db push` started failing on
every push to `main` (the `#93` and `#94` merges both show it), with "Remote
migration versions not found in local migrations directory". Cause: the
speaking migration was applied to the live project through the Supabase
management API rather than by the CLI, which recorded it in
`supabase_migrations.schema_migrations` under a generated version
(`20260924081755`) that no local filename matched. The local file has been
renamed to that version, which is what `supabase migration repair` would have
achieved from the other direction.

Worth knowing because of what else that job does: it is the step that deploys
the Edge Functions. While it was red, **no function redeployed** — so a
`grade-review` change merged during that window was live in the repo and not on
the server.

**Speaking practice question type (#107)** — a fifth question type, `speak`:
the learner is shown a phrase, records themselves saying it, and the
speech-to-text transcript is graded. 125 questions across all five CEFR bands
(one pack each), taking English to 584 lessons / 2,971 questions.

Grading a transcript strictly does not work: the same utterance comes back
spelled differently run to run ("She's a doctor", "she is a doctor", "shes a
doctor", "um, she's a doctor"). `src/lib/spoken-answer.ts` normalises
contractions, apostrophe-less spellings, fillers and punctuation and then
compares exactly — deliberately **not** edit distance, since a threshold loose
enough to forgive "she's"/"she is" also accepts "he is a driver" for "she is a
doctor".

The rule lives in `deriveAnswerCorrectness`, not in the players, because
`grade-review` re-derives correctness server-side; a client-only rule would show
"Still got it" and lapse the item anyway. It therefore exists in three
hand-kept copies (TypeScript, the Deno mirror, `SpokenAnswer.swift`) with the
same vectors in all three test suites.

Three things found while building it that tests could not have caught on their
own:

- Deepgram is called with `smart_format=true`, which returns spoken numbers as
  **numerals**. "The bus leaves at nine" transcribes as "…at 9", so a learner
  saying it perfectly was marked wrong — and that phrase was already in the
  authored A1 pack. Number words now collapse onto digits in all three copies.
- Nothing captured must never be graded. A denied microphone, a too-short clip
  and silence all reach the player looking identical to a wrong answer, so the
  capture layer reports **only** a real non-empty transcript and every failure
  path surfaces an error instead. Otherwise the learner loses a heart for a
  microphone problem.
- Where speech cannot be captured, the control degrades to typing the phrase —
  driven by actual failure, not only by feature detection. A denied microphone,
  a dead network, a failing `/api/stt`, silence, and (on iOS) being offline all
  reach it. A question the learner cannot answer is a lesson they cannot
  complete, which means no XP, no streak and no unlock, with nothing on screen
  explaining why.

Also: the capture flow was extracted from the conversation route into
`use-speech-capture.ts` rather than copied, both web players now grade through
`deriveAnswerCorrectness` instead of their own inline copies of the rule, and
`20260924081755_v5_speaking_question_type.sql` adds a **fourth** allowed row
shape to `question_shape_matches_type` (answer text, no choices, no bank, no
answer index) — without it every speaking row would be rejected.

**Listening comprehension question type (#88)** — a fourth question type
(`mc`/`fill`/`reorder`/`listening`), replacing the hidden `audioText`-on-`mc`
format that only 3 questions used. 125 questions across all five CEFR bands
(one pack each), taking English to 559 lessons / 2,846 questions.

Its `answer` is the correct choice's **text**, not an index like `mc`'s. That
was chosen on evidence — a probe of both shapes against `tsc` gave 14 errors
across 6 files for an index versus 8 across 4 for text — and it means **no
grading code changed on either platform**, since `srs.ts` and both web players
already compare `answer.trim()` for non-`mc` types.

Two things it forced that were not obvious up front. A new question type has to
be wired into _both_ players on _both_ platforms plus three Kit switches — six
exhaustive switches on iOS, including `ReviewQueueView.swift`, a second iOS
player; a type handled only in the lesson player renders a blank card in spaced
review (silently on web, as a compile error on iOS). And it needed a migration:
`questions.question_shape_matches_type` allowed exactly two row shapes, and
listening is a third (`choices` like mc, `answer_text` like fill), so every row
would have been rejected — `20260924010000_v5_listening_question_type.sql`,
following the same widening done for `reorder`.

iOS `Question` decoding was made lenient (an unknown `type` decoding to a
filtered `.unsupported` case) and then **reverted to throwing** before the PR
landed — this entry described the wrong end state until 2026-09-24. Skipping an
unknown question leaves the lesson with fewer questions than the server's copy,
and `deriveLessonCompletion` throws on that mismatch, so the learner would have
finished the lesson and silently received no XP, no streak credit and no error.
Content ships inside the same binary and CI fails the build if the exported JSON
drifts from source, so the version skew leniency was protecting against cannot
happen yet.

## V4 — Spanish course, remote push, placement, campaigns, content tooling, widget, deeper gamification (2026-09-21 – in progress)

Batch of independent V4 candidates from `docs/v4-kickoffs/00-INDEX.md`,
each its own worktree/branch/PR with real CI verification before merge
(PR #59 for the first five; V4 #7's four sub-plans below merged
separately, PRs #64-#67).

**Spanish course (#1)** — third course, full parity with English/French:
130 packs, 508 lessons, same CEFR A1-C1 structure via the existing
bank-engine pipeline. `Course` type widened to `"en" | "fr" | "es"`
across all ~22 call sites (web + iOS).

**Real push notifications (#2)** — see `send-push` Edge Function in
`ARCHITECTURE.md`. Upgrades nudge-a-friend and leaderboard-overtake from
polling/in-app-toast to real APNs push. Built end-to-end but gated on a
human-created APNs Auth Key (an interactive Apple Developer portal
action no agent can perform) — no-ops gracefully until that key and its
four secrets are set, same precedent as `REVENUECAT_API_KEY`.

**Placement test / smarter onboarding (#3)**, **multi-turn conversation
campaigns (#4)**, **content authoring tooling (#5)** — done, no
blockers; see `docs/BACKLOG.md` §1 for what each actually shipped.

**iOS widget (#6)** — home-screen streak widget (not a Live Activity —
scoped down from the index's either/or framing), signed and shipped in
TestFlight build 8. Needed a real App Group + second provisioning
profile, extending `ios-release.yml`'s manual-signing pipeline (see
that workflow's own comments) — the same signing-cert saga V4's
handoff doc flagged as "fully resolved" for the main app target turned
out to need a second round for the widget extension target.

**Deeper gamification (#7)** — three systems (a fourth, themed content
events, explicitly deferred — see
`docs/superpowers/specs/2026-09-22-deeper-gamification-design.md`'s
own "Deferred" section for whoever picks it up):

- _Teams_ — persistent groups (invite code, public discovery,
  auto-assign, 7-day switch lock), weekly-XP-sum leaderboard, a lazy-
  resolved weekly win bonus (+100 XP to last week's #1 team, no cron).
- _Challenges_ — fixed weekly solo goals (6 DB-seeded templates, same
  pattern as `achievements`) plus open/stranger duel matchmaking
  (`join_open_duel_queue`, `FOR UPDATE SKIP LOCKED`). Also shipped the
  first duel UI on either platform (web `/duels`, iOS `DuelsView`) —
  the `duels` table and its RPCs existed since V3 but nothing had ever
  surfaced them, an unplanned-but-approved scope addition. Along the
  way, fixed a real bug live since the V4 #1 Spanish launch: `duels`'
  `course` CHECK constraint only allowed `('en','fr')`.
- _Season ladder_ — Duolingo-style weekly promotion/demotion cohorts
  (~30 members, 5 divisions, `floor(size/3)` promote / `floor(size/6)`
  demote), distinct from the permanent `league_tier` badge. The one
  system complex enough to be an Edge Function (`get-season-status`)
  rather than a PL/pgSQL RPC — its ranking/promotion math is pure,
  unit-tested TypeScript.

All four V4 #7 migrations/Edge Function merged to `main` in dependency
order (`weekly_xp` shared helper first, since Teams' and Season
Ladder's migrations both call it) — see `ARCHITECTURE.md`'s database
table for the new schema and `docs/BACKLOG.md` §1 item 7 for the merge
history, including which PRs needed a real rebase (not just a
fast-forward) against an already-merged sibling.

**iOS design system** — not one of the original V4 kickoff candidates;
prompted directly by the user opening the TestFlight build and finding
it had essentially no visual design (stock SwiftUI throughout, zero
design-system files, `Assets.xcassets` with only the app icon). Ports
the web app's default Meadow theme (`src/styles.css`) to a real SwiftUI
design system (`ios/LearnWithAlphonso/Sources/DesignSystem/` — color/
spacing/radius tokens computed from the CSS's oklch values, Fraunces/
Geist bundled as variable fonts and resolved via CoreText, the
`.hard-shadow` pressed-button effect) and applies it to every screen,
including Season/Teams/Duels once that work merged (see `ARCHITECTURE.md`'s
"Native iOS app" section for the full breakdown). Meadow only — no
in-app theme switcher, dark mode, or the CSS grain-texture effect, all
deliberately deferred. Built in its own worktree/branch off `main`
throughout to stay clear of V4 #7's concurrent work; `ios-app-build` CI
green on every commit, including a real bug it caught (see
`ARCHITECTURE.md`'s "Known rough edges" for the `Section`/`header:`
brace-nesting gotcha that caused it).

**iOS theme system + real-device bug fixes** — direct follow-up once
the user actually tested the design-system build on their phone via
TestFlight. Found two things: (1) almost every screen was near-illegible
— white text on a light background — because the device was in system
Dark Mode and the app's fixed-light palette didn't account for that;
(2) the sign-in screen had a real layout bug (a `Divider()` in an
`HStack` stretching to fill the screen) and looked sparse. Root-cause
fix for (1): the design system became a real _theme system_ (Meadow +
the web's other two themes, Studio Ink and Manuscript, all three now on
iOS) with `.preferredColorScheme` pinned to whichever theme is active,
so system-styled chrome resolves colors against the theme's own
light-or-dark-ness instead of the device's setting — this is also what
makes Studio Ink (legitimately dark by design) render correctly, not
just a Dark Mode workaround. New in-app theme picker (`SettingsView.swift`,
the app's first settings screen) syncs the choice to `profiles.theme`
in the background, round-tripping with the web app's own theme picker
on the same account. Sign-in screen got a real visual pass, not just
the bug fix. See `ARCHITECTURE.md`'s "Native iOS app" and "Known rough
edges" sections for the full breakdown.

**iOS liveliness pass + mascots** — two more rounds of direct real-device
feedback. First: the course-language picker showed only a single
truncated letter per option ("E/F/E" — English and Español
indistinguishable), and the app "didn't feel alive" — fixed with a
compact flag-based `CoursePicker`, a new `StatusHeaderView` (streak/
hearts/XP/league tier, with a continuously pulsing flame) on the Learn
tab, a gradient primary button instead of flat fill, and staggered
spring-entrance on lesson/leaderboard rows as they scroll into view.
Second: the user pointed out the app has two named personas — Alphonso
(its own namesake/host) and Hector (the Pro AI tutor) — with zero visual
form anywhere, and generated real character portraits for both
(user-provided, not AI-generated by this session — Higgsfield was out of
credits). Alphonso now shows up for wrong-answer help in the Lesson
Player and Review Queue (a portrait + explanation card sliding in on a
wrong answer) and greets the user on the sign-in screen; Hector has his
own portrait on his sign-in step and a small avatar beside his chat
bubbles. Alphonso does wrong-answer help rather than Hector deliberately
— Hector is Pro-gated ($9.99/mo), and giving him away for free in the
ordinary lesson flow would undercut the subscription. See
`ARCHITECTURE.md`'s "Native iOS app" section for the full breakdown.

**`AlphonsoTipCard` speech-bubble redesign** — same-day follow-up: the
user sent a mockup wanting Alphonso bigger and speaking through a real
speech bubble rather than the small circular-avatar card, explicitly
asking for one version, not both. New `SpeechBubbleShape`, a larger
88×112pt portrait, kept deliberately in-flow (not an overlay) so it
can never cover the Check/Continue button the way the user's own
reference mockup did. Merged PR #72 — real CI caught a genuine bug
before merge: `SpeechBubbleShape` needed `InsettableShape` conformance
(not just `Shape`) for `.strokeBorder` to compile.

**Course picker still unreadable — root-cause fix** — real device
screenshot on build 12 showed item 13's flag+2-letter-code fix wasn't
enough: `.pickerStyle(.segmented)` itself is too narrow a control for a
`.topBarLeading` slot competing with a large `navigationTitle`, so
segments still clipped to unreadable slivers. Switched to
`.pickerStyle(.menu)` — a menu picker only ever renders one selection +
a chevron, so it always has room regardless of screen size. Merged
PR #73, no conflict with PR #72 despite both touching
`AlphonsoComponents.swift`/`ARCHITECTURE.md`. This is the third
consecutive iOS UI PR where CI-green and looks-right-on-device
diverged at least once (see `docs/BACKLOG.md` items 11/13/15).

**SM-2 audit + lapse-interval fix** — a read-only audit of
`src/lib/srs.ts` (prompted by "can these deferred items be tackled?")
found the post-lapse interval formula's third branch was dead code:
`RETIRE_AFTER_REPETITIONS=4` caps live repetitions at 3, so
`floor(repetitions * 0.5)` can only ever be 0 or 1, meaning every lapse
collapsed to the same fixed 1-or-3-day interval regardless of how much
progress the item had earned — defeating the "halving, not zeroing"
softening the code's own comments already described. Fixed: interval
now scales proportionally off the item's real prior interval (a
40-day item and a 3-day item both halve to the same repetitions
bucket, but now land on 20 days vs. 2 days, not the same fixed step).
No telemetry exists to check lapse/retention rates against real usage
— flagged as a gap, not fixed. Merged PR #74.

**Content-generator case-bug fix + automated consistency scan** — a
new `src/data/curriculum-consistency.test.ts` (CI-enforced going
forward) scans all 3 course content banks for structural bugs
(duplicate ids, out-of-range answers, duplicate MC choices, fill
answers missing from their own bank, orphaned vocab-image keys). On
its first run it found 5 real questions across all 3 languages with
duplicate-looking answer choices (e.g. English "may"/"May", French
"est"/"Est") — traced to `pickDistractors` (duplicated in both
`lesson-bank.ts` and `bank-engine.ts`) deduping candidates
case-_sensitively_, so a cloze pack reusing the same word as the
correct answer for two differently-capitalized lines could surface
both casings as separate choices. One logic fix in both duplicated
copies, not 5 content edits, since content regenerates from packs on
every load. Merged PR #75.

**Generative sentence-template content (pilot, English-only)** — new
`generate` subcommand on `scripts/pack-tool.ts`: an LLM proposes
candidate vocabulary for a topic, a real morphological library
(`compromise`) — queried via a verified derivation strategy that works
around two confirmed bugs in the library's own subject-agreement
detection — is the sole authority that conjugates verbs and compiles
final sentences. Grammar templates are hand-authored, never
LLM-proposed. Output feeds the _existing_, unmodified
`validate`/`preview`/`apply --confirm` pipeline. Built via
brainstorming → spec → 11-task TDD implementation plan → a fresh
whole-branch review (dispatched on a separate model, not
self-reviewed) → a fix pass on 3 Critical + 6 Important findings the
review caught (sampler skew that silently omitted 3rd-person subjects
from generated packs; ambiguous/duplicate-answer questions; missing
capitalization and articles). One suggested review fix was
investigated and _declined_ after verification showed it would be a
regression. Full detail: `docs/superpowers/specs/
2026-09-22-generative-sentence-content-design.md`'s "Final-review
fixes" section. English-only; French/Spanish, and the residual
cross-verb-distractor and unverified-new-verb risks, are explicitly
open follow-ups, not silently solved. Merged PR #76.

## V3 — Feature depth expansion (2026-09-20 – in progress)

Six-package initiative adding depth to existing features rather than new
surface area, sequenced by risk (self-contained/algorithmic first, the
largest product initiative in the middle, the most exploratory pieces
last): SRS scheduling, gamification engagement mechanics, conversation
experience, tutor/weakness system, curriculum formats, generative/adaptive
content.

**Smarter SRS scheduling** — two targeted, low-risk improvements to the
existing SM-2-style algorithm (not a full replacement — see
`src/lib/srs.ts`'s doc comments for why a novel stability-based model was
considered and deliberately not chosen): a lapse now halves repetitions
instead of resetting to zero, and a successful review well past its due
date grows the interval further (capped 1.5x), rewarding the real
spacing-effect finding from memory research. No schema change. Ported to
`supabase/functions/grade-review/srs.ts` (Deno) and
`ios/LearnWithAlphonsoKit/.../SRSEngine.swift` (Swift) with matching
parity tests in all three.

**Engagement mechanics** — four independent additions, all RPC-first from
day one (no direct-write debt like the original gamification tables had):
expanded achievement catalog (6 new diamond/gold tiers on existing
categories); `buy_streak_freeze_with_xp` RPC, mirroring the existing
hearts-purchase RPC, no cap unlike hearts; friend duels (`duels` table +
`create_duel`/`respond_to_duel`/`get_my_duels` RPCs, head-to-head XP
competition over a friend-accepted window, lazily resolved on read rather
than needing cron infrastructure this project doesn't have yet); weekly
quests (`weekly_quests` catalog + `user_weekly_quest_claims` +
`claim_weekly_quest` RPC, progress computed from already-durable
activity_days/lesson_completions data rather than a new counter). Caught
and fixed a real trust-boundary bug in review during this package's own
build: an early draft of `claim_weekly_quest` took metric/target/xp_reward
as caller-supplied RPC parameters, which would have let any caller invoke
it directly via PostgREST with an arbitrary reward -- fixed before it
shipped by moving the catalog server-side. Web server functions + Kit
client methods shipped and tested on both platforms; new UI surfacing
(making these reachable in the actual app, not just callable) is the
immediate next fast-follow, same "backend/client-method complete, UI
wiring follows" precedent this codebase already established for
`acceptFriendInvite`.

**Conversation experience** — three additions to the free-conversation
roleplay feature (web `/converse` and iOS's free mode; Hector/Pro is
untouched except a compile fix for a shared client method's changed
signature): 6 new scenarios (12 total, added a couple of Advanced-level
ones -- salary negotiation, friendly debate -- since all 6 originals were
Beginner/Intermediate); adaptive difficulty (`/api/chat` now takes an
optional `cefrLevel` and appends a vocabulary/complexity hint to the
scenario's system prompt -- a prompt-shaping hint, not a trust boundary,
so client-supplied without validation); pronunciation feedback via a
heuristic, not real phoneme scoring (Deepgram's own utterance-level STT
confidence, already present in the `/api/stt` response, surfaced as a
clear/okay/unclear badge -- zero new vendor, zero new cost). iOS had no
way to read a user's own current CEFR level at all before this --
`ProgressSyncClient.fetchCefrLevel` (a plain RLS-scoped read) is a small
new addition specifically to unlock adaptive difficulty there too.

**Tutor & weakness system (in progress)** — a weakness trend log
(`weakness_events`: 'detected'/'resolved' rows, plain RLS insert/select-own
since it's a non-value-bearing signal, not RPC-gated) now records every
time `/api/analyze-weaknesses` classifies a gap and every time a
weakness-sourced review item retires (mirrored in both
`review.functions.ts`'s `gradeReview` and the `grade-review` Edge
Function). The NVIDIA classification + parsing logic used by
`analyze-weaknesses` was extracted into a shared
`src/lib/weakness-detection.server.ts` module so a second call site could
reuse it without duplicating the taxonomy/prompt/Zod-parsing; that second
call site is new: `completeLessonRemote` now also runs weakness detection
directly against a lesson's own missed questions (previously this only
ran from free-conversation transcripts), so a learner gets weakness
tracking from graded lesson mistakes even if they never use `/converse`.
Best-effort and fully isolated behind a try/catch — a classification
failure never fails the lesson-completion response. Caught and fixed a
real, pre-existing production bug while exploring this area:
`analyze-weaknesses.ts`'s insert into `review_items` never included
`user_id` (a NOT NULL column with no default), meaning the route had
likely never successfully written a row in production; it also had zero
test coverage, which is how that went unnoticed. Fixed with proper
`user_id` resolution + `supabaseAdmin`, and given 7 new tests. A
weakness-trend read now surfaces that log: `getWeaknessTrend` aggregates
`weakness_events` into per-category detected/resolved counts, shown as a
"Weakness trend" section on web's `/profile` (still-working-on-it vs.
mastered) and iOS's Achievements screen (`ProgressSyncClient.
fetchWeaknessTrend`), with matching test coverage on both platforms. No
`course` param anywhere in this pipeline: weakness detection itself is
English-only today (`analyze-weaknesses.ts` hardcodes `language: "en"`),
so there's nothing to filter by yet. Tutor persona memory (Hector) is
also live: `TutorMemoryContext.buildPrimingMessage` (Kit, pure/tested)
turns a learner's current CEFR level + open weakness categories into one
priming history entry, prepended to every `TutorConversationClient.
respond()` call in `HectorView.swift` but never appended to the visible
`turns` transcript itself. This is _not_ Hector recalling actual past
conversation -- that transcript lives entirely on AlphonsoEcosystem's
Cloud Voice backend, which this repo can't read (see the Hector
weakness-detection design doc's "what this does NOT change" section);
it's durable facts this repo already tracks, replayed as continuity each
new session. Proactive tutor nudges close out the package: a new
`weakness-practice-nudge` local notification kind (`NotificationLogic.
swift`'s `weaknessPracticeNudgeCopy`/`nextWeaknessPracticeNudgeDate`,
same pure-logic-in-the-Kit split as the existing streak/due-review/
weekly-recap nudges), scheduled from `AchievementsView.load()` reusing
its existing weakness-trend fetch -- no second network round trip, same
precedent as the due-review nudge reusing `ReviewQueueView`'s fetch.
Fires at a fixed 10am (distinct from the streak reminder's 8pm and the
due-review nudge's fixed hours-out, so the three kinds don't compete for
the same moment), named for the single most-open category to stay
concrete rather than a generic nag, and cancelled automatically once no
category is open. This closes out package 3b (tutor & weakness system);
curriculum formats and generative/adaptive content (packages 4a/4b)
remain.

**Curriculum formats** — two new question formats layered
onto the existing `mc` type rather than new discriminated cases (`imageKey`
shows a stock photo above the prompt for "image matching"; `audioText`
speaks via on-device TTS -- `src/lib/speech.ts` on web, `AVSpeechSynthesizer`
on iOS -- for "listening comprehension"; zero new grading/regrade logic
either way, since both are still plain `mc` questions underneath), plus a
genuinely new `reorder` type (tap a shuffled word pool into the correct
sentence order) with its own grading branch mirrored across
`srs.ts`/`bank-engine.ts`/`review.tsx`/`lesson.$id.tsx` and their iOS Kit
equivalents (`CurriculumModels.Question.Reorder`, `QuestionGrading.swift`,
`LessonPlayerView`/`ReviewQueueView`'s tap-to-assemble UI). A new migration
widens the curriculum-data tables' `question_shape_matches_type` CHECK to
accept `reorder` (same row shape as `fill`: `bank` holds the token pool,
`answer_text` the correct sentence) -- `grade-review`'s Deno function
needed no code change, since it already treats any non-`mc` row as a plain
text comparison. Three example questions (one of each new format) added to
the real `u1l2` lesson to exercise this live, both in tests and in prod.
Also added a `deploy-supabase` CI step that runs `scripts/
seed-curriculum-db.ts` automatically (no-ops until `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` repo secrets are added -- see that job's
comment), closing the same class of "manual script, easy to forget" gap
that already motivated the job's migration/function auto-deploy. Caught a
real instance of exactly that gap while regenerating `scripts/
export-ios-content.ts`'s bundled JSON for this work: package 2's
18->24 achievement catalog expansion, _and_ package 3a's 6 new
conversation scenarios, had never been re-exported -- iOS had silently
been stuck on 18 achievements and the original 6 scenarios (missing
hotel/directions/apartment/returns/negotiation/debate entirely) since
those packages shipped. Fixed, and documented in ARCHITECTURE.md's "Known
rough edges" since `export-ios-content.ts` still has no equivalent
automated step (its output is committed JSON, not a DB write, so it can't
be a silent CI step the same way). Closes with the French course's
lesson-count gap: 75 new content packs (15 per CEFR level, A1-C1) added to
`lesson-bank-fr.ts` in the same compact pair/cloze format as the existing
25, taking French from 125 to exactly 500 lessons -- matching English's
534-lesson depth for the first time. New topics per level: A1 gets
everyday-life vocabulary (body parts, house, jobs, food service, tech,
transport, etc); A2 moves into applied grammar in context (reflexive
verbs, near future, negation, question formation) alongside more
vocabulary; B1-B2 add intermediate/upper-intermediate grammar (relative
pronouns, object pronouns, y/en, passive voice, plus-que-parfait,
conditionnel passé, the causative, double object pronouns) and register-
specific vocabulary (politics, law, economy, arts); C1 adds literary and
formal register (passé simple recognition, subjunctive past, false
friends, register shifts, academic writing phrases, nuanced modal
expressions). No new question types were needed -- all 75 packs reuse the
existing pair/cloze pack engine, which already auto-generates mc/fill
questions with distractors and shuffling. This closes out package 4a.

**Adaptive difficulty** — in-lesson reinforcement: missing a
question now queues one extra practice question testing the same concept
(pulled from a sibling lesson in the same unit/pack) right there in the
lesson, not just later in spaced review. Shown as its own "Quick practice"
interstitial _after_ the missed question's own feedback (never replacing
it), and never affects correct/missed/hearts/XP regardless of its own
outcome -- purely supplementary. No difficulty metadata exists on
individual questions, so "skew toward easier or harder based on how
you're doing this session" is implemented as a _pool_ skew instead:
`pickReinforcementQuestion` (mirrored in `bank-engine.ts` and a new
`LessonReinforcement.swift` in the Kit) draws from the tightly-scaffolded
same-unit pool by default, or the wider same-CEFR-level pool once recent
accuracy this attempt is high, falling back to the other pool if the
preferred one is empty. Ships on both web (`lesson.$id.tsx`) and iOS
(`LessonPlayerView`), reusing 100% existing curriculum data.

**Generative sentence content** — a "Generate more practice" option on the
lesson finish screen: NVIDIA NIM (same integration as weakness detection
and free conversation) writes 3-5 fresh multiple-choice questions on that
specific lesson's topic, using the lesson's own questions as grounding
examples so the model stays on-topic and doesn't just repeat them
verbatim. New `src/lib/practice-generation.server.ts` (same defensive-
parse-never-throw design as `weakness-detection.server.ts`) backs a new
raw HTTP route, `api/generate-practice.ts` (reuses the existing `chat`
quota bucket, same precedent as `analyze-weaknesses.ts`). Entirely
ephemeral on both platforms -- generated questions live only in
component-local state (web) / view-local `@State` (iOS,
`AIConversationClient.generatePractice`), never persisted, never counted
toward XP/hearts/review scheduling, same posture as in-lesson
reinforcement above. This closes out package 4b, and with it, all six V3
packages.

## V2 — Native iOS feature expansion (2026-09-19 – 2026-09-20)

Built as a batch of independent, parallel-safe feature slices against
the already-shipped V1 iOS app, following kickoff docs in
`docs/v2-kickoffs/` (gitignored, local-only — the pattern is
preserved for `docs/v3-kickoffs/`, see below).

**Design docs** (#47) — `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`
follow-ups scoped as five parallel-safe V2 slices, plus two decision
docs (offline-first, Hector weakness-detection) needing more thought
before implementation.

**Base features batch** (#48–#52, one PR each): local notification
scheduling infrastructure; leaderboards screen (global/friends/country,
weekly/all-time via the existing `get_leaderboard` RPC); friends screen
(invite-link based, via `get_friends_progress`); achievements/leagues
browse screen with unlock celebrations; vocab stock-photo images in the
lesson overview.

**Offline-first** (#53) — lesson completion and review grading both
queue locally (SwiftData: `PendingLessonCompletionRecord`,
`PendingReviewGradeRecord`, `CachedDueReviewRecord`) and sync when
connectivity returns (`NetworkMonitor`). The drain logic itself
(`SyncEngine.swift`) lives in the Kit, not the app target, specifically
to stay Windows-testable. Two known, deliberately-unsolved edge cases
(concurrent-device grading, offline streak-continuity) — see
`ARCHITECTURE.md`.

**Leaderboards + friends, deepened** (#54) — overtake detection (in-app
toast) and a weekly recap sheet for leaderboards; an activity feed
(`friend_activity_events`, written by `complete-lesson`) and
nudge-a-friend (`nudges` table, deliberately the weaker polling-based
V2 version, not real push) for friends. Extracted a shared `ToastBanner`
after noticing the overtake toast and nudge banner were near-duplicates.

**Hector/free-conversation weakness detection** (#55) — after either
AI-conversation mode ends (4+ turns), NVIDIA NIM identifies up to 3
weaknesses from a fixed taxonomy and inserts them as gradable
multiple-choice `review_items` rows (`source` column discriminates
lesson-derived vs. synthetic weakness items). New `/api/analyze-weaknesses`
TanStack Start route (deliberately not a fourth Edge Function).
`grade-review` and its web mirror (`review.functions.ts`) both branch
on `source`; the web `/review` page renders weakness items too (a gap
found and fixed mid-implementation — without it, a weakness item would
have been an invisible-but-still-due phantom on web).

**Test coverage** (#46) — from near-zero to 502 tests across 72 files
(data layer, lib utilities, components, hooks, Supabase integration,
route components), 90.55% statement / 91.56% line coverage. Added
`vitest.setup.ts` (React Testing Library + jsdom).

**Infrastructure fixes made along the way:**

- Repo transferred from a personal GitHub account to the `obsidian-media`
  org (fixed a GitHub Actions billing block) — broke Vercel's GitHub
  integration in the process; still needs manual reconnection (see
  `ARCHITECTURE.md`'s "Known rough edges").
- Manual Vercel production deploy (2026-09-20) to catch production up
  on everything merged since PR #49, which had gone undeployed. Added
  `.vercelignore`.
- `review_items` schema extended with `source`/`weakness_label`/
  `weakness_display`/`prompt`/`choices`/`answer_index`/`explanation`
  columns (migration `20260920040000`).

## V2 kickoff (2026-09-17 – 2026-09-19)

**Native iOS app, ground-up build** (#24, #27–#45): design spec, curriculum
DB schema + seed script, `complete-lesson`/`start-lesson-session`/
`grade-review` Edge Functions, app scaffold, lesson player (overview →
vocab → quiz → finish), SM-2 review queue, two AI-conversation modes
(free via this repo's own `/api/chat`/`/api/tts`/`/api/stt`, and Pro
"Hector" via AlphonsoCompanion's Cloud Voice + RevenueCat gating), app
icon, CI (`ios-app-build`, `ios-swift-tests`), signed release pipeline
with an optional TestFlight upload step, App Store orientation-
validation fix, `SupabaseSession.userID`.

## V1 — Web app (through 2026-09-18)

- **Lovable decoupling** (#1): moved off Lovable-hosted AI gateway/tooling
  — AI calls go straight to NVIDIA NIM/Deepgram, deploy targets Vercel
  directly.
- **Content buildout** (#3–#9, #14, #18, #21, #23): full 5-CEFR-level
  English curriculum (534 lessons), vocab-card images for 1,161+ terms
  (English + French), lesson-bank generator packs.
- **Rebrand** (#8, #10, #13, #20): Lingua → Alphonso across all
  user-facing text and the app icon.
- **French course** (#11, #12, #14, #16): full second course (125
  lessons across 5 levels), course switcher, course-aware SRS.
- **Placement test** (#15): randomized adaptive placement with seeded
  lesson-replay variation.
- **Friends v1** (#17): invite-link based friends feature.
- **Voice** (#19): TTS/STT swapped from OpenAI to Deepgram.
- **Themes** (#30, #33): 3 user-selectable themes (Meadow, Studio Ink,
  Manuscript).
- **Hardening** (#22, #29, #31, #34): security/a11y/testing-infra audit
  follow-up, hearts-economy fixes, gamification-table CHECK constraints,
  XP/hearts farming exploits closed.
- **Curriculum DB + iOS groundwork** (#24–#28): design spec and schema
  work that V2's native iOS app was built on top of.

## Phase 0 — Origins

Started as a Lovable-generated TanStack Start scaffold; Phase 1 (#1)
decoupled it from Lovable's hosted infrastructure while keeping the
generated code as the foundation. Everything above is original work on
top of that foundation.
