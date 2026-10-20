# Backlog — Learn with Alphonso

> **Master tracking doc.** Historically this was added to `.gitignore` and
> kept local-only; the project owner has now explicitly requested that this
> maintained backlog be committed. Purpose: one place that lists **every** deferred/postponed/
> not-yet-tackled item across this project, so nothing raised in
> conversation ever silently disappears. Consolidates `DEFERRED-WORDS.md`,
> `docs/v2-kickoffs/`, `docs/v3-kickoffs/`, `ARCHITECTURE.md`'s "Known
> rough edges", and `AGENTS.md`'s Testing section as of **2026-09-21**.
>
> Those source files still exist and still have useful detail — this
> doc is the index/summary layer on top of them, not a replacement.
> **Verify every claim here against current code before trusting it** —
> this is a snapshot, not a live source of truth, same discipline every
> doc it draws from already states.
>
> When an item here gets done: mark it `~~struck through~~ **DONE
> <date>**` rather than deleting it, so history stays visible. When you
> pick up new work and it's not on this list, add it before starting.

> **CURRENT STATUS — 2026-10-20:** Branch `Codex-pre-Launch` is pushed through `80eb3af`; PR #337 is open and fresh CI is queued/in progress. Run 39363166722 passed TypeScript but iOS Swift tests failed because review snapshot properties were declared on the wrong queue struct; this is corrected in `80eb3af` and its macOS CI rerun is pending. The earlier fixture source type error was corrected in `d7838b3`. Local vocab-image tests pass 133/133. Review freshness protection and bounded offline activity dates are implemented in `9cd0434`; automated vocabulary-image metadata triage is implemented in `6edb9e8`. Earlier baseline run 39344690192 passed and the prior 730/730 URL check remains evidence only for availability, not image quality. Android save-any-word is already implemented (#325), but Android device QA remains open. French/Spanish native-speaker review, physical device sign-off, deployed application headers, App Store/RevenueCat state, production account cleanup, and other owner/platform gates are not confirmed. This is not a broad-launch approval; the remainder of this file includes historical entries not individually re-audited.
>
> **Latest CI correction — 2026-10-20:** The later run 39363409158 passed lint/typecheck, web/admin builds, Deno, and regular E2E, but found one brittle iOS source-guard test that assumed a single-line review-grade initializer. The test now supports multiline parameters while still asserting the account owner is present. Android and iOS CI had not yet finished; rerun is required before sign-off.

> **Follow-on implementation checkpoint — 2026-10-20:** Review freshness protection and bounded offline completion dates were committed/pushed as `9cd0434`; Deno grade-review tests passed 18/18, complete-lesson tests passed 26/26 with `--no-check` (the checked invocation stalled during module checking), and Android `:core:test` passed. Automated metadata triage is committed/pushed as `6edb9e8`; vocab-image tests pass 133/133. Branch CI for the combined changes was still running at the last observation. Android app/device tests and iOS/macOS runtime/device checks remain subject to CI/device evidence. Android save-any-word is already implemented (#325), with device QA open; French/Spanish native-speaker approval remains a human gate.

> **Follow-on sync checkpoint — 2026-10-20:** The preceding review-concurrency/offline-activity changes and their tests/docs are now committed and pushed as `9cd0434` on `Codex-pre-Launch`. The local Deno checked run remains unverified (the no-check functional suite is 26/26); Android core unit tests pass. Vocab-image automated metadata triage is being added in the next phase; no new launch-readiness claim is implied.

> **Vocab-image triage checkpoint — 2026-10-20:** Added `scoreVocabImageCandidates` and `bun scripts/vocab-image-review.ts quality` in `6edb9e8`. The score is explicitly metadata triage (dimensions, extreme aspect ratio, missing provider description, duplicate image hash, and absent visual review); it does **not** establish that an image depicts the intended term or is safe/appropriate. Focused tests passed 2/2 and the full vocab-image suite passed 133/133 on rerun after one transient timeout. CI lint passed; its first typecheck caught an invalid test fixture source literal, now corrected. The follow-up CI run is required for compile evidence.

> **STATE SNAPSHOT 2026-10-19 — code/backlog reconciliation and active closure work:** `main` at `6749f18` (PRs #329–#336); this audit branch additionally contains `89ec4e0`–`9660efc` and pushed hardening checkpoints `c578319`, `ebb9297`, and `0017bc3`. #329–#336 deliver honest landing copy, placement-language choice, support link, TestFlight what-to-test notes, App Store Connect beta-review submission tooling, signup attribution, and read-only auth-rate-limit reporting. The 2026-10-18 closures remain current by repository history: 0.0-aj (#307/#310), signed-in E2E (#309), complete-lesson handler tests (#306), Android consent/name steps (#312/#316), 0.6.2 FR/ES generative pipeline/content (#313/#317/#319), AI-narration disclosure (#308/#321/#311), 0.0-ac #3 hands-free Hector (#315), #4 Android save-any-word (#325; #326 transcript course), #10 paywall/annual plan (#314), and Android report-reply/FR-ES/offline-sync/podcast parity (#318, #320–#327). This branch also closes 0.0-ak export pagination in code/tests. Active hardening now includes bounded vocab-image retries, safe account-deletion retry recovery across cleanup/auth failures, same-episode iOS download deduplication, learner/admin nonce CSP + HTTPS-only HSTS wrappers, and a real-Postgres concurrency/privilege test added to signed-in CI. Local focused tests and both production builds pass; branch CI, macOS execution of the Swift tests, and deployed-header observation remain pending. 0.0-aj is closed per #307/#310, not open. **External release state is not freshly verified here:** App Store Connect, RevenueCat, TestFlight, production Supabase/Vercel, physical devices, and owner-only account cleanup need dated owner evidence. Do not treat older build/agreement snapshots below as current. The 2026-10-18 CI test counts are historical, not rerun by this reconciliation.

> **CI follow-up 2026-10-19:** PR #337 run 39337613041 passed all checks, including signed-in local-Postgres concurrency/anon-role assertions, Swift tests, iOS app build, web/admin builds, lint/typecheck, Deno tests, and regular E2E. Commits `ca63d65` and `d07cb18` carry the implementation and Node request-cloning fix. Deployed response headers and owner/device release gates remain open.

> **Final implementation CI 2026-10-19:** Head `3373811` passed PR run 39342519846: all CI jobs green, Bun suite 309 files / 3,685 passed / 1 skipped, both E2E journeys (including real-Postgres race and anonymous denial), Swift tests, and iOS app build. This includes the cross-runtime request normalization and lint formatting fix.

> **Preview header evidence 2026-10-19:** Both Vercel preview HEAD probes returned the deployment-protection `/login` page and generic Vercel CSP/HSTS headers, not the app. Application CSP/HSTS verification remains pending authorized preview access; no protection bypass was attempted.

> **Local production runtime check 2026-10-19:** Both built learner/admin servers returned 200 with CSP nonce directives matching nonce attributes in rendered HTML. This uncovered a Request cross-realm issue; reconstruction now normalizes request body bytes. Focused tests, TypeScript, and both builds pass. Final Bun CI on `3373811` is green. Local HTTP did not emit HSTS, as intended; HTTPS-only HSTS remains covered by tests.

> **Vocab link checker follow-up 2026-10-19:** PR workflows 39343410188 and 39344259073 returned images for 728/730, then 729/730, with residual HTTP 429s. Retry logic honors bounded numeric/date `Retry-After`, adds one attempt, logs the final retry hint, runs serially, and falls back to a ranged GET when HEAD remains rate-limited. Focused tests pass 12/12; next live check is pending.

> **Latest validation 2026-10-20:** On `f9e9d9f`, CI run 39344690192 passed all jobs (Bun suite, E2E and signed-in database concurrency/privilege assertions, Deno, builds, Swift tests, iOS app build). Standalone link-check run 39344690227 returned **730/730** image URLs successfully.

> **2026-10-19 verification boundary:** I reconciled all explicitly open/partial items in the current release and backlog summaries against current branch code/history where possible, and corrected the stale high-impact claims called out below. The remainder of this file contains dated incident reports and deferred product ideas; those historical narratives are retained, not represented as individually re-audited line-by-line. Any live state, human content approval, device behavior, or separate-repository status without fresh evidence is marked unverified/owner-gated rather than presumed done.

> **Five prioritized pre-launch closure items — active status (2026-10-19):** (1) Supported Bun CI passed on main (run 39183037153); Codex-pre-Launch has no Actions run yet, so branch CI is pending PR/CI authorization. (2) Learner/admin nonce CSP, baseline headers, and HTTPS-only HSTS are implemented; tests and both builds pass, but deployed response checks are pending. Policy keeps `unsafe-inline` only under `style-src` for existing inline styles; `script-src` is nonce-only. (3) Added a signed-in CI test that sends concurrent service-role calls with one stale snapshot and asserts one `applied`, one `conflict`, exactly one completion row, and anon-role RPC denial; execution awaits branch CI. (4) Account deletion keeps auth active on owned-row, incoming-friendship, or auth-service cleanup failures; it logs safe error codes/details server-side and gives users a retry instruction. Focused regression tests pass; production failure-drill remains pending. (5) iOS same-episode downloads coalesce through a shared keyed task registry; Swift tests cover shared success/failure/retry but need macOS CI. Highest-priority separate human gate remains exact-build TestFlight/App Store/RevenueCat/device sign-off.

> **STATE SNAPSHOT 2026-10-16 (superseded by 2026-10-17; supersedes the 2026-10-10 line below where they differ):** main `e59602f` (after #305 docs). Build 50 external TestFlight `BETA_APPROVED`; build 51 VALID, not attached, not submitted. Merged since 2026-10-10: #281, #283-#304 (17 build-51 PRs on 10-12, six today). Repo has only `main`, no worktrees. Closed today: stale SocialSafety comment (#300), `--` in lesson text (#301), Android AI error copy + empty-reply retry (#302), Android hearts gate (#303), name filter `noods`/`pron` (#304, live), leftover worktree folders and 61 stale branches. Investigated and not doable by migration: the `net` grant revoke (see 0.0-al pg_net). Open and agent-doable: Android consent screen, public-name step, AI-reply report and FR/ES scenarios on Android; flaky `LearnViewModelTest` (0.0-aj). Owner-gated: Android device checks (DEVICE-CHECKLIST hearts gate section), attach build 51 + test info, 50->51 upgrade test, OWNER-TODO section A (not re-verified today).

> **Last verified 2026-10-10 (docs pass; backup in BACKLOG.backup-2026-10-10.md):** items below were updated against the merge log through #280 (main `e417fee`) and marketing #2. **Late 10-10:** build 50 is in external Beta App Review (owner submitted; the public link is ON). The repo is house-cleaned (only main). Build 51 also gets the stale comment at `ProgressSyncClient+SocialSafety.swift:74` (teams are no longer readable by all after #273). Build 50 is on TestFlight (internal), attached to version 1.0, builds 49 and below are expired; nothing is submitted. The one hard blocker is OWNER-ONLY: the App Store Connect Paid Apps Agreement is "New" (the paywall cannot load products). See section 0.0-am for what is done and what is queued for build 51. Older notes below keep their 2026-10-09 audit text and are marked DONE where 2026-10-09/10 work closed them.

> **Previous verification 2026-10-09 (backlog audit, backup in BACKLOG.backup-2026-10-09.md):** every item not marked DONE was re-checked against origin/main (1b5115d); the per-item notes are appended in place. The snapshot below is from 2026-10-07 and is STALE: since then the App Store remediation program merged PRs #236-#269 (consent and AI safety, auth, subscription, moderation, voice engine, learning flow, podcast player, binary polish, build 50 release tooling, name prompt fix #267, AI reasoning off #269). Open PRs today: #270 (iOS QA fixes, not merged) and #268 (vocab photos pass 2, draft, ships in build 51). Build 50 is the release candidate and is not submitted yet. Source of truth for the program: the remediation ledger outside the repo. New items from the program are in section 0.0-al below.

> **STATE SNAPSHOT 2026-10-07 (autonomous session; refreshed after #238):** LIVE on production: Teams, weekly quest claims and the course-aware XP payouts (fixed 2026-10-06, they were broken: see 0.0-ah); save-any-word and the learning goal planner (web); the database privilege cleanup (0.0-ae: PRs #227-#229, anon writes and unbacked client privileges gone, new tables start closed, CI guards); two real bugs found and fixed on the way (web lesson completion showed 0 XP when it earned XP, #228; the GDPR export silently omitted four tables, #229); study together Part 1 on the web and server: weekly team mission (#230, #231) and the Team player badge (#232). MERGED but in NO build or release: goal planner on iOS and Android, team mission on iOS (#233) and Android (#234); study together Part 1 (team mission) is COMPLETE on all three platforms. IN FLIGHT: nothing. STUDY TOGETHER IS COMPLETE (2026-10-07): team missions, friend buddies, opt-in matching (13+ declared-age confirmation, server kill switch buddy_settings.matching_enabled), weekly goal + streak, preset messages; server + web LIVE (#230-#232, #236, #238, #242, #244), iOS + Android MERGED in no build/release (#233, #234, #240, #241, #243, #245; #245 merged on the owner's request before its emulator job finished, all other checks green). MY open items: deferred buddy minors (PRs #238, #242 bodies); BACKLOG 0.0-aj (flaky LearnViewModelTest), 0.0-ak (export paging); deferred buddy minors are listed in PR #238, small 0.0-ae leftovers. OWNER-only items: device checks (create a team; with a FAILED network, the Teams screen must say 'Couldn't load your team' with Try again, never the create/join forms; join it with the code, auto-join, and open the team screen on each platform; web: finish a lesson then open the team screen, check `friend_activity_events` gets a row and an export now lists challenge_completions/duel_queue/season_*; iOS: goal card, team mission card; Android: `DEVICE-CHECKLIST.md` goal and team mission sections), web phone-width look, sign the demo user out in Supabase Auth, anti-bot lesson rule, French/Spanish save (needs per-pack answer-language tagging), confirm the app's minimum age/age rating before any stranger matching ships, cut the next iOS build (then re-check App Store privacy answers, 0.0x), MINT pilot (deferred again 2026-10-06, owner asked to be reminded). Worktrees: `main` plus the three held ones (-android, -assetlinks, -tanstack). `DEFERRED-WORDS.md` and `AUDIT.md` are marked STALE; this file is the only maintained list.

---

## 0.0-am App Store release, 2026-10-09 and 2026-10-10 — historical checklist; current external state unverified

> **2026-10-19 reconciliation:** The checklist below is an older release snapshot. In particular, its “WAITING” list and build 50/51 state are not current evidence. The older §1.1 history says the Paid Applications Agreement was signed 2026-09-23, while a later §0.0-am note says it was still awaiting activation; these statements conflict. Current agreement, subscription products/offerings, exact candidate build, screenshots, demo account, privacy answers, and submission state must be re-checked in App Store Connect/RevenueCat/TestFlight by the owner and recorded with timestamps. Code review cannot settle those account facts.

**DONE (with evidence):**
- ~~Private teams listed on the global board~~ **DONE 2026-10-09, #272** (`get_team_leaderboard` hides private teams from non-members; migration `20261013100200`, prod dry run, deployed).
- ~~Private teams readable at the table level (team names, owners, member lists visible to every signed-in user)~~ **DONE 2026-10-10, #273** (policies `teams_select_visible` and `team_members_select_own_team`, helper `_my_team_id()`, migration `20261013100300`; prod dry run: stranger 0 rows, owner own rows only; `get_my_team` winner stays global by design because it only decides the payout).
- ~~Save word failed on a stalled AI lookup~~ **DONE 2026-10-09, #272** (two attempts of 9 s, retry only on timeout, network error or 5xx).
- ~~AI replies took 17 to 88 s~~ **DONE 2026-10-09, #269** (the chat model's reasoning is switched off on every call; prod: chat 0.8 s, define-word 1.5 s).
- ~~New accounts saw a blank white screen after first sign-in~~ **DONE 2026-10-09, #267**.
- ~~Name filter gaps (self-harm phrases, drug names, impersonation of staff, display and team names)~~ **DONE 2026-10-10, #275** (`name_policy_blocked`; real-name false positives checked: Thai names containing "porn" and Hector/Alphonso alone are allowed, brand plus a role word is blocked; prod dry run 15 blocked, 14 allowed, 0 existing names affected; migrations `20261014100000` and `20261014100100`). Evasions are queued below.
- ~~Sign-in email contained a magic link that could consume the code~~ **DONE 2026-10-10, #275 plus the template update** (the email shows the code only; applied by the `configure-auth-emails.yml` job, run 38029172545).
- ~~`admin_users.added_by` foreign key~~ **DONE 2026-10-10, #275** (ON DELETE SET NULL).
- ~~Speech-to-text temporary debug log~~ **DONE 2026-10-10, #275** (removed).
- ~~Review notes put Duels under Profile~~ **DONE 2026-10-10, #275** (Friends; notes also say Duels shows no names and that the kill switch pauses messages too).
- ~~Privacy policy "Last updated" date stale~~ **DONE 2026-10-10, #275**.
- ~~Age rating tool could not read the declaration (403)~~ **DONE 2026-10-10, #276** (reads through the app info relationship) and **#277** (an override of NONE means no override). The owner kept 13+ in ASC.
- ~~Marketing site claims out of step with shipped content (W9b-2)~~ **DONE 2026-10-10, marketing #2** (1,767 lessons, 5 question formats, 12 scenarios, 5 tiers, 4 themes, hearts copy; the claims guard is extended; live /features has 0 stale strings).
- ~~Screenshot test skipped the lesson shot~~ **DONE 2026-10-10, #274**.
- ~~Vocab photos pass 2 (415 to 730)~~ **DONE 2026-10-09, #268; ships in BUILD 50** (revised from build 51; see the 0.0-al note).
- ~~Podcast unguarded position upsert for a left episode~~ **DONE 2026-10-09, #270**.
- ASC writes **DONE 2026-10-10**: listing metadata, release type MANUAL, beta review info, build 50 attached, build 49 expired; builds 1 to 48 expired 2026-10-09.
- Final 10-domain audit on `1972148`: 0 BLOCKER, 0 HIGH (9 LOW, all accepted or backlogged).

**WAITING (all OWNER-side or gated on the Paid Apps Agreement):**
1. Paid Apps Agreement to Active (OWNER-ONLY: accept terms, bank, tax).
2. Paywall re-test on a device (checklist section 2).
3. Subscription review screenshot (the current one is the broken 2026-09-23 paywall).
4. Screen recording of the app walkthrough, then the `REVIEW_RECORDING_URL` secret, then the review-notes apply.
5. App Store screenshot upload: the set is captured; waits for the owner's Hector shot and approval.
6. Demo account reseed, AFTER the screenshots; then freeze the review account.
7. The final gate, then DECISION-2 and the owner's explicit OK to submit.
8. Confirm the App Privacy answers are published in ASC (OWNER-run; not evidenced yet).

**BUILD 51 (queued, not blocking build 50):**
> **2026-10-16 check:** build 50 external state is `BETA_APPROVED` (asc-release-ops `testflight 50`, run 38989433846); build 51 = main `a9da1dc`, VALID, not attached or submitted. Items below struck through were closed by #291-#299 (merged 2026-10-12). Later 2026-10-16: #281, #300-#304 merged (no Android build cut), #305 docs; see 0.0-al for pg_net and the Android gates.
- ~~Offline sync backoff~~ **DONE #291** (30 s retry, no backoff growth on no-connection).
- ~~Replay XP estimate overstates a replay~~ **DONE #291** ("Up to +N XP once it syncs").
- ~~Offline Practice copy says "check your AI settings"~~ **DONE #291** ("You're offline").
- ~~A2 placement shows the A1 pill until relaunch~~ **DONE #291** (level reload after onboarding/placement).
- ~~French and Spanish scenario descriptions are still English~~ **CLOSED, WON'T FIX 2026-10-12** (owner: English is the data file's design rule).
- ~~Widget "Studied today" stale after midnight; widget name~~ **DONE #291**.
- ~~"Dancing" alt text~~ **DONE #294**.
- ~~Name-filter evasions: Cyrillic look-alikes~~ **DONE #292** (nine look-alike letters folded). ~~Leetspeak~~ **VERIFIED 2026-10-16** (rolled-back prod probe: `moderation_fold` maps digits, so p0rn, s3x, k1ll yourself, 4dmin, m0derator, 0nlyfans, m3th are blocked; B3n, Ann4, Hector, Alphonso allowed). ~~Slang spellings `noods` and `pron`~~ **DONE 2026-10-16, #304** (migration `20261018100000`, applied by the deploy and verified live; 0 existing names affected).
- The real upgrade test becomes 50 to 51 — STILL OPEN (needs a device; then expire 50).
- ~~Stale comment `ProgressSyncClient+SocialSafety.swift:74`~~ **DONE 2026-10-16, #300** (now names `teams_select_visible`; no behaviour change).

## 0.0-al Items from the App Store remediation, 2026-10-09 — OPEN (asked for as "0.0-ai"; that id is already used by the minimum-age decision at the end of this file)

- **Test account left behind.** `obsidianteamhq+qa1009d@agentmail.to` (Limrun QA run 2) was NOT deleted: the QA subagent's inbox read was denied. Delete it in the app (Profile, Settings, Delete My Account) or have the owner do it. Owner decision: clean up later. The accounts `+qa1009a`, `+qa1009e` and `+qa1009f` were already deleted; confirm no others remain (`obsidianteamhq@agentmail.to` itself is the App Review account, never delete that one).
- ~~**Curriculum copy contains `--` in learner-facing text.**~~ **DONE 2026-10-16, #301** (7 source strings produced all 157; a consistency test now fails on any `--` in course data, mutation-checked; two `--` remain inside AI system prompts in campaigns/scenarios, never shown). Verified 2026-10-09 on origin/main: 157 strings in the bundled iOS curriculum JSON contain a double hyphen (English 1, Spanish 130, French 26), for example a unit description "Greetings, needs and everyday small talk -- more than one wording is right." in `ios/LearnWithAlphonso/Resources/curriculum-es.json` (the Android copy under `android/.../assets/content/` is generated from the same source). Hand to the content sessions: fix it in the web source (`src/data/curriculum*.ts` and the pack files), then re-run `scripts/export-ios-content.ts`; do not hand-edit the JSON (CI fails on stale exports). The owner's earlier estimate was about 158.
- **Android release gates** [2026-10-16: (1) quota copy and (3) empty-reply retry in #302, AiErrorCopy mirrors iOS TutorError; (2) hearts gate on lesson open in #303 (out-of-hearts screen, buy with XP, Review instead, offline gate); both MERGED 2026-10-16; (4) unchanged, device check only. No device run of either yet: DEVICE-CHECKLIST.md has a section for them.] **(original note, all four were OPEN, checked 2026-10-09 on origin/main `android/`; the old `LearnWithAlphonso-android` worktree is at 53f096c, before #199, so it is not the evidence):** (1) quota-exceeded copy: `AiConversationClient.kt` `errorOf()` (around line 112) reads only the `error` field, so a 429 shows the raw code `quota-exceeded`; the server sends `{error, resetsAt, message}` (`src/lib/ai-quota-response.ts:27`), shown as-is by `HectorScreen.kt:138` and `ConversationViewModels.kt:89`; fix: show `message`/`resetsAt` (iOS and web already do, `src/lib/quota-copy.ts`). (2) Hearts gate when a lesson opens: Android has no hearts check on open and no handling of the server gate from PR #260 (`LessonViewModel.kt:175` only decrements locally; iOS has `LessonPlayerView.swift` heartsGateState and an out-of-hearts sheet). (3) Empty AI reply: the server now answers 502 `{error:"empty-reply"}` (`src/routes/api/chat.ts:143-147`) and web retries once (`src/lib/chat-request.ts`); Android has no retry and would show the raw string `empty-reply` (chat at `AiConversationClient.kt:46`; `hector-respond` at `src/routes/api/hector-respond.ts:115` answers 502 `empty reply from model`). (4) Podcast position save: Android `PodcastPlayer.kt:166-181` already sends a stamp (`lastSeenUpdatedAt`, reset on `play()` at line 101) and handles `StaleWrite`, so the unguarded-left-episode problem iOS had does not appear to exist there; what remains is the same fix round the iOS player got (late save after leaving an episode, per-episode stamp history), unverified on a device.
- **Android and the iOS "empty container never loads" bug: NOT present (code check only).** On iOS the team mission and weekly challenges sections never loaded because their load was attached to a section that was empty until loaded. On Android the loads are not attached to the optional items: `LearnScreen.kt:77` (`LaunchedEffect(Unit) { vm.refresh() }`) and `LearnScreen.kt:81-83` (`LaunchedEffect(missionVm) { missionVm.refresh() }`) sit at screen level, `LearnViewModel.kt:66` loads in `init` and `LearnViewModel.kt:122` fetches the weekly challenges there, and the team screen refreshes from `TeamsScreen.kt:100` inside the has-a-team branch. The conditional items (`LearnScreen.kt:121-122`) only render the results. Not driven on a device, so keep it on the Android device checklist (`DEVICE-CHECKLIST.md`).
- **Podcast: unguarded position upsert for a left episode.** On main, `PodcastAudioPlayer.swift:495-497` sends no stamp when saving a non-current episode (`seen = isCurrentEpisode ? lastSeenUpdatedAt : nil`), so it can overwrite another device's newer row. Fixed on the open PR #270 branch (`origin/fix/qa-run2-ios`, commit d0c2410, `PodcastAudioPlayer.swift:509-515` guards it with the last stored stamp); [2026-10-10: DONE, #270 merged 2026-10-09.]
- **"AI-narrated" label in Listen.** The podcast audio is AI-narrated (Deepgram) from scripts we wrote. The review notes already say so (`src/lib/app-store/review-notes.test.ts:59-61`), but no UI string or policy page says it (git grep for narrated finds nothing in `src/routes` or `ios/.../Sources`). Recommended for transparency, not required: a short label on the episode screen and one line in the privacy policy / Listen page.
- **Vocab photos pass 2 (PR #268, draft).** [2026-10-10: MERGED 2026-10-09 and ships in BUILD 50, see 0.0-am] Merge after build 50 is submitted so it ships in build 51 (iOS bundles `vocab-images.json`, so it cannot be added server-side afterwards). The owner has approved all 315 images, uploaded them and re-seeded (730 rows, 0 pixabay); the PR also adds the guard `src/lib/scripts-undefined-names.test.ts` and fixes the missing import in the prune script. Known cosmetic item: the pass-1 "bombero" photo shows "BOMBEROS" truck text, owner-approved, can be replaced in build 51.
- **NVIDIA benchmarking key file.** The owner saved a key to `~/.alphonso-secrets/nvidia.env` for the latency benchmark behind PR #269. If it was a separate key from the one in Vercel, the owner may revoke it on build.nvidia.com (OWNER-ONLY; never print or copy it).
- **Move `pg_net` out of the public schema** [2026-10-16 INVESTIGATED, recommend NOT moving: pg_net 0.20.4 is not relocatable, so a move means DROP + CREATE EXTENSION in prod on the push, report-alert and maintenance-sweep path; it places 0 objects in public (27 in `net`); the API exposes only public and graphql_public (PGRST106 for `net`). Separate finding: anon and authenticated hold the Supabase-default EXECUTE on `net.http_*` and SELECT on `net._http_response`; unreachable today, and the three callers are SECURITY DEFINER owned by postgres, so an optional REVOKE migration looked safe. **2026-10-16 owner asked for the REVOKE; NOT POSSIBLE by migration:** the grants (EXECUTE on `net.http_*` via the default PUBLIC grant, ALL on `net._http_response` to PUBLIC, USAGE on `net`) belong to `supabase_admin`, and `postgres` is not a member, so the REVOKE is a silent no-op (rolled-back test). Only Supabase could change them. Documented in `docs/operations.md` and ARCHITECTURE Known rough edges (#305). Item CLOSED as won't-fix with that mitigation.] (Supabase advisor finding, extension in public). It was created by `supabase/migrations/20260921030000_remote_push_notifications.sql:18` (`CREATE EXTENSION IF NOT EXISTS pg_net`) and is used by the push and report-notification triggers (`20261008130300_content_reports_moderation_ops.sql`). Checked 2026-10-09: this backlog had no earlier entry for it, so this is the first. Moving it means re-pointing the trigger functions' `net.http_post` calls, so do it as its own migration with a rolled-back probe of the triggers.
- ~~**Leftover worktree folders**~~ **DONE 2026-10-16** (repo has only `main`; `.claude/worktrees` and `../LearnWithAlphonso-worktrees` removed; 60 merged remote branches and the closed #282 branch deleted). Original note: `D:\AgentDevWork\repos\LearnWithAlphonso\.claude\worktrees\w1` still exists (contains `android/`) and is NOT a registered worktree (Windows long-path removal failed); `w9` is already gone. Other unregistered leftover folders: `a11y-sync-main` (empty), `account-deletion-export`, `display-name-and-teams`, `session-persistence-apple-revocation`, `test-coverage`, `theme-manuscript`, `ui-ux-redesign`. Registered worktrees and their branch state: `docs` (docs/refresh-2026-10-09, no PR yet, in use), `nothink` (fix/ai-thinking-off, #269 MERGED), `w10` (feat/binary-polish, #264 MERGED), `w11` (feat/release-tooling, #265 MERGED), `w11b` (fix/qa-run2-ios, #270 OPEN, keep), `w1c` (feat/vocab-photos-pass2, #268 OPEN draft, keep), `w2a` (feat/voice-engine, #258 MERGED), `w3` (feat/report-ai-replies, #263 MERGED), `w4` (feat/learning-flow-ios, #261 MERGED), `w8` (feat/podcast-player-library, #262 MERGED). Outside `.claude`: `LearnWithAlphonso-android` (android, #200 MERGED), `LearnWithAlphonso-assetlinks` (android-release-workflow-sync, #199 MERGED), `LearnWithAlphonso-tanstack` (fix/bump-tanstack-start, #202 MERGED). Remember the junction rule (rmdir a node_modules junction before removing a worktree) and use the `\\?\` long-path prefix for deep folders. Stale local branches also remain (`remediation/w*`, `release/build-50`, `feat/learning-flow-server`, `fix/name-onboarding-cover`, `docs/buddy-status`).
- **CI types-freshness split: already done, not open.** It was decided earlier and built: PR #204 (3969bb5) made it the non-gating job `types-fresh` (`.github/workflows/ci.yml:60`), recorded in 0.0-i. Only the false-positive on table-adding PRs (0.0-h) remains.
- **After App Store approval: switch support, privacy and report mail back to the owner's gmail (item 0.0-x).** Still open and OWNER-ONLY: edit the one `forward-email=` TXT record on the `alphonsoecosystem.app` Netlify zone to point at `obsidianmedia.yt@gmail.com`, then send a test mail. The same moment: remove `REVIEW_DEMO_CODE_KEY` from Vercel production and consider deleting the review account (`obsidianteamhq@agentmail.to`). Note the report-alert route now emails `report@alphonsoecosystem.app` (owner step done 2026-10-08), so that alias matters more than when 0.0-x was written.

---

## 0.0-af XP payouts keyed on `profiles.active_language` pay nothing to non-English learners — FIXED and LIVE (PR #236, merged and deployed 2026-10-06, verified on the deployed functions)

`get_weekly_challenges` (+100) and `get_my_team` (+100 team bonus) now pay the language of the learner's most recently completed lesson, in `20261006170000_fix_team_joins_and_course_aware_payouts.sql`; verified live in rolled-back transactions (French-only learner +300, Spanish team member +100, member with no lessons 0). Nothing needed repairing retroactively. Open question for later: `profiles.active_language` is dead (nothing writes it): drop it or start writing it.

## 0.0-ah TEAMS AND WEEKLY QUEST CLAIMS WERE BROKEN IN PRODUCTION — FIXED and LIVE (PR #236, merged and deployed 2026-10-06; found while doing 0.0-af)

`_join_team_impl` (behind join_team, join_public_team, auto_join_team, create_team) and `get_my_team` used an unqualified `team_id` while returning a `team_id` column: plpgsql run-time error 42702, so nobody could create or join a team and a member could not load their team, on web, iOS and Android. Production had 0 team members, so it went unseen; the weekly team bonus never paid anyone and the team mission card's screen was unreachable. The reviewer then found `claim_weekly_quest` (`SELECT xp INTO cur_xp ...` while returning an `xp` column): no weekly quest could be claimed on any platform; proven live (deployed fails, fixed pays once then already-claimed) and fixed in the same migration. Fixed by qualifying the references; guard `src/lib/plpgsql-output-column-clash.test.ts` fails on the class. Proven live in rolled-back transactions. **Follow-ups (mine):** [2026-10-09 audit: follow-up (1) is DONE for the web (src/lib/teams.functions.ts:124 now throws on an RPC error instead of showing 'no team'); iOS/Android error states and the owner device check are not verifiable from code.] (1) the web `getMyTeam` ignores the RPC error and shows 'no team', which hid this: make it surface an error state, and check iOS/Android error handling on the Teams screens; (2) create a team and join it as a real signed-in user on each platform (owner-run device check, listed in the snapshot): the DEPLOYED functions were already exercised end to end as seeded users in a rolled-back transaction after the deploy (create, join by code, auto-join, get_my_team, members, leaderboard, mission, kick, quest claim twice, French-only weekly challenges: all correct, nothing left behind). Lesson: a text test cannot see a run-time SQL error, and an early-exit 'ok' proves nothing; EXECUTE new SQL functions as a seeded user in a rolled-back transaction.

## 0.0-ag Dead `mergeGuestProgress` endpoint removed 2026-10-06 (team-mission PR)

It was exported, unused, and let any signed-in user insert up to 500 arbitrary `lesson_completions` rows; `src/lib/lesson-completions-writers.test.ts` now fails the build if any file other than `sync.functions.ts` writes that table.

## 0.0-ae Public table privileges (Supabase defaults) — DONE 2026-10-06 (PRs #227, #228, #229, live)

**Done and verified live:** (1) #227 anon writes + TRUNCATE/TRIGGER/REFERENCES gone, new tables start closed, CI guard `migration-grants.ts`. (2) #228 34 tables lost authenticated INSERT/UPDATE/DELETE that no policy backed (0 left); found and fixed a live bug (web `completeLessonRemote` fed `friend_activity_events` through the RLS client, so XP-earning completions showed 0 XP); guard `rls-client-writes.test.ts`. (3) #229 anon keeps SELECT on only the 9 public content tables (signed-out reads of the rest now 401), authenticated lost SELECT on 4 server-only tables, and four export tables got own-row SELECT policies: **the GDPR export had been silently omitting challenge_completions, duel_queue, season_cohort_members and season_placements**; `exportMyData` now also throws on any table read error. Live check: grants, 4 new policies, migration 20261006140000 applied. Rule, snapshot, rollback: `docs/database-privileges.md`.

**Left, low value / needs care:** `content_reports` and `teams` keep SELECT (insert WITH CHECK may need the column privilege; column-level grant). Tables created by supabase_admin (dashboard/extensions) keep the old defaults, so create tables through migrations.

**NOT verified live (needs a signed-in session):** a real web lesson completion writing the friends-feed row, and a real data export now containing the four tables. After the next device/browser check, query `friend_activity_events` for a fresh row and run an export.

## ~~0.0-ad Vercel REFUSED to build `main` (vulnerable @tanstack/react-start)~~ **DONE 2026-10-05, PR #202 (e022132) + #203 (859f422)** — root cause of the tsc break was two router-core copies; bumping react-router 1.170.41 + router-plugin 1.168.42 deduped them. Prod deploys READY.

Symptom: since about 2026-10-01 evening, every Vercel build of this repo fails for both projects (`learnwithalphonso` and `learnwithalphonso-admin`) with: "Vulnerable TanStack Start package detected (@tanstack/react-start@1.168.56). Please update to a patched version. To deploy at your own risk, set DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS=1 and redeploy." Seen on the production build of the #199 merge (4e1491e, state ERROR) and on the android PR preview. The last successful production deployment is `f28a0f8` (READY) and it keeps serving: nothing is down, but NO new commit on main can deploy to Vercel until this is fixed. The currently running site was built with the same flagged version before the check started.

Facts: `package.json` ranges `^1.168.52`; `bun.lock` pins 1.168.56 (introduced by commit 5a66f30). npm "latest" on 2026-10-01 is 1.168.60 (UNVERIFIED as the patched version; I could not find the advisory text; the search only found an unrelated supply-chain incident for 1.167.68-71). Not caused by the Android merge (android and main share the same lock).

Do: read the actual advisory, bump to the patched version (lock plus `bun install --frozen-lockfile`, lint/typecheck/tests/e2e), ship as a PR, confirm the Vercel deploy goes green. Do NOT set the DANGEROUSLY_DEPLOY flag. This ships web/API code, which our rule says to avoid during App Review, so the owner decides whether to wait for approval; the longer it waits, the longer main cannot deploy.

**PR #202 (fix/bump-tanstack-start) status at session close, 2026-10-01 ~7:40 pm ET:** OPEN, NOT merged, pushed. Bumps `@tanstack/react-start` `^1.168.52` -> `^1.168.60` (latest published; lock was 1.168.56). Worktree: `D:\AgentDevWork\repos\LearnWithAlphonso-tanstack`.
- GOOD: both Vercel preview deployments (`learnwithalphonso`, `learnwithalphonso-admin`) went READY, so Vercel's "vulnerable TanStack Start" block is lifted by 1.168.60. `bun run build` passes locally. e2e, deno-tests, admin-build, ios-swift-tests, ios-app-build passed in CI.
- BAD: CI job `lint-and-typecheck` FAILS at `tsc`: `Property 'server' does not exist on type RouteOptions` / `Object literal may only specify known properties, and 'server' does not exist` in every `src/routes/api/*.ts` and `*.test.ts` (plus implicit-any on `request`). Lint itself passed (1 pre-existing warning).
- HYPOTHESIS (unverified): the lock now holds two copies of `@tanstack/router-core` (root `1.171.32` vs nested `1.171.34` under react-start/react-router/start-*), so the `server` type augmentation lands on a different copy than the one `createFileRoute` uses. Things to try: align versions (bump `@tanstack/react-router` / `@tanstack/router-plugin` direct ranges to the newest so one router-core is hoisted), or add an `overrides`/`resolutions` entry for `@tanstack/router-core`, then `bun install`, `bunx tsc --noEmit`, `bun run lint`, `bun run test`, `bun run build`. Do NOT set the DANGEROUSLY_DEPLOY flag. If it cannot be aligned, the fallback is an older unflagged react-start version (untested).
- AFTER GREEN: merge (merge commit), verify the production deployment of the merge commit is READY, then smoke test the site (sign-in, one Hector turn, admin loads). This ships web/API code while Apple review is pending; the owner chose to do it now.
- Cleanup after merge: remove worktrees `LearnWithAlphonso-tanstack`, `LearnWithAlphonso-android`, `LearnWithAlphonso-assetlinks` (branches already merged) and delete merged remote branches (android, android-release-workflow-sync, chore/simulator-app-artifact, fix/bump-tanstack-start); the empty folder `LearnWithAlphonso-worktrees` is not a worktree.

## 0.0-ac Differentiator features from the Shipaton 2026 competitive research — PARTLY DONE (reconciled 2026-10-19)

**2026-10-19 status:** #2 study together and #8 goal planner are complete on web/iOS/Android. #3 hands-free Hector is implemented (#315); #4 save-any-word now has Android support (#325) and transcript-course work (#326), with French/Spanish language-awareness and accessibility follow-ups still requiring review; #10 paywall placement/annual-plan code is implemented (#314). The remaining #1, #5, #6, #7 and #9 are optional product initiatives, not launch blockers. Preserve the following older planning notes as history, not current status.

Source: `D:\AgentDevWork\repos\Hackaton\Shipaton\competitive-research-report-2026-10-01.md` (46 direct competitors read from their Devpost pages; data in `Shipaton\competitor-data\`). The report states what is verified and what is directional. Rough findings: nobody in the field has real traction (26 live on the US App Store, the most-rated has 6 ratings), LWA's edges are curriculum depth (1,767 lessons), the social layer (friends, leagues, duels, teams), privacy/consent, a server-gated paywall and design polish. Do these AFTER the prerequisites below, and after the app is approved (no main/backend changes during App Review).

**Prerequisites (do first; both already tracked above in §0.0-z):** (a) the consent gate that blocks lessons, (b) Hector's slow replies (~36 s; the first turn in the demo recording took ~10 s, the second never returned). Do not market a "voice tutor" before (b) is fixed.

Ranked by fit with what LWA already owns, difficulty for rivals to copy, and how visible it is in 30 seconds. Each is a candidate feature, not a commitment; spec and re-rank before building.

1. **Canada-first test prep (TEF / TCF / CELPIP / IELTS mapped to NCLC/CLB).** None of the 46 competitors target immigration or exam outcomes. Uses existing CEFR levels, speaking practice and French/English courses; links to the owner's French PR coach idea (`Hackaton\Venture-French-PR-Coach`). A "Test mode": timed speaking tasks plus a CLB/NCLC *estimate*. Risks: present results as estimates only, never imply endorsement by any testing body or immigration authority; needs a legal read of the launch copy.
2. **Study-together layer on the existing social stack.** [DONE (verified 2026-10-09): complete on web, iOS and Android (server + web #230-#232, #236, #238, #242, #244; iOS/Android #233, #234, #240, #241, #243, #245), matching kill switch supabase/migrations/20261007120000_buddy_matching.sql:6.] *(2026-10-06: IN PROGRESS. Spec `docs/superpowers/specs/2026-10-06-study-together-design.md` (team missions + language buddies; buddies talk by preset messages only, NOT free text, because free text would change the App Store submission). Phases: 1 team mission server+web (MERGED #230/#231, live), 2a Team player badge (MERGED #232, live), 2b iOS mission card (MERGED #233, in no build), 2c Android mission card (MERGED #234, in no release; Part 1 complete), 3-6 buddy pairing/goal and preset messages (NOT started), 3 buddy pairing/goal server+web, 4 native, 5 presets server+web, 6 native. Plan `docs/superpowers/plans/2026-10-06-team-mission-web.md`.)* Team weekly missions and shared goals, a "language buddy" matched by level and goal. Rivals are solo experiences; LWA already has teams, duels, block/report. Cheap incremental work with a retention payoff.
3. **Hands-free Hector ("walk-and-talk").** Hector usable with the screen locked and earbuds, reusing the existing background-audio mode (WalkLingo proves the demand). Needs a hands-free turn-taking design (wake/stop control, safe-use warning).
4. **Save-any-word everywhere.** [PARTLY DONE (verified 2026-10-09): web + iOS built; no save-any-word code under android/ (git grep for define-word/SavedWord finds nothing there); FR/ES lessons and keyboard access still deferred as written below.] *(2026-10-05: IN PROGRESS. Spec `docs/superpowers/specs/2026-10-05-save-any-word-design.md`, plan `docs/superpowers/plans/2026-10-05-save-any-word-phase1.md`. Phase 1 = backend PR #211 (migration + `define` quota + `/api/define-word` + saved_word grading) then iOS PR B (Hector replies only). Phases 2-4: Practice/Campaign, lessons + transcripts, web. Decisions: AI meaning at save time, multiple-choice card, own `define` quota 40/day, 500-word cap, first review due tomorrow. Gotcha found: any CREATE OR REPLACE of the quota functions must be based on the LATEST definition (stt = 300). DONE 2026-10-05: backend PR #211 merged + verified live, types regenerated (a1cabce), web review page renders saved_word, casts removed (all in iOS PR B). PR B (#212) also fixed, from CodeRabbit: the clamp now counts UTF-16 units like the server, and SaveWordSheet refreshes its token. NOT in Android: the Android app has no save-any-word yet (add when Android catches up). PHASE 2 DONE 2026-10-05 (PR #213): Practice + Campaign replies tappable via the shared TappableText; tapped-sentence-by-offset, isLetter = category L (server's \p{L}), words >40 units not linked. PHASE 3 BUILT 2026-10-05 (PR pending/merged: see CHANGELOG): English-course lesson + review EXPLANATIONS and podcast TRANSCRIPTS are tappable (an iOS transcript reader exists: PodcastTranscriptSheet). DELIBERATELY NARROWER than the spec: lessons are English-course only and explanation-only because fr/es lesson text mixes languages (a tapped English word would be filed under French) and prompts could give an answer away; enforced by Kit SavedWordPolicy. FOLLOW-UP (needs a way to tell course-language text from interface text): fr/es lessons and prompts. Also: a "Tap a word to save it." hint shows under explanations the first 3 times (Kit SavedWordHint). VoiceOver: AlphonsoTipCard becomes a .contain container ("Incorrect.") when words are tappable so they are reachable (UNVERIFIED, needs a device with VoiceOver); the plain "Correct." caption still uses an accessibilityLabel on the TappableText and is probably not reachable (consider an accessibilityAction "Save a word"). Nested sheets in the transcript (transcript -> save -> disclosure) need a device look; podcast episodes are assumed English. Deferred minors: [GeneratedPracticeSection explanation: DONE in PR #219 on web and iOS]; the environment closure is rebuilt each body evaluation (harmless). PHASE 4 (web) BUILT 2026-10-05 in PR #216 (live on merge; same route, no backend change): tappable words in Practice/Campaign replies, lesson+review explanations (English only) and podcast transcripts; dialog states what is sent BEFORE sending; privacy policy updated in the same PR. NOT VERIFIED in a browser (inline word-button layout in bubbles, dialog at phone width, real screen readers, buttons inside the aria-live chat log). DEFERRED (from the fresh reviewer): every word being a <button> degrades screen-reader prose navigation and breaks drag-select/copy of tutor replies and transcripts (consider role=text/span or a long-press model); [sentence splitter at abbreviations: DONE in PR #217]; the playing transcript still re-renders per timeupdate (words are memoised, the panel is not). DEFERRED: keyboard-only users cannot reach transcript words (tabIndex=-1 on purpose; needs a roving-tabindex or a 'save a word' picker); [GeneratedPracticeSection: DONE in #219]; French/Spanish web lessons. RELEASE GATES FOUND 2026-10-05 (privacy): (1) [DONE by #216 for the web policy; keep (2)] src/routes/privacy.tsx already says review items are stored (so saved words are covered as stored data) but its NVIDIA line says only "grades written translation answers" -- it does NOT say a saved word + its sentence are sent to NVIDIA to write the meaning and options. NOT changed yet on purpose (no build contains the feature; the policy must describe what is live). UPDATE IT IN PHASE 4 together with the web save UI, because the web ships the moment it merges. (2) When the FIRST iOS build containing save-any-word is cut: re-check the App Store Connect App Privacy answers and ios/LearnWithAlphonso/PrivacyInfo.xcprivacy (per 0.0x, App Privacy describes the current binary; declare it when the build ships, not before). Deferred minors still open: chunk splitting leaves a closing quote at the start of the next chunk and splits abbreviations ("Mr."); (CLOSED in #213: isLetter now requires every scalar to be a letter after NFC, with a scalar-sweep parity test); CRLF is one Character and not a sentence terminator; fit() anchors on the first occurrence inside an over-long tapped sentence; test helper duplicates TappableText's offset loop (move it into the Kit); validateSavedWordInput/migration-test minors. DEVICE CHECK OWED: tap a word in a Hector reply (sheet opens with the right sentence), Save shows the meaning, saving again says "Already saved", the card appears in Review the next day, wrong/right verdicts, airplane mode shows the offline message, large Dynamic Type keeps Save/Done reachable.)* Tap a word in a Hector reply, a lesson or an audio-library transcript, save it with its sentence context, feed it into SM-2 review. Closes the gap with Unipod, Kalima, Vocabloot and Lexa.
5. **Phoneme-level pronunciation feedback.** Table-stakes catch-up (BlablaFrench and Tapas Talk score per phoneme; Twaddle per word). Needs a speech-assessment service; price it before enabling for free users.
6. **Alphonso as a character with illustrated scenes.** Turn Practice scenarios into scenes where the llama and other characters react to what you say (TownTalk shows the pull). Brand-fit and screenshot-friendly.
7. **Camera vocabulary.** Photo of an object becomes a word in the learner's language, saved to review (Vocabloot's hook). Needs a vision model and a per-use cost check.
8. **Goal and timeline planner.** [DONE (verified 2026-10-09): all three parts merged (#223 web, #225 iOS, #226 Android); device checks remain owner-only.] *(2026-10-06: WEB PART 1 MERGED as PR #223 (live on merge): table `learning_goals`, `/api/learning-goal`, pure `planGoal`, GoalCard on the Learn page, privacy line. Spec `docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md`, plan `docs/superpowers/plans/2026-10-06-learning-goal-planner-web.md`. PART 2 iOS MERGED as PR #225 (2026-10-06; in no build; SwiftUI layer compiled by CI only, NOT run on a device: add to the device checklist 0.0-ac #4 the goal card layout, setup sheet, VoiceOver, Dynamic Type, offline cache). iOS deferred minors: every URLError is 'offline'; no VoiceOver announcements on errors; cache survives sign-out (per-user key, lingers on a shared device); .task(id:) in a lazy List refetches on scroll-back; expired goal opens the sheet out of range; Dynamic Type of the preset buttons; iOS pre-selects 6 months while web starts empty. PART 3 ANDROID MERGED as PR #226 (2026-10-06; code merged, NOT released to Play; Compose layer compile-checked and CI emulator-smoke-tested only, not driven on a device: see android/LearnWithAlphonso/DEVICE-CHECKLIST.md 'Learning goal'). ALL THREE PLANNER PARTS ARE DONE. Android deferred minors: offline cache survives sign-out/account deletion (keyed by user id); picker 'today' is UTC. [was: REMAINING part 3 Android (client + ViewModel + Compose; store release owner-gated), device checks, then re-check App Store privacy answers when the first build with it is cut. NOT verified: the card in a browser/phone width/screen reader. Deferred minors: days are UTC both ends; no confirmation on Remove; course change mid-setup discards the panel; level select defaults to B1 for everyone; loading state not in a live region. Owner decisions: finish-the-level meaning, 14/35 lessons-a-week warning limits (named constants), free and Pro both get it.)* "B1 French by March": placement exists; add a weekly plan and a progress report (Lexa and Ilo show demand).
9. **Human-reviewed content badge.** Only if real human review is done (BlablaFrench and Molo lead here). The in-progress Spanish/English content audits could become this story; do not claim review that did not happen.
10. **Monetization upgrades.** Annual plan, optional lifetime, win-back offers, and a paywall shown where it is needed (when a free limit is hit or Hector is requested) with the source tagged in RevenueCat; consider a reverse trial. Today LWA has one monthly price and a 2-week trial.

Other gaps the report flagged, lower priority: more interface/explanation languages (Loopify 29, Vocabloot 24, Inko 18; ours is English-first), Android (14 of 46 competitors ship on Google Play; the Android work exists, owner-gated), a reading mode (Kalima), more widgets (only 6 of 46 have any; LWA has a streak widget).

Cost and scope notes: Hector, speech, and any pronunciation or vision service cost money per use, so price each tier before widening free access. Items 1-4 are months of work for this team size; the bug list comes first.

## 0.0-ab Demo seed writes the CEFR level to user_progress, not to language_progress, which both apps read — FIXED in PR #218 (2026-10-05; seed not re-run, existing seeded accounts keep A1)

`scripts/seed-demo-account.ts` upserts `user_progress.cefr_level = "B2"` and `language_progress.placement_level = "B2"`, but never `language_progress.cefr_level`. Both `ProgressSyncClient.fetchCEFRLevel` (iOS) and the Android port read `language_progress.cefr_level`, so the seeded account's Learn tab opens on whatever that column holds (A1 in the Android store screenshots of 2026-09-30). Either the seed should set `language_progress.cefr_level` too, or `user_progress.cefr_level` is dead data. One line in the seed either way.

## 0.0-aa iOS screenshot workflow prints the demo account's refresh token in CI logs — CODE FIXED 2026-10-05 (PR #207); OWNER STEP STILL OPEN: sign the demo user out in Supabase Auth so tokens already in old logs die (found 2026-09-30 while dry-running the Android release workflow) — PARTLY DONE (verified 2026-10-09: code part is on main, PR #207, scripts/export-masked-env.sh is used by capture-app-store-screenshots.yml:87, ios-ui-compat.yml:60 and maestro-e2e.yml:80; the owner step of signing the demo user out in Supabase Auth is OWNER-ONLY and cannot be verified from code, so it stays OPEN)

> **2026-10-05, PR #207:** new `scripts/export-masked-env.sh` (tested, mutation-checked) masks each value before exporting; `capture-app-store-screenshots.yml` AND `maestro-e2e.yml` (same leak, not named below) now use it. `android-release.yml` already had its own inline copy. The workflows were not dispatched; first real run should show `***` for the tokens.

`capture-app-store-screenshots.yml` appends `scripts/mint-demo-session.ts`'s output straight to `$GITHUB_ENV`. Values added that way are not secrets to GitHub, so `UI_TEST_REFRESH_TOKEN` (and the user id) print in the clear in every later step's env dump of a public repository's job log; only `UI_TEST_ACCESS_TOKEN` happened to be masked. A refresh token for the demo account is low value but real: anyone reading the log can mint sessions for that account until the token rotates.

Fix (done for the Android workflow in `android-release.yml` on the `android` branch, same shape): write the script output to a temp file, `echo "::add-mask::$value"` for each value before appending it to `$GITHUB_ENV`, delete the file. Then rotate: sign the demo account out everywhere (Supabase Auth, Users, the demo user, "Sign out user") so the tokens already in old logs stop working.

## 0.0-z Android: Google accounts used for Firebase and Play are provisional — OPEN (owner decision 2026-09-30) — STILL OPEN, OWNER-ONLY (2026-10-09: console/account work, nothing in code can show it is done)

The Firebase project the Android app is wired to (`learn-with-alphonso-421a2`, secrets `FIREBASE_GOOGLE_SERVICES_JSON`, `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`) was created under a different Google account than the one the Play developer account will use, because the first account's organisation policy (`iam.disableServiceAccountKeyCreation`) refused to issue a service-account key and the owner chose not to keep fighting it. A first project, `learn-with-alphonso-13eeb`, was abandoned for that reason.

The Google Play developer account is being created on `obsidianmedia.yt@gmail.com`.

To do later, once Play is live and there is a quiet moment: move Firebase to the same Google account as Play (create the project there, re-download `google-services.json`, regenerate the service-account key, rotate the three secrets above and the two Supabase Edge Function secrets, ship a build), then delete the provisional project. Nothing user-facing depends on which account owns Firebase; this is hygiene, not a blocker. See `android/LearnWithAlphonso/OWNER-SETUP.md` (branch `android`) for the secret names.

## 0.0-z Found while recording the Shipaton demo (2026-09-30) — OPEN, next build after approval — MOSTLY DONE (verified 2026-10-09: items 1-5 fixed on main, see the per-item notes; item 6 cannot be verified from code)

Observed on build 49 (Limrun simulator and the owner's iPhone). None
block review; all are worth one follow-up build.

1. **No display name.** *(DONE (verified 2026-10-09: PR #264 734bf38, ios/LearnWithAlphonso/project.yml:137 INFOPLIST_KEY_CFBundleDisplayName "Alphonso"))* The home screen shows "LearnWithAlpho…" and the
   system permission prompts read "“LearnWithAlphonso” would like to
   access the Microphone / send you notifications" — reviewer-visible.
   Fix: `INFOPLIST_KEY_CFBundleDisplayName: "Alphonso"` (or "Learn with
   Alphonso", which truncates) on the app target in project.yml.
2. **Declining AI consent blocks every lesson.** *(DONE (verified 2026-10-09: PR #206 bf01787 plus account-level consent PR #257 8c1b9de; on main the iOS aiDisclosureGate remains only on CampaignView.swift:118, ConversationView.swift:124 and HectorView.swift:99, so neither lessons nor ReviewQueueView are wrapped any more; the stale "ReviewQueueView keeps its full-screen gate" caveat below no longer applies))* *(2026-10-05, PR #206, MERGED as bf01787 -- on main but in NO build yet (owner: merge now, don't cut a build); consent is now enforced where answers leave the device (`TranslationGradingPolicy` in the Kit for translations; `SpeakQuestionCard` types by default with a "Use your voice instead" opt-in) and the lesson is no longer wrapped. Local Kit tests could not RUN (Windows application-control block, WindowsError 4551); CI `ios-swift-tests` + `ios-app-build` are GREEN on 5bdb5be (verified 2026-10-05). Still needs a device look. Follow-up: a valid alternative translation is marked wrong for a never-opted-in learner; consider a contextual prompt. `ReviewQueueView` keeps its full-screen gate, so declining there still blocks the whole review queue -- not addressed.)* Original: `.aiDisclosureGate()`
   wraps all of `LessonPlayerView`, so "Not now" pops out of any lesson,
   including ones with no AI question. Gate only the AI-graded question
   cards (speak / AI-graded translate), and let the rest of the lesson
   run. Apple dislikes making core features depend on extra data sharing.
3. **Slow AI replies.** *(DONE (verified 2026-10-09: root cause was the reasoning model; PR #269 1b5115d turned reasoning off in both chokepoints, chat llm 801 ms and define-word 1.5 s measured in prod per the coordinator ledger; the Server-Timing instrumentation from #205 is at src/routes/api/chat.ts:166))* *(2026-10-05, PR #205: per-stage timing added to `/api/hector-respond` and `/api/chat` -- a `Server-Timing` header and one `[ai-timing]` log line per request. NOT a speed fix. Analysis from code + old logs: ~6 sequential network calls before the LLM starts (~1 s total, two are `getUser`); NVIDIA call has no `max_tokens`/streaming/timeout and has measured 4 s once and a 20 s timeout on retry, so provider latency is the likely cause. NEXT: after #205 deploys, do one real Hector turn + one Practice turn on a device, read the `[ai-timing]` lines, then choose: cheaper/faster model, hedged second request, or streaming. Do NOT add `max_tokens` blind -- it truncated real completions once (2026-09-30) -- and a timeout would convert slow-but-successful replies into failures.)* Practice → Order coffee on a real iPhone: first
   reply took ~36 s ("Thinking…"), later ones ~16 s, one never arrived
   within 24 s; Hector's first reply ~20 s. Check Vercel logs for
   `/api/chat` / `/api/hector-respond` / `/api/tts` timing (cold starts?
   NVIDIA latency? sequential STT→LLM→TTS with no streaming) — a reviewer
   waiting 30+ s may assume it's broken.
4. **Review sheet has no Close/Done button** *(DONE (verified 2026-10-09: PR #208 e7081db, ios/LearnWithAlphonso/Sources/ReviewQueueView.swift:94 Button("Done")))* — only swipe-to-dismiss.
   *(2026-10-05, PR #208, MERGED as e7081db, in no build yet: Done button added.)*
5. **Learn tab badge stale** *(DONE IN CODE (verified 2026-10-09: PR #208, Kit ReviewGradeOutcome at ProgressSyncClient.swift:129); a device look is still owed)* — still showed 2, then 3, after the review
   queue was cleared. *(2026-10-05, PR #208: two causes -- an online grade never updated the cached due list, and `SyncQueueStore` was not observable so SwiftUI never saw cache changes. Fixed via Kit `ReviewGradeOutcome.isStillDue` + `@Observable` store. Needs a device look.)*
6. **Paywall/"Continue to next lesson" button** *(CAN'T VERIFY from code (2026-10-09): a visual clipping claim; verify on a device or in a Limrun run with the largest text size. PR #264 and the QA run 2 largest-text work may have changed the layout.)* partly hidden behind the
   tab bar on the lesson-complete screen (scrolls, but looks clipped).

Tooling added: `.github/workflows/build-simulator-app.yml` (branch
`chore/simulator-app-artifact`, not merged yet) builds an installable
simulator .app for Limrun. Simulator-only caveats: signed without
entitlements, so no Keychain persistence (relaunch signs out) and no
Sign in with Apple. Limrun's `ios microphone play` did NOT reach the
app's AVAudioRecorder (silent audio, 4 attempts) — voice features need a
real device.

---

## 0.0-x AFTER APP STORE APPROVAL: point support/privacy/report mail back at obsidianmedia.yt@gmail.com — OPEN (do this once approved) — STILL OPEN, OWNER-ONLY (verified 2026-10-09: build 50 is not approved yet, so this cannot be done; the temporary forward-to-agent-inbox setting is DNS-side and not visible in code. src/routes/api/review-demo-code.test.ts still exists, so REVIEW_DEMO_CODE_KEY removal also stays pending)

**The account owner's explicit instruction (2026-09-29): once the app is
approved, change the forwarding destination back to
`obsidianmedia.yt@gmail.com`.**

What exists now (set up 2026-09-29 during the last pre-submission audit,
because `alphonsoecosystem.app` had no MX record at all, so every
published contact address bounced): Netlify DNS zone
`alphonsoecosystem.app` (zone id `6a9f5610b2925010f0cbc5f6`) has, at the
root domain:
- `MX 10 mx1.forwardemail.net` and `MX 10 mx2.forwardemail.net`
- `TXT forward-email=support:obsidianteamhq@agentmail.to,privacy:obsidianteamhq@agentmail.to,report:obsidianteamhq@agentmail.to`

Forward Email's free plan is DNS-only: the TXT record IS the whole
configuration. Temporarily pointed at the agent inbox during review so the
owner's gmail stayed out of public DNS and the agent could verify delivery.

**To switch back:** edit that one TXT record's value to
`forward-email=support:obsidianmedia.yt@gmail.com,privacy:obsidianmedia.yt@gmail.com,report:obsidianmedia.yt@gmail.com`
(Netlify -> Domains -> alphonsoecosystem.app -> DNS records). Leave both MX
records alone. Note the destination becomes visible in public DNS -- that's
how the free plan works. Then confirm with a test mail to
`support@alphonsoecosystem.app`.

Related post-approval cleanup, same moment: remove `REVIEW_DEMO_CODE_KEY`
from Vercel production (switches `/api/review-demo-code` off -- it 404s
without it) and consider deleting the review account
(`obsidianteamhq@agentmail.to`, Supabase user `f18c19fe-b7ca-451f-9243-0e2f99248ca2`).

---

## 0.0-y Last all-angles audit before submission -> builds 48 + 49 -> SUBMITTED — DONE 2026-09-30 (in review)

**Status update 2026-10-01:** Apple answered with Guideline 2.1 "Information Needed - New App Submission" (an information request, not a bug finding). The owner replied in Resolution Center at 2:03 am with a physical-device recording and items 1-7 (drafts: `Hackaton/Shipaton/03-submission-materials/apple-2.1-reply-short.txt`), but a reply alone did NOT re-queue the submission; it sat at Unresolved Issues until the owner pressed Add for Review / Submit at about 1:20 pm. Version 1.0 build 49 and the subscription are now WAITING_FOR_REVIEW. Still owed: append the same info to the App Review Notes field (not done by the agent; a script edit would be a main change during review). Lesson: after a Resolution Center reply, check the version page and resubmit.

**Submitted 2026-09-30 ~1:20am EDT, "Waiting for Review"**: iOS App 1.0
(build 49) + Alphonso Pro Monthly + Alphonso Pro subscription group, one
submission. Expedited Review requested (Shipaton: must be LIVE by Sep 30
11:45pm PDT).

Found and fixed (each a plausible rejection):
- Demo sign-in depended on a human relaying an emailed code (2.1) ->
  `/api/review-demo-code` + a new dedicated review account
  (`obsidianteamhq@agentmail.to`, seeded, lifetime Pro). The old demo
  account was the owner's personal gmail.
- Review notes excused a broken paywall and the demo account hid the
  paywall (Pro) -> rewritten; reviewer told to Sign in with Apple for a
  fresh account to test the purchase.
- Description lacked a Terms of Use (EULA) link (3.1.2) -> added, plus
  Privacy link and renewal terms.
- ~47 call sites used a token that expired after ~1h, so account deletion
  failed (5.1.1(v)) -> proactive refresh (build 48, PR #193).
- Teams lacked report/block (1.2); AI consent was a forced "Got it"
  naming no providers (5.1.2(i)); paywall didn't state the free trial
  (3.1.2); iPhone rotated to landscape -> all fixed in build 48.
- Every build was accidentally universal (UIDeviceFamily [1, 2]) ->
  build 49 (PR #196) + a release guard.
- Contact addresses @alphonsoecosystem.app bounced (no MX) -> Forward
  Email DNS (see §0.0-x to switch destination after approval).
- At submit time: the subscription GROUP must be in the same submission
  as a first subscription.

**Deferred, post-approval (not blocking):**
- **EU Digital Services Act trader info** (App Information -> App Store
  Regulations & Permits). Without it the app is not offered on EU
  storefronts. Account-holder task; publishes address/phone/email.
- **Privacy manifest vs App Privacy label**: the label's Product
  Interaction lists "Product Personalization, and App Functionality";
  `PrivacyInfo.xcprivacy` lists only App Functionality. Add the
  personalization purpose to the manifest in the next build.
- **"Continue with Apple" is a custom-styled button**, not
  `SignInWithAppleButton` -- mild HIG risk, consider switching.
- **App Store subtitle** is empty (optional; helps search).
- **App Store Server Notifications URL**: consider pointing it at
  RevenueCat for faster subscription-state updates.
- **Real-device QA still owed** for build 48/49's new flows: AI consent
  "Not now" backing out of a lesson, Teams report/block menus, paywall
  trial copy, and the hold-to-talk race fixes from build 46.
- **Supabase advisor**: `notify_nudge_push()` is SECURITY DEFINER and
  executable by `anon` -- revoke EXECUTE from anon if not intended.

---

## 0.0-r Four independent third-party audits after build 45 (ChatGPT 5.6 Astra, Fable 5, Codex #3, Codex #4) — 15+ findings triaged, 10 fixed and deployed — DONE (except one deliberately-deferred item) 2026-09-30

User pasted all four reports at once ("ALOT") after shipping build 45.
Every finding re-verified against live code/DB before acting, per this
session's standing discipline — none taken at face value regardless of
stated confidence. Presented a full triage; user selected **all four**
follow-up buckets via AskUserQuestion. Fixed and deployed so far:

1. **CRITICAL, fixed and live: XP-mint exploit.** `buy_heart_with_xp`/
   `buy_streak_freeze_with_xp` took a client-supplied `_cost` parameter
   — any authenticated caller could pass `_cost: 0` (or negative) via
   direct RPC regardless of what the app UI sends. Fixed: dropped the
   parameter entirely, hardcoded the real costs (50/75) server-side.
   `supabase/migrations/20260930130000_fix_xp_purchase_cost_injection.sql`.
2. **CRITICAL, fixed and live: UGC filter false-positive-filter regex
   also broke signup for real names.** `Dickson`, `Draper`, etc. were
   rejected. Fixed with whole-word + collapsed-whitespace matching, still
   catches spaced-out evasion. `supabase/migrations/20260930120000_ugc_filter_word_boundary_fix.sql`.
3. **HIGH, fixed and live: PII (real email + phone) committed to this
   PUBLIC repo.** Self-caught while doing an unrelated App Store review-
   info fix — `scripts/update-app-review-info.ts` had the demo account's
   email and the owner's personal phone number hardcoded. Fixed going
   forward (repo secrets `DEMO_ACCOUNT_EMAIL`/`REVIEW_CONTACT_EMAIL`/
   `REVIEW_CONTACT_PHONE`, read at runtime). **The already-committed
   values remain in git history** — rotating the phone number or
   scrubbing history is the account owner's call, not something fixed
   unilaterally.
4. **MEDIUM, fixed and live: web lesson-completion translate grading had
   no quota gate at all**, unlike every other AI-cost path in the app.
   Added the same `checkQuota?` closure shape `_shared/answer-correctness.ts`
   already uses. `src/lib/grade-lesson-answer.server.ts` +
   `src/lib/sync.functions.ts`.
5. **MEDIUM, fixed and live: missing AI disclosure for written
   translation grading.** `AIDisclosureSheet`/`.aiDisclosureGate()` only
   ever covered the four voice screens; `LessonPlayerView` and
   `ReviewQueueView` send learner-written text to NVIDIA with no
   disclosure at all. Applied the same gate to both, generalized the
   sheet's copy to cover written answers too (one shared acknowledgement
   flag either way).
6. **HIGH, fixed and live: friend-forcing exploit.**
   `accept_friend_invite(_inviter_id uuid)` force-created a mutual
   friendship for ANY uuid the caller supplied — zero consent check, and
   the "inviter"'s uuid was already incidentally exposed via
   `get_leaderboard`/`get_team_members`/`get_my_duels`/activity feed. Any
   authenticated user could build `/invite/<victim-uuid>` and click
   "Add friend" themselves. Fixed by mirroring the team `join_code`
   pattern: a per-user opaque invite code in its own table with **no**
   client-facing SELECT policy at all (profiles' own "select all" RLS
   would otherwise make a same-table code column just as exposed as the
   uuid it replaces). `supabase/migrations/20260930140000_fix_friend_invite_forgeable_uuid.sql`,
   web (`/invite/$inviterId` → `/invite/$code`), iOS
   (`FriendsView`'s share link, `ProgressSyncClient.acceptFriendInvite`).

7. **MEDIUM-HIGH, fixed and deployed: iOS hold-to-talk race condition.**
   Confirmed by two independent auditors (Fable, Codex #3), identical
   shape on all four recording screens (`SpeakQuestionCard.swift`,
   `ConversationView.swift`, `HectorView.swift`, `CampaignView.swift`):
   the `.onChanged` re-entrancy guard is checked synchronously but
   `isRecording`/`phase` only flips inside the async permission-check
   callback, so (a) a `DragGesture`'s repeated `.onChanged` during a
   stationary hold could call `startRecording()` more than once before
   that callback resolved, double-incrementing `RecordingState` with no
   matching second `stop()`; and (b) a tap shorter than the permission
   hop hit `.onEnded` while still `.idle`, so the recording that starts
   a moment later when the callback resolves had no way left to ever be
   stopped. Fixed with two new per-screen `@State` flags,
   `isRequestingMic` (synchronous re-entrancy guard) and `wantsToStop`
   (the finger already lifted; stop as soon as recording actually
   starts). No automated regression test — this logic lives entirely in
   private SwiftUI `@State` with no testable seam, same as every other
   fix in this file class this session. Recommend exercising on a real
   device (rapid taps, a hold that starts during the OS permission
   prompt) before the next TestFlight build.

8. **Fixed and deployed: a kicked team member could rejoin instantly**
   with the same unrotated join code. `kick_team_member()` only deleted
   the membership row, which was also the only thing the 7-day
   switch-lock read — deleting it destroyed the lock along with the
   membership. Fixed by recording the kick in its own table
   (`team_kicks`) and treating a recent kick exactly like the existing
   switch-lock (same 7-day window, same `'switch-locked'` reason string
   — no client change needed).
9. **Fixed and deployed: `/api/chat` accepted an arbitrary
   client-controlled `systemPrompt`.** Despite the route's own comment
   claiming this was "by design," that design only ever held for the
   two legitimate callers, which always send one of a fixed,
   developer-authored persona list — nothing enforced that
   server-side, so a caller bypassing the app UI could turn this
   quota-gated (60/day) route into a general-purpose LLM proxy funded
   by the app's own NVIDIA key. Fixed by whitelisting against the real
   scenario/campaign personas.
10. **Fixed and deployed: gamification writes via `Promise.all` never
    checked their own `{ error }`.** A failed upsert (RLS gap, network
    blip) silently proceeded as a reported success in both
    `completeLessonRemote` (web) and the `complete-lesson` Edge
    Function (iOS). Now throws on a partial failure instead. Does
    **not** fix the underlying lack of atomicity across the several
    separate REST calls — that needs a real SECURITY DEFINER RPC with
    row locking (same shape as `_join_team_impl`'s), which is a larger
    rewrite of the app's most central write path. **Deliberately not
    attempted under deadline pressure** — flagged as a real, unstarted
    follow-up rather than rushed.

**Formerly open — implementation closed 2026-10-19; production verification remains open.** The 2026-10-09 read-then-write description below is no longer an active finding: migration `supabase/migrations/20261014100300_atomic_lesson_completion.sql` provides an atomic, row-locked completion RPC; web retries stale snapshots and iOS queues transient failures with backoff. See `launch-audit-2026-10-19.md` F-04. Verify the migration and RPC grants in production and preserve concurrent-call coverage before public launch.

Historical risk description (superseded): two simultaneous completions could read a stale baseline and overwrite XP/streak/activity. The then-proposed fix was a single atomic SQL function. That design is now implemented; do not restart this item as an unimplemented rewrite.

**Process note**: hit the documented CI "types.ts vs. live schema"
deadlock (see `project_ci_deadlock_paused` and ci.yml's own "KNOWN
FALSE-POSITIVE MODE" comment on the friend-invite fix — resolved via the
prescribed workaround (revert types.ts to match live schema + a narrow
temporary cast, land the migration alone, regenerate types.ts in a
follow-up commit, remove the cast). Also self-caught and fixed a real
regression introduced mid-session: `getRequest()` called eagerly instead
of lazily inside the quota-check closure broke every
`completeLessonRemote` test — caught by running the full suite, not just
the narrowly-scoped file the original fix was verified against.

---

## 0.0-s A fresh-context pre-ship audit of everything in §0.0-r — 2 more real findings, both fixed and deployed — DONE 2026-09-30

Requested before cutting the next iOS build/TestFlight submission,
given how many genuinely new patterns had just landed in §0.0-r (a new
invite-code table, a per-press gesture-race fix across four screens, a
new team-kick table). One fresh-context subagent, no sub-delegation,
scoped to every commit since build 45 — re-verified the fixes actually
claimed rather than re-reading the diffs and nodding.

1. **HIGH: friend-invite codes contained URL-unsafe characters,
   breaking ~22% of invite links.** `get_or_create_my_friend_code()`
   generated codes via `encode(gen_random_bytes(6), 'base64')`, and
   standard base64 includes `/` and `+`. The code is spliced unencoded
   directly into a URL path segment on both platforms, with no
   `encodeURIComponent`/percent-encoding anywhere in the chain — a `/`
   splits the URL into an extra segment neither router's single dynamic
   segment matches, so the recipient 404s instead of reaching the
   invite-accept screen. Nothing in the test suite could have caught
   this (every fixture uses a hand-picked alphanumeric string, never a
   real `gen_random_bytes` output). Fixed by switching to hex — no
   characters ever special in a URL path segment, same 48 bits of
   entropy, no client change needed.
2. **HIGH: hold-to-talk's own §0.0-r fix left a second race in the
   same code.** All four recording screens share ONE `recorder` @State
   instance across every press. `stopRecordingAndSend`'s own
   minimum-duration sleep (up to ~0.4s) runs after `isRecording`/
   `isRequestingMic` are already reset false, so a rapid second press
   could start a NEW recording on that same shared instance while the
   first press's delayed stop() was still pending — the delayed stop()
   then finalizes the SECOND press's recording early (mislabeled as the
   first turn) and leaves the second press's own real `.onEnded` finding
   a cleared recorder (silently dropped, no error). On
   `SpeakQuestionCard` this also set a false `micUnavailable = true`.
   Fixed with a per-screen `recordingGeneration` counter so a stale
   delayed stop() can tell it no longer owns the shared recorder and
   silently no-ops instead. Also closed a related, smaller gap: tearing
   the view down while still awaiting the mic-permission callback made
   `onDisappear`'s `cancelIfRecording()` a no-op (it only cancels an
   *already-started* recorder), so the OS-held callback could still fire
   later and start recording on a gone screen — fixed with a new
   `isTornDown` flag.

**Not real findings (flagged by the auditor, explicitly not
re-reported as bugs, per its own instructions)**: the deliberate
decision to defer the full row-locking/atomicity rewrite of the
gamification-write path (already an honest, flagged scope cut in
§0.0-r, not re-litigated here).

No automated test possible for either hold-to-talk finding — same
private-SwiftUI-@State limitation as every other fix in this file
class. Verified via code tracing + CI (`ios-app-build` compile check,
`ios-swift-tests` full pass including a new `getMyFriendCode()`
regression test the same audit found was missing). Recommend a real
device pass (rapid double-tap on all four recording screens) before or
shortly after the next build ships.

## 0.0-t Custom domain for the Supabase project — deferred, post-submission polish — STILL OPEN (verified 2026-10-09: ios/LearnWithAlphonso/Sources/AppConfig.swift:10 still points at the raw qhcjpfbxfcltjbiuknyt.supabase.co URL; needs the paid plan and an owner decision)

Account owner flagged that `https://qhcjpfbxfcltjbiuknyt.supabase.co`
looks untrustworthy (raw project-ref subdomain, no branding) and asked
what to do about it.

Supabase supports **custom domains**: map something like
`api.alphonsoecosystem.app` to the project via CNAME, and every URL —
API calls, and importantly the auth email links/redirects — shows the
real domain instead of the random project-ref string.

**Why not now**: it needs Supabase's paid plan tier for custom domains,
DNS + SSL cert provisioning takes real lead time, and every client
needs repointing (`AppConfig.supabaseURL` on iOS, the web env vars)
followed by a genuine re-test of the whole auth flow — not something to
cut over hours before a submission deadline. Treat as solid
post-submission polish, not a pre-ship blocker.

## 0.0-u Build 46 shipped — DONE 2026-09-30

Ships everything in §0.0-r and §0.0-s: both audit rounds (four
independent third-party reports, then a fresh-context pre-ship
re-audit of that same work), 12 real findings total, all fixed.
`CURRENT_PROJECT_VERSION` bumped 45 → 46 (app + widget in lockstep,
`ios/LearnWithAlphonso/project.yml`'s own version-history comment has
the full per-finding list). CI green (including `ios-app-build`
compiling the bump) before triggering `ios-release.yml` with
`upload_to_testflight=true` — confirmed via `altool`'s own output:
"UPLOAD SUCCEEDED with no errors."

**Not yet done, flagged again for visibility**: no real device was
available to test either hold-to-talk race fix (§0.0-r's original two
races, §0.0-s's shared-recorder second race + the teardown gap) — this
agent has no macOS/device access in this environment. Recommend a
rapid-double-tap pass on all four recording screens (Practice,
Conversation, Hector, Campaign), and a hold that starts during the OS
mic-permission prompt, once build 46 is installable from TestFlight.

## 0.0-v First real hands-on QA pass on build 46 — 2 fixed and shipped as build 47, 2 deferred (feature builds, post-submission), rest resolved as non-bugs — DONE 2026-09-30

The account owner's own manual QA pass on a real device, working
through the build-46 QA checklist. Not an audit this time — real
production evidence (Vercel logs, a real GDPR data export) confirming
or ruling out each report before touching anything.

**Fixed and deployed**:

1. **"Generate more practice" returning "Couldn't generate practice for
   this lesson right now."** Confirmed live via real Vercel logs from
   the account owner's own attempts: `[generate-practice] 0 questions in
   4172ms` (a fast, non-erroring call that still returned nothing) and,
   43 seconds later on a retry, `failed after 20002ms: timeout`. Best-
   supported explanation: the `max_tokens: 800` cap added in an earlier
   build-45 fix is tight enough to truncate a real 3-5 question JSON
   response mid-completion, which then silently fails
   `parsePracticeQuestions`' parse (indistinguishable from the model
   legitimately declining, by design). Raised to 2048 — real headroom,
   still far below anything that would meaningfully affect latency for a
   JSON array this size. Root cause not 100% provable without logging
   raw model output (not done, to avoid logging learner content), so
   flagged as best-supported rather than certain.
2. **Review due-count badge showing 0 while the Review screen itself
   showed 11 due items.** Real bug: `replaceLastKnownDueReviews` (the
   cache both the Learn tab row and the tab-bar badge read from) was
   only ever called from inside `ReviewQueueView`'s own load -- so on
   any session where that screen hadn't been opened yet, the badge read
   a stale or empty cache regardless of the real due count. Fixed by
   also refreshing it during `RootView.triggerSync()`, same place/
   posture as the existing hearts-refill resolution. English-only for
   now (matching `ReviewQueueView`'s own default course) since iOS has
   no synced notion of the account's active course yet — a real,
   flagged limitation for a learner reviewing a non-English course, not
   a full fix.

**Confirmed real, explicitly deferred to a feature build after
submission (per the account owner's own call, given how late
submission already is)**:

3. **iOS never gates anything on 0 hearts, anywhere.** Grepped the
   entire app target: zero hearts references in `LessonBrowserView.swift`
   (which starts lessons) at all. Confirmed with the account owner's own
   real exported data: `hearts: 0`, and `lesson_completions`/
   `friend_activity_events` show they finished a 6-question lesson
   (2/6 correct) with hearts hitting 0 partway through, uninterrupted --
   then could have started another lesson immediately after, also
   ungated. Web already blocks *starting* a new lesson at 0 hearts
   (`outOfHearts` in `learn.tsx`); iOS was simply never built to do the
   same. A real blocking-screen feature, not a one-line fix.
4. **"Buy a heart / streak freeze with XP" has zero UI on iOS.** The
   server RPCs and the Kit's client methods exist and work (confirmed
   working on web via `HeartsModal.tsx`), but grepping the entire iOS
   app target for either RPC name returns nothing -- no button, no
   screen, anywhere. iOS-only parity gap; a real screen to build, not a
   fix.

**Investigated and resolved as NOT bugs** (real findings the report
turned out to already be working as designed, confirmed with real
evidence rather than assumed):

5. **"A heart is showing lost but not in reality" / "refill doesn't
   work."** The account owner's own exported data shows
   `hearts_refill_at` correctly set (30 minutes after hitting 0) --
   the server-side regen scheduling is genuinely correct. The real gap
   folded into item 3 above: iOS shows hearts as a static number with
   no live countdown, and only re-checks it on app foreground/
   connectivity regain, so watching the app do nothing while waiting is
   expected (if confusing) behavior, not a broken mechanism.
6. **Exported personal data reviewed by hand** (a real file from a
   throwaway account, via Export My Data) for anything concerning: no
   cross-user data, no leaked auth tokens/credentials (confirmed
   correctly excluded), no unexpected PII. It does include the raw APNs
   device push token under `device_tokens` -- correct, expected GDPR
   data-portability behavior (the user's own data, handed back to
   them), not a leak.
7. **Demo account swap, considered and declined.** The account owner
   asked about routing App Review's OTP through this agent's own
   AgentMail testing mailbox instead of the existing demo account.
   Declined: even with an agent session actively watching that inbox,
   there is still no channel to inject a code into a live Apple review
   session -- it would still need a human relay through App Store
   Connect's Resolution Center, the same manual step that already
   exists today, just with an extra hop through the agent first, and a
   review window (hours to days, no fixed schedule) that would need
   continuous watching regardless. Kept the existing demo account.
8. **"Do we even have VoiceOver?"** Yes, partially -- 12 iOS source
   files carry real `accessibilityLabel`/`accessibilityHint` work from
   the earlier accessibility PR stack (#179-182). Still genuinely
   unverified on a real device with VoiceOver actually turned on, per
   that same work's own open item.
9. **QA checklist instruction error, self-caught**: "Settings →
   Accessibility → Larger Text" was written as if it were an in-app
   path; corrected to the real one -- the iOS Settings app itself,
   Settings → Accessibility → Display & Text Size → Larger Text.

**Build 47 shipped**: `CURRENT_PROJECT_VERSION` bumped 46 → 47 (app +
widget in lockstep), CI green (including `ios-app-build` compiling the
bump) before triggering `ios-release.yml` with
`upload_to_testflight=true` — confirmed via `altool`'s own output:
"UPLOAD SUCCEEDED with no errors." Ships items 1 and 2 above
(generate-practice, review badge). Items 3 and 4 (0-hearts gate,
buy-with-XP UI) remain deliberately deferred to a post-submission
feature build. The hold-to-talk race fixes from build 46 are still
unverified on a real device.

Nothing submitted to App Store review yet — standing instruction from
2026-09-23 unchanged.

## 0.0-w Pre-submission readiness sweep — one real blocker found and fixed — DONE 2026-09-30

Before actually submitting, checked live (not trusted from prior
session notes) everything a "Submit for Review" click needs. Added a
`readiness` check (extends `scripts/check-subscription-status.ts`,
same read-only pattern as its existing `builds`/`app-info`/
`subscription-state` checks) covering: the editable version's own
state, whether a processed build is attached to it, the en-US listing
localization, the appInfo localization, and the App Review Information
block.

**Found one real blocker**: `relationships.build.data` on the
PREPARE_FOR_SUBMISSION version was `null` — no build attached at all,
despite builds 43-47 all showing `processingState: VALID` in App Store
Connect. Fixed with a new `attach-latest-build` command (same file,
same SAVE-ONLY posture — a PATCH on the version's own build
relationship, not the submit-for-review endpoint): attached build 47,
confirmed via read-back.

**Everything else already correct, confirmed live**: en-US listing
localization (description/keywords/promotional text/support+marketing
URLs) all SET; appInfo name and privacy policy URL SET (subtitle and
privacyChoicesUrl are empty but both optional — this app does no
tracking/data-sharing that would require the latter); App Review
Information (contact, demo account, notes) fully SET.

Nothing submitted to App Store review yet — standing instruction from
2026-09-23 unchanged. This was the last known blocker; the account
owner is deciding when to actually submit.

---

## 0.0-q A third whole-codebase audit (cold context, expanded scope) — 5 real findings, all fixed; App Store listing screenshots live — DONE 2026-09-30, build 45 shipped

Requested explicitly before shipping build 45, given how many genuinely
new patterns had just landed (in-place `@State` lesson transform, the
doubled `.podcastMiniBar()` reservation, new team RPCs). Scope was
expanded mid-run from "scrutinize the newest diff" to a full
whole-codebase pass, still cold-context (no briefing on prior findings)
and no sub-delegation. Every finding independently re-verified against
the live code before fixing:

1. **HIGH: iOS never spent a heart on a wrong lesson answer, ever.**
   `recordAnswer()` only ever queued a reinforcement question on a
   miss — confirmed by grepping the entire app target for `loseHeart`:
   zero call sites outside `ProgressSyncClient`'s own definition and
   tests. `complete-lesson` only ever *grants* hearts (regen/streak-
   milestone/perfect-lesson bonus), never deducts — so nothing else was
   covering for this either. Web calls both a local optimistic update
   and the `loseHeart` RPC on every wrong (non-reinforcement) answer
   (`lesson.$id.tsx:206-207`); iOS never did, on any build. This is a
   real, pre-existing gap (not introduced this session) that quietly
   disabled the entire hearts gate and the XP-to-heart purchase loop
   built around it on iOS. Fixed: same fire-and-forget RPC call, plus an
   optimistic local cache update so the tab-bar status header reflects
   the loss immediately (`LessonPlayerView.swift`, new
   `spendHeartForWrongAnswer()`).
2. **HIGH: teams likely invisible to real iOS users.**
   `getMyTeam()`/`getTeamMembers()` parsed real `timestamptz` fields
   with plain `ISO8601DateFormatter()`, which fails on PostgREST's
   actual fractional-second precision — the exact bug this codebase's
   own `parsePostgresTimestamp` helper already exists to fix, just not
   visible across files since Swift's `private` is file-scoped, not
   type-scoped (`ProgressSyncClient+Teams.swift` couldn't see
   `ProgressSyncClient.swift`'s private helper). Real effect:
   `getMyTeam()`'s multi-condition `guard` would return `nil` for
   someone who genuinely has a team (TeamsView shows "join a team"
   instead), and `getTeamMembers()` would silently drop every row via
   `compactMap` (empty member list, the new owner/kick UI never
   renders). The existing tests used clean fixtures with no fractional
   seconds — could never have caught this. Widened the helper's access,
   fixed all 3 call sites, updated the tests' fixtures to realistic
   fractional-second timestamps (now fail without the fix, pass with
   it).
3. A stale doc comment in `PodcastMiniBar.swift` asserted the mini-bar
   does not follow the lesson player — already false when found (the
   original bug screenshot proved the bar's visual half was already
   showing over it; only the layout-reservation half wasn't). Corrected.
4. Reinforcement questions are pulled from sibling lessons whose
   question ids are only unique *within* a lesson, not globally — a
   missed question's id could collide with its reinforcement
   replacement's id from a different lesson, meaning `QuestionCard`'s
   `.id()` wouldn't force a fresh view identity for that transition
   (reorder-question tap-state leak risk). Folded `isReinforcing` into
   the id — disambiguates every real transition since main/reinforcement
   strictly alternate.
5. LOW: `attemptSeed`'s own doc comment claimed `continueToNextLesson()`
   regenerates it — it didn't. Added the missing reassignment.

**Separately, closed out the two open items from §0.0-o**: confirmed
via a direct, read-only App Store Connect API check that App Store
*listing* screenshots (distinct from the subscription's own review
screenshot) were genuinely at **zero** — a real, hard submission
blocker, not just a nice-to-have. Re-ran the screenshot-capture CI
pipeline; found and fixed two real bugs in it by actually looking at
the captured PNGs instead of trusting "test passed" (`captureHector()`
never dismissed the first-run AI-disclosure sheet, which then silently
blocked every capture after it; `captureLessonPlayer()` hardcoded an
A1-only lesson title that isn't visible once the test correctly waits
for the demo account's real B2 level to load — added a stable
`firstLessonRow` accessibility identifier instead). Re-ran clean: 7
real, reviewed screenshots (Learn, a lesson overview, Review, Hector
showing "Hold to talk," Listen root + episode list, Profile). Wrote
`scripts/upload-app-store-screenshots.ts` (one real endpoint-path bug
found and fixed via the API's own error message: `POST
/appScreenshotSets/{id}/appScreenshots` is invalid, the correct pattern
is `POST /appScreenshots` with a relationship, mirroring
`upload-review-screenshot.ts`) — all 7 confirmed live via a fresh
read-only check, `assetDeliveryState: COMPLETE` on every one.

Build 45 shipped with all 5 audit fixes folded in (no separate build
number — 45 hadn't shipped yet when the audit was requested). CI fully
green (including `ios-swift-tests` with new regression tests proving
the timestamp-parsing fix) before triggering the TestFlight upload.

## 0.0-p More real TestFlight feedback on build 44, fixed same-day — DONE 2026-09-29, build 45 (audit pending before ship)

1. **"Generate more practice" erroring after ~30s.** Real Vercel logs
   for the actual attempts showed `POST /api/generate-practice`
   returning 200 both times checked — the route never threw. Root cause
   still not 100% pinned (most likely the NVIDIA call is just slow with
   no client feedback, colliding with either the client's own timeout or
   a network hiccup the server can't see), but two real, defensible
   fixes regardless: `max_tokens` was never bounded on the NVIDIA
   request (unbounded completion length is unbounded latency risk for
   what should be a short JSON array) — capped at 800. Added a real 20s
   `AbortSignal` timeout on the fetch itself so a truly stuck upstream
   call fails fast instead of running out the function's clock silently.
   Logs duration on every outcome now (not just failures), so a real
   recurrence gives an exact number instead of another guess. Two new
   Vitest tests (`practice-generation.server.test.ts`).
2. **Built "Continue to next lesson."** No such flow existed —
   confirmed by reading `FinishView` directly, zero next-lesson control
   anywhere. `LessonPlayerView.lesson` changed from `let` to `@State`
   (custom `init` now required, since adding one drops Swift's
   synthesized memberwise init) so the same view instance can transform
   itself into the next lesson in place on tapping Continue, rather than
   threading a bindable `NavigationPath` down from `LessonBrowserView`
   just to push one stack entry per lesson (which would also make the
   stack grow unboundedly as a learner keeps going). New
   `nextLessonID` computed property walks the current unit first, then
   the next unit at the same CEFR band — deliberately NOT rolling over
   into the next band, a level-up decision left to the learner via the
   band picker. `continueToNextLesson()` resets every per-lesson
   `@State` var (phase, idx, correctCount, answers, picked,
   translationVerdict, checked, isSubmitting, result, isLeaguePromotion,
   queuedOffline, errorMessage, pendingReinforcement,
   activeReinforcement, attemptSeed) — **this reset list is exactly the
   kind of thing worth double-checking against the actual code before
   trusting it's complete**, flagged for the pending audit below.
3. **A screenshotted bug: a lesson's primary button (Begin/Check/
   Continue) landing exactly where the podcast mini-bar sits.**
   `LessonPlayerView` is pushed via `NavigationStack`, so the mini-bar's
   `safeAreaInset` — reserved by the tab ROOT content
   (`LessonBrowserView`) per `PodcastMiniBar.swift`'s own (already
   self-flagged-as-unverified) comment — does not extend to it. Applied
   `.podcastMiniBar()` again, directly to the pushed destination in
   `LessonBrowserView`'s `.navigationDestination` closure — fixes every
   phase (overview/vocab/quiz/finish) at once, since it wraps the whole
   `LessonPlayerView` instance. `OverviewScreen` additionally moved off
   a `Spacer()`-pinned button onto a `ScrollView`, as defense in depth
   independent of safe-area propagation correctness.
4. **Practice tab's "Hold to talk" label** — already shipped identically
   to Hector's in build 44 (verified by re-reading the exact code, not
   assumed); account owner asked about it before confirming on-device on
   the Practice tab specifically. No new fix needed, just re-verification
   asked for.

A stale-generated-types CI failure surfaced mid-fix (unrelated to this
list — the §0.0-n teams migration had deployed without a matching
`src/integrations/supabase/types.ts` regeneration). Fixed via the
existing `regenerate-supabase-types.yml` workflow; since its own commit
doesn't trigger push-based CI (bot-token pushes don't fire other
workflows' `push` events), forced a real revalidation with an empty
commit. CI green on the resulting head.

**Before shipping build 45, spawned a second fresh-context, zero-briefing
audit** (explicit instruction: no sub-delegation, read-only, especially
scrutinize the just-landed `@State`-in-place lesson-transform pattern
and the doubled `.podcastMiniBar()` application) — see this section's
own findings once it reports back; ship is paused until then.

Also regenerating the App Store listing screenshots via the existing
`capture-app-store-screenshots.yml` CI pipeline (the local 03-
submission-materials/screenshots/ set is stale, dated 2026-09-26, well
before Canopy polish/hearts/teams/podcast-next/lesson-checkmarks) —
in progress, not yet uploaded to App Store Connect.

## 0.0-o Real TestFlight feedback on build 43, all 7 items fixed — DONE 2026-09-29, build 44

Investigated each report against real code and real production logs
before touching anything — same discipline as every audit this session.

1/2. **Practice and Hector's "mic doesn't catch anything" — NOT a
   regression of build 41's gesture fix.** Pulled real `debugTiming` from
   the account owner's own 10-attempt test: press durations 0.04-0.16s
   across every single one, identical to the pre-fix signature. Checked
   the code directly — the stable-container gesture fix from build 41 is
   confirmed still in place, unchanged. Real explanation: neither screen
   ever had ANY on-screen text saying the button is a hold gesture
   (`SpeakQuestionCard` does: "Hold and say the phrase"). Added the same
   pattern to both (`ConversationView.swift`, `HectorView.swift`).
3. **"Generate more practice" — endless buffering.** The one real
   production log for it shows the request succeeded server-side (200,
   no error) — most likely a genuinely slow LLM call with zero "this can
   take a moment" messaging, not a true hang. Added a 45s client-side
   timeout as a real safety net (`AIConversationClient.generatePractice`)
   plus "This can take up to 30 seconds" loading text
   (`LessonPlayerView.swift`).
2/4. **Lesson completion dot never reflected real completion.**
   `LessonBrowserView`'s row accent was `index == 0 ? ember : moss`,
   completely unconditionally — confirmed by reading the code, not
   assumed from the report. Added `ProgressSyncClient.
   fetchCompletedLessonIds(course:)` (direct PostgREST read,
   `lesson_completions` already has an own-row RLS policy) and wired it
   to a genuinely different accent (`.hairline`, this design system's own
   documented "dimmed/done" color) for completed lessons. Same fetch also
   answers "which unit was I studying" — the list now auto-scrolls to the
   lesson right after the most recently completed one on first
   appearance (`ScrollViewReader` + a new `continueLessonID` computed
   property).
5. **A podcast episode published twice, once outside its correct
   folder** — a real content mistake, not a code bug. Found via a
   read-only query (`title` grouped, `count > 1`): one copy under the
   "B1 Intermediate" folder (correct), one under the top-level "English"
   folder (the account owner's own description of "without a folder").
   Verified zero `podcast_playback` rows referenced the misplaced one
   before deleting it directly.
6. **Team join code was never actually shareable** — displayed as plain
   text only, no way to send it to anyone. Added a native `ShareLink` in
   `TeamsView.swift`.
7. **Teams had no owner authority at all — not even a visible member
   list.** Confirmed by reading `TeamsView.swift` and every teams RPC:
   zero `kick`/`promote`/member-list capability existed anywhere.
   Added (`20260930110000_team_members_and_kick.sql`): `get_team_members`
   (every member, owner flagged) and `kick_team_member` (owner-only,
   refuses self-kick, checks `teams.created_by`). `get_my_team` now also
   reports `is_owner` — required a `DROP FUNCTION`/`CREATE FUNCTION`
   pair since its `RETURNS TABLE` column set changed (`CREATE OR REPLACE`
   can't do that), with grants re-applied after (a drop loses them).
   `TeamsView.swift` now shows a real member list with an owner-only kick
   button.
8. **No "Next episode" control anywhere in the podcast player** — the
   account owner's literal report: "no way to continue to the next
   [episode]." Confirmed zero queue/next concept existed in
   `PodcastAudioPlayer.swift`. Added `queue`/`nextEpisode` to the player
   (deliberately still ignorant of the download manager, per its own
   documented reason for staying untestable-file-simple) and a "Next"
   button in `PodcastMiniBar.swift` that resolves the local URL and
   calls `play()` again, only shown when there's actually a next item.

Also asked directly, mid-testing, whether the exact same gap exists for
**lessons** ("no way to continue to the next lesson without going back
to the main menu"): confirmed via code — yes, `FinishView` (the
lesson-complete screen) has no next-lesson control either, same class of
gap as #8. Not yet fixed — needs a small navigation restructure
(`LessonBrowserView` doesn't currently expose a bindable
`NavigationPath` a child screen could push onto), deliberately not
rushed through while a build was mid-testing. **Open, account owner to
decide whether this becomes build 45 or waits for after submission.**

Also confirmed (2026-09-29, same session): App Store screenshots for the
actual store listing (distinct from the subscription's review
screenshot, which is done) are still not uploaded to App Store Connect
— 7 shots exist locally in the Shipaton workspace from build 34, never
scripted. Recommended the account owner upload directly via the ASC web
UI rather than have a new, untested upload script built under deadline
pressure — still open as of this entry.

Build 44 shipped all 7 fixes above (app + widget
`CURRENT_PROJECT_VERSION` 43 → 44). CI fully green (including
`ios-swift-tests`, with new regression tests for `fetchCompletedLessonIds`
and the teams `is_owner`/member-list/kick methods) before triggering the
TestFlight upload; confirmed `UPLOAD SUCCEEDED`.

Copyright and the full App Review Information block (contact, demo
account, reviewer notes) are also now saved in App Store Connect —
`scripts/update-app-review-info.ts` (new, save-only, mirrors
`update-app-store-metadata.ts`'s pattern), triggered via a new workflow.
Copyright uses the account owner's own full legal name (Obsidian Media
isn't legally registered yet, so it can't hold copyright — copyright law
assigns it to the individual by default). All fields confirmed saved by
reading them back.

## 0.0-n A second, cold-context whole-codebase audit: four more confirmed findings, all fixed — DONE 2026-09-29

Spawned a second fresh-context subagent for another all-angle audit, this
time deliberately given **zero briefing** on what §0.0-l/§0.0-m already
found and fixed — a genuinely cold pass, not primed by prior findings, to
avoid anchoring on the same areas already covered. It ran directly (no
further sub-delegation) and came back with four findings; every one was
independently re-verified against the live code/DB before fixing, same
discipline as every other audit this session.

1. **Hearts-refill timer never wired on iOS.**
   `HeartsEconomy.resolveHeartsRefill` (Kit, added 2026-09-18) was
   deliberately never wired into any iOS write path — confirmed zero call
   sites anywhere in the app target, and zero references to the
   `restore_hearts_if_due` RPC (web's own counterpart, already deployed)
   anywhere in `ios/`. A user who ran out of hearts and waited past the
   30-minute regen window without completing another lesson (the only
   thing that would otherwise touch the row) saw "0 Hearts" indefinitely
   on reopening the app. No hard gate blocks lesson start on 0 hearts, so
   this was a stale/confusing display, not a hard block. Fixed:
   `ProgressSyncClient.fetchProgress()` now calls `restore_hearts_if_due`
   (best-effort) whenever the read-back refill time has already elapsed,
   mirroring `sync.functions.ts`'s `restoreHeartsRemote` exactly. New Kit
   tests cover both the resolve-triggered and not-yet-due paths.
2. **`RecordingState`'s counter could leak if a recording screen was torn
   down mid-hold.** All four recorder-owning views balanced
   `RecordingState.shared.began()`/`.ended()` in `start()`/`stop()`, but
   none called `.ended()` from `onDisappear` (`SpeakQuestionCard` had no
   `onDisappear` at all). SwiftUI does not guarantee a `DragGesture`'s
   `.onEnded` fires when the view holding it is torn down mid-gesture
   (navigating back, a tab switch, a sheet dismissal, mid-hold). If that
   happens, the counter never balances, and
   `PodcastAudioPlayer.handleInterruption` — which reads
   `RecordingState.shared.isRecording` to decide whether a real
   interruption (a phone call) should resume playback after — would then
   wrongly suppress every future resume, for the rest of the app's process
   lifetime, from a completely unrelated trigger. Fixed: a new
   `cancelIfRecording()` on each of the four recorder classes (stops the
   `AVAudioRecorder` synchronously, balances the counter, releases the
   session — deliberately not the full async `stop()`, since the view is
   gone and there's nothing to submit), called from each screen's
   `onDisappear` (added to `SpeakQuestionCard`, which had none).
3. **UGC filter had a Cyrillic/Greek homoglyph bypass.**
   `normalize_for_moderation` (already fixed once this session for
   accented Latin letters, §0.0-m predates this) *deletes* any character
   outside its translit table rather than folding it — so a single
   Cyrillic or Greek letter that is visually identical to a Latin one
   (the audit's own example: Cyrillic "і", U+0456, swapped for Latin "i")
   gets stripped instead of matched, letting a slur slip past the filter
   while it still reads as the slur to a human. Fixed by extending the
   translit table with the standard single-character Cyrillic/Greek
   Latin-lookalike set — deliberately NOT a blanket "reject any non-Latin
   script" rule, which would also reject legitimate international display
   names for no real security benefit. Verified live: a Cyrillic-і slur is
   now caught, accents still fold correctly, and unrelated non-Latin text
   (e.g. Japanese) is correctly still unaffected.
4. **`respond_to_duel` never checked `blocked_users`.** `create_duel` and
   the open-queue join path both refuse a blocked relationship; the
   accept/decline path, untouched since 2026-09-20, never did. A user
   could block someone who'd already sent them a pending duel challenge,
   then still open and accept it, going `active` with mutual XP tracking
   between two blocked users. Same "a guard exists elsewhere but this path
   was never extended to it" pattern as the nudges/leaderboard findings in
   §0.0-m. Fixed with the identical check/shape `create_duel` already
   uses. Verified live: `respond_to_duel`'s deployed source now references
   `blocked_users`.

Both DB fixes (#3, #4) deployed through the normal CI pipeline (this
session's direct-`execute_sql` shortcut was blocked by the permission
system as a production-deploy action this time — correctly so, and not
worth routing around; the CI path is the sanctioned one anyway) and
verified live afterward. Both iOS fixes (#1, #2) shipped in build 43 —
CI fully green (including `ios-swift-tests`) before triggering the
TestFlight upload.

Other findings the audit checked and found clean, stated briefly: SRS
three-port parity (hand-diffed including the 2026-09-29 lapse-interval
fix — still faithful), `progress-math.ts`/`lesson-session.ts` Deno parity
(byte-for-byte identical), RLS/grants on every recent table, every
multiply-redefined function's full version history (no new instance of
the create_team/get_leaderboard copy-paste-revert pattern beyond the two
already caught), the privacy manifest, and singleton retain-cycle safety.

## 0.0-m Whole-codebase audit: five confirmed findings, all fixed — DONE 2026-09-29

Spawned a fresh-context subagent for an all-angle deep audit ("in case we
forgot something"), given full history of everything already fixed this
session so it wouldn't waste time re-finding it. It ran five parallel
sub-audits (admin/RLS/Edge Functions; iOS SwiftUI gesture/@Observable
bug-class hunt; web routes/offline-sync/push/podcast; Apple-guideline
verification via live WebSearch; gamification math/test-coverage — this
last one stalled and returned a supplemental report separately). Every
finding below was independently re-verified against the live code/DB
before fixing anything, same discipline as every other audit this
session.

1. **Unbounded NVIDIA cost exposure.** `gradeReview` (web,
   `review.functions.ts`) and the Deno `grade-review`/`complete-lesson`
   Edge Functions (via shared `deriveAnswerCorrectness`) had zero
   quota/rate-limit enforcement on translate AI grading — the one AI-cost
   path in the app missing it. The Deno side's own comment claimed
   "roughly one call per due item per day" was the structural limit, but
   that's wrong: a wrong answer sets `due_on` to *today*, so the same
   item stays due and can be resubmitted unlimited times, each a real
   vendor call. Fixed: `consumeQuota`/`verifyAuth` (web) and a new shared
   `makeTranslateQuotaCheck` (Deno, `_shared/ai-quota.ts`) gating just the
   AI-grader branch, so a free local-list match still costs nothing.
2. **`/api/grade-translation` had no auth check at all.** Two early-return
   paths (curated-list match, `NVIDIA_API_KEY` unset) returned real
   verdicts before ever reaching `consumeQuota`, the only auth gate in
   the file. Extracted `verifyAuth` (the auth half of `consumeQuota`, no
   quota spent) into `ai-quota.server.ts` and gated the whole handler
   with it up front.
3. **SRS lapse-interval fix never ported to Deno/Swift — the highest-
   severity finding.** `src/lib/srs.ts`'s 2026-09-22 fix (proportional
   lapse interval, replacing a fixed-step bucket that collapsed every
   lapse to 1-or-3-days regardless of the item's real interval) was never
   ported to `grade-review/srs.ts` (iOS's *sole* authoritative grader,
   per ARCHITECTURE.md — no session-token gate, just `due_on`) or
   `SRSEngine.swift`. Every iOS lapse on a well-established item was
   silently getting the disowned, more punishing behavior for a week.
   The three ports' own "parity guard" tests never actually diffed
   against the TS source of truth, just re-asserted their own stale
   logic — they stayed green through the whole divergence. Ported the
   fix to both, plus the missing "established item" regression vector to
   both test suites (`srs.test.ts` Deno, `SRSEngineTests.swift`).
4. **Real push-notification harassment vector via `nudges`.** The
   original nudges design (2026-09-20) deliberately skipped server-side
   rate limiting because a nudge only produced an in-app banner. A day
   later, `nudges_push_after_insert` started firing a real APNs push on
   every insert, unconditionally, and nobody revisited the rate-limit
   decision. Any accepted friend could bypass the client's 24h cooldown
   button (`NudgeCooldownCache.swift`, UI-only) via a direct API call and
   spam a real person's lock screen indefinitely. Fixed by adding the
   same 24h window server-side, inside the trigger itself (not the RLS
   policy — the row/badge semantics are unchanged; only a redundant real
   push within the window is suppressed).
5. **`get_leaderboard` had the same silent-revert pattern that broke
   `create_team`.** A later migration (adding blocked-user filtering)
   re-published `get_leaderboard` from a pre-extraction copy, reverting
   its weekly-XP branch to an inlined subquery instead of calling the
   shared `weekly_xp()` helper — and dropping the upper date bound in the
   process. Not currently live (no future-dated `activity_days` rows
   exist to expose the missing bound), but real drift risk if
   `weekly_xp()`'s own window logic is ever tightened for the Season
   Ladder's past-week resolution. Restored the shared call.

Applied #4 and #5 directly to the live DB (idempotent `CREATE OR
REPLACE`, mirrored exactly by their migration files); #1–3 need this
push's CI plus a Kit/iOS rebuild to actually take effect on iOS. Local
`swift build`/`swift test` were blocked for this whole fix by a Windows
Application Control policy on this machine (confirmed independently via
PowerShell, unrelated to any of these changes) — the Swift `SRSEngine`
fix was verified by direct code review and mirrors the Deno fix exactly,
but CI's `ios-swift-tests` job was the first real test run of it.

**Build 42, shipped 2026-09-29**: bumped `CURRENT_PROJECT_VERSION` 41 →
42 and triggered `ios-release.yml` with TestFlight upload, specifically
to get the `SRSEngine.swift` fix onto a real device — it had only ever
run through CI until now. No other change in this build.

Other findings from the same audit, read but not yet acted on: no
SwiftData migration plan for the 5-model container (only matters on a
future schema change); `PodcastDownloadManager.download(episode:)` has
no same-episode concurrent-download dedupe guard; `SocialSafetyMenu`
(the block/report entry point) has no `.accessibilityLabel`; a rare
offline-sync edge case where a process kill mid-drain could replay
(double-apply) a single review grade; App Store Connect's own age-rating
tier needs a manual check in the ASC UI itself before submitting (Apple
added a mandatory `socialMedia` age-rating question in Sept 2026 that a
live API check can't fully confirm is bound to the app yet).

## 0.0-l Codex audit: create_team's gen_random_bytes regression — DONE 2026-09-29

**Verified and fixed a real, currently-live production bug** a third-party
(Codex) audit flagged: `20260930030000_ugc_content_filter.sql`
re-published `create_team` (to add a blocked-content check) by copying
its body from *before* `20260929020002_fix_team_gen_random_bytes_schema.sql`
schema-qualified its one `gen_random_bytes(6)` call — silently
reintroducing the exact "function gen_random_bytes(integer) does not
exist" bug that earlier migration fixed, since `20260930030000` sorts
after it. Confirmed live before touching anything: queried
`pg_proc` directly — the deployed function's source called unqualified
`gen_random_bytes(6)` while still declaring `SET search_path = public`,
and `pgcrypto` (which provides it) is confirmed installed in the
`extensions` schema, not `public`. `auto_join_team` (the sibling
function both original migrations touched) was NOT touched by the UGC
filter migration and is confirmed still correctly qualified — this
regression was scoped to `create_team` alone. Team creation was broken
in production until this fix.

Fixed via `20260930060000_fix_create_team_gen_random_bytes_regression.sql`
— re-qualifies the one call site, otherwise identical to the UGC
migration's version (blocked-content check kept). Applied directly to
the live DB and verified (`correctly_qualified = true`, a real
`encode(extensions.gen_random_bytes(6), 'base64')` call succeeds); the
migration then deployed cleanly through CI and is correctly registered
in `supabase_migrations.schema_migrations`.

**Other claims in the same audit, spot-checked and confirmed accurate**:
`PaywallView` has price display (`localizedPriceString`), a renewal
disclosure, `restorePurchases`, `manageSubscriptionsSheet`, and
Terms/Privacy links; `EntitlementStore` fails closed (`isPro = false` on
every catch path, and as its default); both Apple and Google sign-in
presenters exist. The audit's audio-fix summary (stable gesture
containers, explicit permission checks, minimum duration, multipart
STT, token refresh, short-audio suppression) matches this session's own
work exactly. Its "still needs a physical-device smoke test" and
"App Store Connect state needs live confirmation" caveats are correct
and out of code's reach — noted, not actioned here.

## 0.0-k Build 39-41: launch hang regression, same watchdog shape as build 29 — DONE 2026-09-29

**Build 38 hangs on launch on a real device.** Two real crash logs (`.ips`,
pulled from Settings → Privacy & Security → Analytics Data, no Mac
available) confirm: `EXC_CRASH`/`SIGKILL`, `0x8BADF00D` FRONTBOARD
watchdog, `WatchdogEvent: "scene-create"`, ~20s over the allowance —
**identical shape** to build 29's hang (§0.0-f).

**Confirmed NOT a simple regression**: `AlphonsoThemeManager.
updateSystemColorScheme`'s equality guard (build 29's actual fix) is
still present, unchanged, in the current code — checked directly, not
assumed. No theme-related file (`AlphonsoTheme.swift`, `RootView.swift`)
has a commit since that fix shipped. This is a *different* cause
producing the *same* watchdog signature, not the old bug coming back.

**New evidence this time**: one of the two crash logs has a much richer
stack trace than build 29's ever did — real CPU time (not blocked
wall-clock; ~20s of the ~20s elapsed was actual work on the main thread)
spent in `EnvironmentValues._set`/Swift generic metadata instantiation
(`_swift_getGenericMetadata`, `getOrInsert`), reached via
`_UIHostingView.updateEnvironment()` →
`ViewGraphRootValueUpdater.updateGraph()` → `GraphHost.
flushTransactions()`. The *other* crash log's trace instead goes through
`-[UIWindowScene _systemUserInterfaceStyle]` →
`_screenTraitCollectionWithOverridesAppliedFromSceneUISettings` →
`_UIHostingView.updateEnvironment()` — the same environment-propagation
machinery the original bug looped through, but apparently triggered by
something else this time (no custom `EnvironmentKey` exists anywhere in
this codebase — grepped, confirmed).

**What's been ruled out**: a revert of the build-29 fix (checked directly,
still present); a new custom `EnvironmentKey` (grepped, none exist); any
change to `RootView.swift`/`AlphonsoTheme.swift`/`AlphonsoComponents.swift`
since the fix shipped (checked git log, none).

**Build 39**: re-added `LaunchBreadcrumbs.swift` (the exact mechanism — a
`Documents`-directory file log, `fsync`'d per line, readable via the
Files app with no Mac — that found build 29's real cause in a
106,630-line log). Reinstrumented the same five checkpoints
(`LearnWithAlphonsoApp.init()`'s five `@State` singletons, `Session.init`,
`PodcastAudioPlayer.init`, `RootView.body`), plus one new checkpoint
specifically around the `systemColorScheme` `.onChange` handler.

**Build 40: the real cause, found in the returned log.** The account
owner reproduced the hang and shared `launch-breadcrumbs.log`
(132,547 lines). The very first lines after launch already show it:
`RootView.body evaluating` → `onChange(systemColorScheme) firing,
newValue=dark` → `onChange(systemColorScheme) done` → `RootView.body
evaluating` (again) → `onChange(systemColorScheme) firing,
newValue=light` → ... alternating **dark/light on literally every
render**, from the very first frame, at sub-millisecond intervals (far
too fast to be a real system appearance change — a genuine internal
feedback loop). Root cause: `RootView`'s `@Environment(\.colorScheme)`
read, combined with `.preferredColorScheme(...)` applied to that same
view's content, formed exactly the kind of loop this pattern is known
to create — `.preferredColorScheme` can write back into the hosting
window's own trait collection, which `@Environment(\.colorScheme)` then
re-reports as a "new" system change on the very next render, forever.
(Checked and ruled out first: every theme's palette data is internally
self-consistent, light-tagged/dark-tagged correctly for all three
themes with a dark variant — this was never a data bug.)

Fixed by replacing the reactive `@Environment(\.colorScheme)` +
`.onChange` pair with an imperative read of `UIScreen.main.
traitCollection.userInterfaceStyle` at two controlled points (`.onAppear`
for launch, and the existing `.onChange(of: scenePhase)`'s `.active`
case for returning to foreground) — `UIScreen` itself is never affected
by this app's own `overrideUserInterfaceStyle`/`.preferredColorScheme`
(those apply to windows/view controllers, never to the screen), so
there's no reactive binding left for the loop to feed back into.
Known, accepted trade-off: toggling Dark Mode via Control Center while
the app is already in the foreground won't be picked up live anymore,
only on next foreground — a real regression, but a minor one next to
the app not launching at all. `LaunchBreadcrumbs.swift` kept in this
build to confirm the fix; remove once confirmed.

**CONFIRMED 2026-09-29**: the account owner updated to build 40 and
reported "no more crashes." `LaunchBreadcrumbs.swift`, its five call
sites, and the two temporary `Info.plist` keys it needed
(`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`) were all
removed again in build 41, matching the exact same remove-once-confirmed
discipline as build 29's original hang (§0.0-f).

**Also requested**: add Sentry for durable crash diagnosis going forward,
instead of ad-hoc breadcrumb files each time this class of bug recurs.
Not yet added — needs a Sentry account/DSN from the account owner before
it can be wired in. Tracked here as a real, not-yet-started follow-up.

## 0.0-i Business follow-up: podcast content partnership — 2026-09-28 — OWNER-ONLY (2026-10-09: a business conversation; note #262 now publishes licensed-only episodes, so any ingest must respect that rule)

**Contact [zappenglish.com](https://zappenglish.com) about collaborating on
publishing their already-published audio podcasts in Learn with Alphonso.**
Not a code task — a partnership/licensing conversation the account owner
needs to have. Relevant context for whoever picks this up: the Listen tab's
podcast library (`PodcastClient.swift`, admin upload flow in
`admin/routes/folder.$id.tsx`) already supports adding new episodes to an
existing folder tree, so technically ingesting licensed third-party audio
is not a big lift once rights are actually secured — the open question is
entirely the business/licensing side, not engineering.

## 0. How to use this file

- Skim the section headers to find the area you care about.
- Each item names its source doc(s) for full detail — read those before
  implementing anything non-trivial.
- "Priority" is a judgment call from the session that wrote this, not
  gospel — re-rank freely as real usage/feedback comes in.

---

## 0.0-h Builds 32-35: "Empty or missing audio" — 3 real but insufficient fixes, then the actual cause — 2026-09-28

Build 31 launched clean (§0.0-f fix confirmed working on a real device).
Testing it immediately surfaced a new, unrelated bug: holding the mic
button on Practice or Hector and releasing produced a raw server error,
`"Empty or missing audio"` — literally `api/stt.ts`'s own 400 response
when the uploaded file is under 512 bytes.

**Layer 1 (build 32): minimum recording duration.** A too-quick tap, or
the recorder's own hardware warm-up after `AVAudioSession.setActive`,
could finalize before `AVAudioRecorder` had captured anything
meaningful. Fixed by guaranteeing a real 400ms minimum run (delaying
the actual `stop()` if released early, not just padding a timer), then
dropping a still-too-small result silently — same posture as an empty
transcript already had. **Swept for the same pattern rather than
assuming ConversationView/HectorView were the only two**: grepped every
`AVAudioRecorder` usage in the app and found two more copy-pasted
instances of the identical bug — `CampaignTurnRecorder` (connected
multi-scene campaigns) and `SpeakTurnRecorder` (the "speak" question
type in regular lessons, whose own generic catch-all made this
particular bug look like a *different*, even more confusing symptom
there). All four fixed identically.

**Layer 2 (build 33): the real remaining cause.** Shipped 32, tested
Hector again — still "Empty or missing audio". The duration fix only
helps a too-short *successful* capture; it cannot produce audio from a
recorder that never actually started.
`SpeakQuestionCard.swift`/`SpeakTurnRecorder` already had the actual
fix, with its own doc comment explaining exactly why: relying on
`AVAudioRecorder.record()`'s IMPLICIT system permission prompt is
unsafe. A denied (or not-yet-resolved) microphone does not make
`start()` throw — `record()` just returns `false` and the file stays
empty, silently, regardless of hold duration.
`ConversationView`/`HectorView`/`CampaignView`'s `TurnRecorder`
variants never got this fix when they were written. Applied the same
explicit `AVAudioApplication.requestRecordPermission` call, matching
`SpeakQuestionCard` exactly, to all three.

**Layer 3 (build 34): a systematic sweep before shipping again, on
explicit instruction** ("look for similar bugs" / "don't ship back to
back" / "solve the issue once and for all") — used the codebase
knowledge graph (`search_code`) rather than continued ad-hoc grep,
across every `AVAudioRecorder`/`AVAudioPlayer` call site. Found two
more real, pre-existing bugs (not introduced by layers 1-2):

- `RecordingState.shared.began()`/`.ended()` could desync on ANY
  `start()` failure, not just `record()` returning `false` —
  `setCategory`/`setActive`/the recorder initializer throwing after
  `began()` already ran left nothing to call the matching `ended()`.
  `RecordingState` is a **counter**, not a boolean (deliberately, so
  independent screens / a review queue's interleaved items don't
  clobber each other) — so repeated failures would compound. Left
  stuck, `PodcastAudioPlayer.handleInterruption` (which reads this
  counter to decide whether a genuine interruption, e.g. a phone call,
  should resume playback after) would silently refuse to resume a
  podcast after a real call, for the rest of the app's process
  lifetime — a completely unrelated-looking symptom from the same root
  cause. Fixed by wrapping each `start()`'s whole body in do/catch,
  calling `ended()` on any failure path before rethrowing.
- `AVAudioPlayer.play()` — the REPLY audio, not the recording — has the
  identical discarded-Bool shape `record()` had. If it silently fails
  (a session conflict is the most plausible trigger, moments after the
  same screen was just recording), the turn would complete with the
  reply text visible and total silence, no error at all — strictly more
  confusing than the bug just fixed, since nothing would look wrong.
  Now checked in all three conversation/Hector/campaign playback sites.
  Deliberately did NOT touch `PodcastAudioPlayer.swift`'s own
  `player?.play()` calls — different, unrelated, already-working
  feature; fixing it speculatively would have been real scope creep.

Also checked at the time (turned out to be **wrong** — see Layer 4
below, kept here uncorrected as a record of the actual mistake rather
than quietly rewritten): "`AIConversationClient`'s HTTP/error-handling
layer, already hardened earlier this session (server messages now
propagate correctly) — no sign of the same discarded-Bool/discarded-
error shape." That check looked at *error handling* (does a non-2xx
response surface its message correctly) and never actually looked at
*what request gets sent in the first place* — a different question
entirely, and the one that mattered.

**Layer 4 (build 35): the actual cause, found after "still empty" on
build 34.** `AIConversationClient.transcribe()` sent the recorded audio
as a raw binary POST body with `Content-Type: <mimeType>`, on a
doc-commented assumption that `api/stt.ts` read the raw body directly.
It doesn't: it calls `request.formData()` and looks for a field
literally named `"file"` — exactly what the **web app's own caller**
(`use-speech-capture.ts`) already correctly sends via a real
`FormData`. A raw-body POST is not `multipart/form-data`, so
`request.formData()` finds nothing, `file` is `undefined`, and the
server returns `"Empty or missing audio"` **unconditionally, on every
single call** — completely independent of recording duration,
permission state, `RecordingState`, or how much real audio was
captured. This is why the identical error kept recurring after three
separate, individually-correct recording-side fixes: none of them
could have ever touched the actual bug. Confirmed the web app was
never affected (`use-speech-capture.ts` and
`campaign_.$campaignId.tsx` both already build proper `FormData`).
Rewrote `transcribe()` to build the same multipart body the web client
sends. **The test that let this ship in the first place** —
`testTranscribeSendsRawAudioWithContentTypeAndReturnsTheText` —
asserted the wrong wire format as correct, against a fully mocked
server response that never exercised `api/stt.ts`'s real parsing
logic; rewritten to assert the actual multipart structure including
the raw audio bytes present verbatim in the body, not just the framing
around them.

**Also fixed alongside it, found while re-verifying `api/stt.ts`'s
full parsing logic**: none of the four iOS callers ever sent the
optional `course` field Deepgram transcription language selection
reads, so every French/Spanish `SpeakQuestionCard` speaking question
had its audio transcribed with the English model regardless — a real,
separate accuracy bug. Added `course` as an optional parameter and
wired it through `SpeakQuestionCard` only (Practice/Hector/Campaigns
are genuinely English-only today — their content models carry no
course/language field at all, so the server's own "en" default is
already correct for them).

**Checked but deliberately not fixed right now**: a pre-existing,
unrelated Swift 6 concurrency warning pattern (a `var` mutated inside
a `@Sendable` test closure) spans 8 files across the Kit's test suite,
not just the one touched here. Warnings only, doesn't block CI today —
flagged as a real, scoped, separate follow-up rather than rushed
across files unrelated to this bug.

**Verification gap, stated plainly**: none of this has been confirmed
working end-to-end by an actual person yet as of this entry — build 35
is the one that should actually work, and hasn't been tested on a
device yet. The account owner granted themselves a promotional `pro`
RevenueCat entitlement directly (same mechanism the demo/reviewer
account already used) specifically so Hector could be tested without
waiting for Apple's first-subscription review — a real, reusable path
worth remembering for any future "can't test the paid feature" gap.

**Layer 5 (build 37): the actual cause of the post-35 symptom.** Build
35 shipped, and a live test confirmed the hard "Empty or missing audio"
error was gone — but a new report followed: Hector worked, once, after
several tries, then the mic button just reset silently with no error
(the empty-transcript branch firing, matching build 36's temporary
on-screen diagnostic). Added `console.error` logging to `api/stt.ts`
(web-only, no iOS rebuild needed) and read real production logs
directly via the Vercel MCP tools rather than guessing again:
`file.type` was always correctly `"audio/m4a"`, but Deepgram's own
reported `metadata.duration` was consistently ~0.46-0.51s regardless of
60-61KB file sizes (several real seconds of audio at that bitrate) —
proof the *file itself*, not the wire format, was the problem this
time. Root cause: `AVAudioRecorder.stop()`'s synchronous return does
not guarantee the file is finalized on disk — reading it immediately
after, as every `TurnRecorder.stop()` variant did, could catch it
mid-finalization: the raw audio bytes already flushed (correct file
size), but the container's own duration metadata still reflecting an
earlier, incomplete snapshot, so Deepgram only recognized that first
fraction of a second as real audio. Explains why one attempt worked at
all (pure timing) and most didn't. Fixed by making every `stop()` in
all four recorders (`TurnRecorder`, `HectorTurnRecorder`,
`CampaignTurnRecorder`, `SpeakTurnRecorder`) `async`, adopting
`AVAudioRecorderDelegate`, and awaiting
`audioRecorderDidFinishRecording` before reading the file — the
authoritative "file is done" signal, instead of assuming `stop()`'s
synchronous return implies completion. Removed the now-obsolete build
36 on-screen `"DEBUG: recorded..."` diagnostic from
ConversationView/HectorView once the real cause was understood.
**Verification gap, stated plainly**: not yet confirmed working
end-to-end on a real device as of this entry.

## 0.0-j Build 37 confirmed live, delegate fix did NOT resolve it — still open — 2026-09-28 — [2026-10-09 audit: SUPERSEDED, PARTLY VERIFIED. The gesture-container fix described below is in the current code (ios/LearnWithAlphonso/Sources/VoiceSession.swift:372 .contentShape(Circle()) on the stable outer container, rebuilt by PR #258 bc89da0); no later section reports the empty-audio symptom recurring. A real-device confirmation of the voice round trip is still owed, and the Limrun simulator cannot carry microphone audio.]

**Confirmed on a real build-37 device (TestFlight `processingState: VALID`,
account owner verified the app itself shows Build 37)**: Layer 5's
`AVAudioRecorderDelegate` fix did not fix the empty-transcript bug.
Vercel logs showed the identical failure signature (`deepgram_duration`
~0.46-0.49s on 60-63KB files) recurring minutes after the build went
live. The file-finalization-race theory (§0.0-h Layer 5) is ruled out
as the *whole* story.

**New diagnostic evidence**: a raw hex dump of a failing file's first 32
bytes decoded cleanly as a standard `ftyp` box (`M4A `/`mp42`/`isom`),
immediately followed by a second top-level box only **637 bytes** long
— far too small to be `mdat` (the real audio, ~60KB) in a normal
ftyp-then-mdat-then-moov (moov-last) layout. `api/stt.ts` now walks the
actual top-level MPEG-4 box structure (type + size per box) instead of
a raw hex dump, to confirm this by name rather than by eyeballing hex.

**Confirmed, and the leading theory above was WRONG.** Real box-walker
output on the next live attempt: `ftyp(28) moov(637) free(56671)
mdat(3722)`. `mdat` — the actual audio — is only ~3.5-4KB, matching
Deepgram's own reported ~0.5s duration *exactly*. The other ~56KB is an
unused `free` placeholder atom, a completely normal AVAssetWriter
pre-allocation for `moov` to grow into that a short recording never
needs. **There is no container corruption and no moov/mdat mismatch —
the recording genuinely only captures ~0.5 seconds of real audio every
time**, matching the account owner's own description exactly: "starts
buffering for a quick couple of seconds then goes back to mic. It
doesn't record anything practically."

**Build 38: real client-side timing, not another guess.** ~0.5s is
suspiciously close to `minimumDuration` (0.4s), the safety floor added
in §0.0-h Layer 1 — suggesting `stopRecordingAndSend()`'s equivalent
fires almost immediately after the press starts, and that floor is the
*only* reason any audio exists at all. Two candidate mechanisms remain,
indistinguishable from server logs alone: (a) the `DragGesture`'s
`onEnded` fires almost immediately regardless of real hold time, or (b)
`record()` itself — an `AVAudioSession` category switch away from
Hector's own just-finished TTS reply playback — takes nearly the whole
press just to actually start capturing. All four recorders now measure
both independently (true press-to-release, captured at touch-down
outside the async permission-check chain; and actual `record()`-to-
`stop()` span) and send them as a `debugTiming` field on
`AIConversationClient.transcribe`, logged server-side on the next
empty-transcript case. **Not yet confirmed which mechanism it is.**

**Also found and fixed while investigating (three separate real bugs,
all from the same round of live reports)**:

- **Session-expiry regression, Hector/Speak only**: `HectorView.sendTurn`
  and `SpeakQuestionCard.stopRecordingAndGrade` both read the raw,
  possibly-stale `session.accessToken` and built their
  `AIConversationClient` with no `refreshAccessToken` — unlike
  `ConversationView`/`CampaignView`, which already had the correct
  `freshAccessToken()` + retry-backstop pattern from an earlier fix that
  simply never got swept to these two screens. Matches the live report
  exactly ("session expired, had to sign out and sign in again"). Fixed
  both to match; also re-fetches a fresh token in `HectorView` before
  the second (Hector-respond) call, since `TutorConversationClient` has
  no 401-retry of its own.
- **"Hits a timeout" was UX, not a new bug**: build 37 removed the
  temporary build-36 `"DEBUG: recorded..."` message and left a bare
  `phase = .idle` reset with zero feedback on an empty transcript. A run
  of ~7 of these in a row (confirmed in the Vercel logs, matching "5 to
  6 times") with no message at all reads as the app hanging. All three
  conversation screens (`ConversationView`/`HectorView`/`CampaignView`)
  now show `"Didn't catch that -- try again."`, matching
  `SpeakQuestionCard`'s pre-existing pattern for the same case.
- **STT daily quota exhausted by the debugging itself**: the account hit
  61/60 STT calls today purely from retrying the still-broken feature.
  Raised `stt`'s daily cap 60 → 300 (`20260930050000_raise_stt_daily_limit.sql`,
  applied directly to the live DB, `src/lib/ai-quota.server.ts`'s
  `DAILY_LIMITS.stt` updated to match per that file's own
  keep-in-sync warning) and reset the account's already-consumed count
  to 0 for today via a one-time direct DB update (deliberately *not*
  part of the migration — a migration should be replayable/idempotent,
  a one-account reset should not be). **Revert note**: 300/day is a
  temporary debugging allowance, not a considered production limit —
  reconsider once this bug is actually closed.

**The actual root cause of the whole saga, found 2026-09-29 — a
premature gesture release, not a recording/network/session bug at
all.** Live feedback made it unmistakable: a full sentence in, "one
word" out; "can you help me prepare for a job interview" heard as
"could you"; "yes yes" transcribed as "Sorry"; many tries needed to
record even one word. Pulled the `debugTiming` field (added in build
38, still live) from real Vercel logs across ~15 live attempts:

```
press=0.21 capture=0.40   press=0.13 capture=0.43   press=0.06 capture=0.41
press=0.06 capture=0.40   press=0.09 capture=0.42   press=0.13 capture=0.41
press=0.05 capture=0.43   press=0.20 capture=0.42   press=0.18 capture=0.41
press=0.96 capture=0.94   press=1.23 capture=1.10
```

`press` (the real touch-down-to-touch-up span, measured independently
of the recorder) was almost always well under 0.3s — as low as 0.05s —
while `capture` sat right at the `minimumDuration` safety floor (0.4s,
added in Layer 1 of this same saga) *regardless* of how short `press`
was. The only two samples with a genuinely long `press` (0.96s, 1.23s)
show `capture` tracking it almost exactly. This proves the safety floor
was the *only* reason any audio ever existed — the button's own release
was firing almost instantly, no matter how long the account owner
actually held it down.

Root cause: the mic button was one `Circle` whose own `.fill()` color
changed with `isRecording`, with the `DragGesture` attached directly to
that same view. A view mutating its own appearance in response to state
a gesture attached to it just set can reset/invalidate the in-flight
gesture recognizer, firing a false `.onEnded` almost instantly — a known
SwiftUI fragility, and exactly consistent with every symptom above
(and very plausibly the *actual* cause behind some of the earlier
"empty or missing audio" reports too, layered underneath the real bugs
Layers 1-5 already fixed). Fixed across all four recording screens
(`ConversationView`, `HectorView`, `CampaignView`, `SpeakQuestionCard`)
by moving the gesture to a stable outer container (`Color.clear` +
`.contentShape(Circle())`) whose own appearance never changes; the
color-changing `Circle` is now purely visual, nested inside with hit-
testing disabled. `SpeakQuestionCard`'s VoiceOver-specific
`.accessibilityDirectTouch`/`.accessibilityLabel` modifiers moved to the
new outer container along with the gesture, unchanged otherwise.

**Shipping in build 41**, bundled with §0.0-k's confirmed launch-hang fix
(and its now-safe-to-remove `LaunchBreadcrumbs.swift`), once build 40's
launch fix was confirmed working on a real device. **Not yet confirmed
working** as of this entry — waiting on the account owner's next real
Hector/Practice/Campaign/Speak attempt.

## 0.0-g Apple revocation: closed the observability and manual-fallback gaps — 2026-09-28

A second-opinion audit correctly identified that Sign in with Apple
revocation, while functionally real end-to-end (verified: sign-in
captures the code → `/api/apple-link` exchanges it for a refresh token
→ stored → `revokeAppleGrant` retries once on deletion →
`appleRevocationStatus` read client-side), had no way to notice a
silent failure and no fallback for the user when automatic revocation
can't be guaranteed — exactly what Apple's own review guidance calls
for.

Verified one claim directly against the live deployment rather than
trusting the audit's assertion: probed
`https://learn.alphonsoecosystem.app/api/apple-link` with a
bogus-but-present Bearer token. The response was
`{"linked":false,"reason":"unauthorized"}` (401), not
`"not-configured"` — proof `appleConfigFromEnv()` resolves non-null in
production right now, since that check runs before the auth check. All
four Apple secrets are genuinely live. (The other half of the
requested proof — a real account storing a token and deletion revoking
it — needs an actual device test with a real Apple ID, not something
safe to fabricate.)

**DONE**: server-side `console.error` on every failure branch in
`apple-link.ts` (checkable from Vercel's dashboard, no Mac needed),
matching client-side `print` in `Session.linkAppleAuthorization` for
the one failure mode server-side logging can't see (a request that
never reaches the server at all). Neither changes behavior — both stay
fail-soft/fire-and-forget by design. Added Apple's own recommended
fallback (manual revocation path: Settings → [name] → Sign-In &
Security → Apps Using Apple ID, or appleid.apple.com) to `privacy.tsx`'s
"Your rights" section, plus a one-line pointer to it in the iOS
delete-account confirmation alert.

**Deliberately NOT done**: a durable retry queue for persistent
revocation failures — already explicitly scoped out (§0.0-e's own
entry): a synchronous inline deletion-request handler is the wrong
place for job-queue infrastructure. The fixes here close the practical
gap instead (discoverable failures + a real user fallback).

## 0.0-f Build 29's launch hang — found and fixed — 2026-09-28

Build 29 (first clean upload on §0.0-e's fixed signing pipeline)
installed fine but hung on launch on a real device, every time —
never showed a single frame. The device's own crash log (`.ips`, from
Settings → Privacy & Security → Analytics Data — no Mac available for
Xcode Organizer) showed `EXC_CRASH`/`SIGKILL` with termination reason
`0x8BADF00D`, a FRONTBOARD watchdog kill, `WatchdogEvent: "scene-create"`,
"exhausted real (wall clock) time allowance of 19.76 seconds" — a hang
the OS kills, not a genuine crash/trap. Predates this session's other
fixes entirely: happened identically on builds 27, 28 and 29.

Ruled out via source review before touching anything: the `test_`
RevenueCat key crash (confirmed real production key both pre- and
post-archive), `AppDelegate` (no `didFinishLaunching` override exists
at all), semaphore/blocking-wait patterns (`DispatchSemaphore`,
`.wait()`, `Thread.sleep` — none found anywhere in `ios/`), and
`ContentStore`'s JSON decode (a handful of small files, plain
`Data(contentsOf:)` + `JSONDecoder`).

**Neither a console log nor on-screen debug text could localize this**
— no Mac to read Xcode's device console, and nothing ever renders long
enough on-device to show debug text either (the standard workaround
this repo used for an earlier no-Mac debugging round). Build 30 added
`LaunchBreadcrumbs.swift` instead: a timestamped checkpoint written to
a file in the app's own Documents directory, `fsync`ed after every
line so a checkpoint survives even if the app is killed immediately
after, at every `@State` singleton's `init` and the top of
`RootView.body`. Readable from the **Files app** (On My iPhone → Learn
with Alphonso) regardless of whether the app ever successfully
launches, since Files reads the directory straight from disk rather
than through the running process — a real, working diagnostic path
with zero Mac dependency, worth remembering for the next no-device-access
crash.

The resulting log was the answer by itself: **106,630 lines**, the
last ~100,000 of them the single line `RootView.body evaluating,
isRestoring=true`, repeating in a tight loop for the full ~20s before
the kill. An infinite re-render, not a one-time slow step.

**Root cause**: `AlphonsoThemeManager.updateSystemColorScheme(_:)`
unconditionally reassigned `systemColorScheme` on every call, no
equality guard — unlike the very next method in the same file,
`setTheme`, which already has `guard id != themeID else { return }`
for exactly this reason. `@Observable`'s generated setter fires a
change notification on ANY assignment, even to an identical value
(unlike `@Published`, it does not gate on equality itself).
`RootView.body` reads that same property (via `AlphonsoColor.surface`
and `.preferredColorScheme`), so every redundant reassignment
re-triggered a re-render, which re-fired
`.onChange(of: systemColorScheme, initial: true)`, which reassigned
again — a tight synchronous loop with no fixed point, pinning the main
thread and starving `session.restoreSession()`'s task of any chance to
run, which is also why `isRestoring` never flipped to `false` in the
log either.

**DONE.** One-line equality guard added, matching `setTheme`'s existing
pattern. `LaunchBreadcrumbs.swift`, its call sites, and the two
temporary `Info.plist` keys (`UIFileSharingEnabled`,
`LSSupportsOpeningDocumentsInPlace`) all removed again in build 31,
the fix itself.

## 0.0-e The real `aps-environment` root cause, plus two more re-audits (Kimi, Genspark) — 2026-09-28

§0.0-d above closed the archive-checks gap and claimed `aps-environment`
resolved to `production` in the signed binary. It didn't, reliably --
the very next real signed-archive run (and the one after that) failed
this exact check. Three attempts, in order:

1. **Deprecated codesign syntax** (`--entitlements :PATH` instead of
   `--entitlements - --xml`) -- real bug, real fix, did NOT resolve the
   failure. Kept because it's still the correct modern syntax.
2. **Stale/incomplete provisioning profile** -- regenerated it via
   `regenerate-ios-profile.yml`. The regeneration script's own
   diagnostic print looked like it confirmed the NEW profile was also
   missing the capability. It wasn't: that print filters entitlement
   keys by `.includes("com.apple")`, and `aps-environment` has no such
   prefix, so the script was silently misreporting its own output.
   Confirmed by decoding the profile's raw CMS payload directly
   (`openssl smime -verify -noverify`) -- `aps-environment: production`
   was there the whole time. Fixed the script's print filter (scoped to
   the plist's actual `<Entitlements>` dict) so this doesn't fool
   anyone else. Rotated the live `IOS_PROVISIONING_PROFILE_BASE64` /
   `_UUID` secrets to this verified-good profile anyway, since it *is*
   correct and current.
3. **The real cause.** Added a temporary diagnostic step comparing the
   `.xcarchive`'s own signed `.app` against its embedded provisioning
   profile, before `-exportArchive` ever runs. The profile had
   `aps-environment`; the archived app's own signature did not --
   ruling out the export step entirely and pointing at `xcodebuild
   archive` itself. `ios/LearnWithAlphonso/project.yml`'s target-level
   `entitlements.properties` block -- what XcodeGen uses to register a
   target's capabilities into the generated `.pbxproj`'s
   `SystemCapabilities`, consulted separately from and BEFORE whatever
   `CODE_SIGN_ENTITLEMENTS` override file is set -- only listed App
   Groups and Sign in with Apple. Without a matching `aps-environment`
   entry there, `xcodebuild archive` doesn't know Push Notifications is
   a capability this target has, so it silently drops the entitlement
   from the real signed binary regardless of what the hand-written
   `.entitlements` files or the profile say. Unlike a missing App Group
   or Sign-in-with-Apple entitlement (hard codesigning failure), a
   missing Push Notifications capability *registration* fails silently
   -- the asymmetry that made this take three attempts. **DONE** --
   added the missing property; confirmed with a full real signed
   archive run that printed "All post-archive checks passed," then a
   second full run with `upload_to_testflight=true`.

**Kimi audit (5 claims) and Genspark audit (submission-readiness report,
read-only from GitHub) — both verified against the live repo/API before
fixing anything, not taken at face value:**

~~Apple revocation "doesn't exist yet"~~ **FALSE, but the evidence for
it was real.** The pipeline is fully wired end-to-end (sign-in captures
the code -> `/api/apple-link` exchanges it for a refresh token ->
stored -> `revokeAppleGrant` with retry on deletion ->
`appleRevocationStatus` read and logged client-side) -- traced the
whole chain to confirm. Three doc comments (`Session.swift`,
`SettingsView.swift`, `AppleSignInPresenter.swift`) still described a
"no server-side revoke step exists yet" design that predated the real
implementation, plus a genuinely dead `appleAuthorizationCodeForRevocation`
stored property nothing ever reads (the real forwarding happens inline
via the local `result.authorizationCode`, not by reading that field
back later). **DONE** -- removed the dead property, corrected all three
comments.

~~`attributesOfItem(atPath:)` is an undeclared Required Reason API~~
**DONE, confirmed real.** `PodcastDownloadManager.swift:179` reads only
`.size`, but the API itself is one of Apple's specifically enumerated
File Timestamp APIs regardless of which attribute key is read. The
manifest only declared `UserDefaults`. Added
`NSPrivacyAccessedAPICategoryFileTimestamp` with reason `3B52.1`.

~~`project.yml`'s bundle-ID comment~~ **DONE, confirmed stale.** Still
called `PRODUCT_BUNDLE_IDENTIFIER` "a placeholder pending a real
decision," years after it was registered and baked into App Store
Connect, RevenueCat, both entitlements files, APNs and every
provisioning profile. Comment only, value untouched (per Genspark's own
explicit caution not to touch the live identifier).

~~"An empty `REVENUECAT_API_KEY` is silently accepted"~~ **Already
false as of this session** -- `git blame` traces that guard's hardening
(rejects empty, not just `test_`-prefixed) to commit `4da4355`, which
predates both audits' snapshots. No change needed.

~~"Search history is an undeclared data type"~~ **Not substantiated** --
no server-side persisted search-history storage exists anywhere in the
codebase. No change.

**Both confirmed real and genuinely outside code's reach**, via a live,
read-only App Store Connect API check run today: the "Alphonso Pro
Monthly" subscription is still `state: MISSING_METADATA` (no
localization, price, or review screenshot attached), and the app
version itself is still `appStoreState: PREPARE_FOR_SUBMISSION` --
nothing has been submitted for review yet. Both need the account owner,
in App Store Connect, not another audit round.

## 0.0-d A third re-audit (ChatGPT), 6 real findings, all fixed — 2026-09-28

Re-audit of the second ChatGPT round above. 2 items were judged
already-correct-by-design on verification (SIWA revocation's
deliberate never-block-deletion posture; the exact-SHA archive gap,
which just needed a fresh run). The other 6 were real and fixed:

~~UGC filter has a multilingual correctness gap~~ **DONE, confirmed a
real bug.** `normalize_for_moderation` stripped accented characters
(not transliterated), while the blocklist's own `enculé`/`coño`
entries still had theirs -- traced by hand that neither could ever
match anything. Fixed by extending the existing leetspeak
`translate()` table to also fold 25 common accented Latin letters to
their base form, and normalizing the blocklist term too (not just the
input) so a future accented addition just works.

~~RevenueCat key check accepts empty~~ **DONE** -- tightened both the
pre-archive and post-archive checks to also reject empty, not just
`test_`-prefixed.

~~Archive checks are incomplete~~ **DONE** -- now also checks the
WIDGET's own signed entitlements (separate signature/profile) for
application-groups, and confirms `aps-environment` actually resolved
to `production` in the signed binary.

~~AI tutor safety is weak~~ **DONE for the input side.** Hector's
`buildHectorMessages` let a client-supplied history entry claim
`role: "system"` after Hector's real system prompt -- checked
TutorMemoryContext's own legitimate priming message already uses
`role: "user"`, so nothing real was lost by refusing "system"
outright. Added bounded history length (40) and message length
(4000 chars). Found and fixed the identical shape in `/api/chat.ts`
too. Output-side moderation (filtering what the model says back) is
a real, separate, larger feature -- not attempted here.

~~Apple revocation failure is only logged, not remediated~~ **DONE,
proportionately.** Added one retry after a short fixed backoff in
`revokeAppleGrant` -- closes the "one-off blip" case. A genuine
outage still needs a human; a full retry queue was judged out of
scope for code running inline in a user-facing deletion request.

Verified: `tsc --noEmit` clean, 33 tests pass (3 new regression tests
in `hector-conversation.test.ts`), full CI green including the new
migration's live deploy, and a fresh signed archive run against the
exact commit that shipped these fixes (see Part 0 of the audit doc
for the result).

## 0.0-c Documentation accuracy pass — fixed 2026-09-28

Found while updating docs after the second ChatGPT audit below:
ARCHITECTURE.md and AGENTS.md both still described Hector as running
on AlphonsoCompanion's separate Cloud Voice backend/Supabase
project/sign-in (true before the 2026-09-27 decouple, false after —
and two files they named by path, `HectorSession.swift` and
`DeviceEnrollmentClient.swift`, are deleted). Both also still said
RevenueCat had no real Offering configured, which has been live and
confirmed working for days. README.md had the same Cloud Voice claim.
All three corrected; a stale `appleRevoked` field-name reference (see
0.0-b below) fixed too.

## 0.0-b Second ChatGPT audit — 8 findings, all verified — fixed 2026-09-28

2 P0 + 6 P1, each independently checked against the live repo before
fixing:

~~UGC has no pre-publication content filter~~ **DONE.** Confirmed zero
filters existed anywhere (Guideline 1.2 needs one on top of the
already-shipped report/block). Added a Postgres trigger on
`profiles.display_name` (the direct-PostgREST-PATCH write path with no
server function to validate in) plus an inline check in `create_team`,
sharing one blocklist function.

~~Apple grant revocation failures are silently swallowed~~ **DONE.**
`revokeAppleGrantForUser` returned a bare boolean that collapsed
"nothing to revoke" and "genuinely failed" into the same value, and
nothing anywhere (web, admin, iOS) ever read the result. Now a 3-state
`"revoked"/"not_applicable"/"failed"`, logged server-side on failure,
decoded and logged by the iOS client too.

~~Privacy manifest declares zero collected data~~ **DONE** — this was a
gap in the prior audit round's own fix: only the required-reason API
section got filled in. Added all 8 categories from the vetted Shipaton
nutrition-labels doc.

~~Release workflow can silently ship a test_/bad RevenueCat key~~
**DONE** — checks the substituted value before archiving and the
actually-exported `.ipa`'s Info.plist after.

~~No post-archive validation~~ **DONE** — unzips the real `.ipa` and
checks the widget is embedded, the privacy manifest is present, the
final key isn't `test_`, and signed entitlements include both
application-groups and applesignin.

~~Xcode not pinned/validated~~ **DONE** — Apple has required Xcode 26+
for all new submissions since 2026-04-28 (already in effect, confirmed
against current Apple documentation, not a future concern). Added an
explicit floor check rather than a hardcoded pin.

~~Privacy policy not reachable from Settings~~ **DONE** — added
alongside the paywall/AI-disclosure links that already existed.

~~Subscription cancellation is instructions-only~~ **DONE** — added a
native `manageSubscriptionsSheet` button next to Restore Purchases.

All verified: `tsc --noEmit` clean, 36 relevant vitest tests pass, all
10 `AccountClientTests` (Kit, run locally via `swift test`) pass, and
the full CI suite green including the new migration's live deploy.

## 0.0-a Practice/Hector's misleading error, and the admin's missing upload UI — both fixed 2026-09-28

Two items reported directly by the account owner this session, not
previously tracked here:

~~Practice (ConversationView) and Hector's catch blocks always showed
"Something went wrong. Try again." even when the server sent a
specific, useful message~~ **DONE.** Most likely cause of the actual
report ("it tells me to try again later"): a real
`ai-quota.server.ts` daily-limit 429, whose message
("Daily CHAT limit reached (60/day). Try again tomorrow.") was being
silently discarded. Now surfaced when present.

~~The admin app had no UI to create a brand-new episode — only
`scripts/podcast-tool.ts add` could~~ **DONE** — see the CHANGELOG's
"New episode upload form" entry. Not yet verified end-to-end against
the live admin site (no admin credentials available this session);
worth a real click-through + confirming the MP3 plays correctly in the
iOS app afterward.

## 0.0-b A second-opinion (ChatGPT) audit, cross-checked and fixed — 2026-09-28

Four claimed P0s + 2 "nice to have"s, each independently verified
against the live repo/API before fixing (not taken on faith):

~~App Group entitlement missing from Release~~ **DONE, and it was worse
than claimed** — missing from Debug too. The widget's own
auto-generated entitlements already had `group.com.obsidianmedia.
learnwithalphonso`; the main app's hand-written Debug/Release
entitlements (what `CODE_SIGN_ENTITLEMENTS` actually points at) never
did, so the main app could never legitimately write into the shared
container. Fixed, and proven via a real signed archive run —
codesigning succeeded, so the Distribution provisioning profile
already supports the capability.

~~RevenueCat/StoreKit not provably working~~ Same root cause as the
existing "app not submitted" blocker — nothing new to fix.

~~privacy.tsx vs support.tsx contradict each other about Hector
deletion~~ **DONE.** support.tsx still said "separate account,
different system, email us to delete manually" while privacy.tsx
already correctly said deletion is automatic. Fixed support.tsx,
added a regression test (none existed before), also fixed the same
stale claim in Shipaton's `privacy-nutrition-labels.md`.

App Store Connect manual-verification items: ran a live check that
sharpens this a lot — the subscription's state is `MISSING_METADATA`
because its **App Store review screenshot is genuinely missing**
(`null`), despite an earlier record claiming it was uploaded
2026-09-23. **Decision: left as-is** — a real, non-error screenshot of
the paywall can't exist until the app is actually submitted (the
paywall genuinely shows "can't load options" pre-submission; the
project's own shot list already documents this and a prior near-miss).
Explicit, accepted gap now, not an unknown one.

~~Paywall has no Terms/Privacy links~~ **DONE** — added to
PaywallView.swift, required per Guideline 3.1.2.

~~Delete-account text doesn't mention the Apple subscription
continues~~ **DONE** — added to the delete confirmation alert.

All verified green in CI (ios-app-build, ios-swift-tests, e2e,
admin-build, lint-and-typecheck).

---

## 0.0 NEW-USER SIGNUP WAS BROKEN — fixed and applied 2026-09-25

**A first-time user could not sign up.** The app asked for a 6-digit code
that was never sent. Reproduced on a clean simulator with an address that
had never signed up: entering it and tapping **Send code** advances to
"Enter the code sent to <address>" — and the email that arrives is
Supabase's **Confirm signup** template, a *link*, with no code in it.

**Root cause, and it is worse than "never fixed" — it was fixed for the
half that could be tested.** `scripts/update-auth-email-template.ts` was
written 2026-09-21 against exactly this symptom and patched
`mailer_templates_magic_link_content` only. Its own comment states the
assumption that broke it: *"Supabase sends its single 'Magic Link' email
template with every OTP request."* It does not — that template goes out
only when the address already belongs to a **confirmed** user. A
first-time address gets **Confirm signup** from the identical
`/auth/v1/otp` call.

**The verification is the lesson.** §5 of this file recorded it as
"Confirmed working via a real end-to-end test (user received a real
6-digit code)". That test was genuine — real device, real inbox, real
code — and was run from an account that already existed, which is the
only kind the person running it had. It proved the working path worked
and was structurally incapable of touching the broken one.

Custom SMTP via Resend was configured the same day and was never the
problem; delivery works, the template was the bug.

**FIXED AND APPLIED LIVE.** Both templates now render from one shared
`CODE_EMAIL` constant, so updating one and forgetting the other is no
longer expressible. Workflow run `36198431764` succeeded.

**Verification still owed, and it is the part that matters.** Use Gmail
plus-addressing — `<owner>+new1@gmail.com` is a brand-new address to
Supabase and lands in the same inbox.

---

## 0.0b External App Store audit — verified accurate (2026-09-25)

Full text and verification:
`D:\AgentDevWork\repos\Hackaton\Shipaton\06-risks-and-gaps\2026-09-25-external-app-store-audit.md`

**Every load-bearing claim checked against the code. Nothing disputed.**
Sign in with Apple missing, native deletion missing, export missing,
block/report missing, session in-memory only (`Session.swift:6` said so
verbatim), `lingua.app` addresses live, iPhone-only — all true. **The
Hector claim was worse than described:** `AppConfig.swift:26` points at a
different Supabase *project*, not merely a second table.

**Its blind spot was the deadline.** It assessed App Store readiness
correctly and never weighed Devpost's 2026-09-30.

---

## 0.0c Xcode 26 requirement — already satisfied (2026-09-25)

Build 22's release run used **Xcode 26.6** with the **iPhoneOS 26.5
SDK**, because `ios-release.yml` runs on `macos-latest`. The flip side:
`macos-latest` floats, so it satisfies the rule by timing rather than by
declaration.

---

## 0.0d P0 plan — three parallel sessions (2026-09-25)

Full reasoning:
`Shipaton\02-launch-checklist\2026-09-25-p0-plan-and-decisions.md`

**Governing decision: App Store approval will probably not land before
2026-09-30, and the plan does not pretend otherwise.** Devpost rides on
TestFlight plus a video and screenshots, and **the demo video must not
depend on the paywall** — that gate only clears on real review.

**Two protocol rules, both from the previous day's pain:** no session
edits ARCHITECTURE/AGENTS/README/CHANGELOG (the orchestrator does one
pass), and every session works in its own worktree. Result: eight PRs,
zero doc conflicts, zero file conflicts.

---

## 0.0e `deploy-supabase` failed three times on unrelated infrastructure (2026-09-26)

**Twice:** `supabase/setup-cli@v1` was pinned to `version: latest`, which
resolves the release through the rate-limited GitHub API — it failed with
`rate limit exceeded` before any migration ran.

**Once, in between:** `failed to bundle function: exit 135` — SIGBUS
during Edge Function bundling. Also not our code.

**The rule that generalises:** when `deploy-supabase` is red, identify
*which step* failed before concluding anything about migrations. This job
applies migrations, deploys Edge Functions, syncs APNs and seeds the
curriculum, and this repo has already lost weeks to a genuinely broken
deploy chain nobody noticed. **None of the three red X's was our code.**

**FIXED:** the CLI is now pinned to `2.118.0`. Two failures from the same
cause stopped being a flake and became a defect. Bump deliberately.

---

## 0.0f SettingsView's Hector copy contradicts the privacy policy (2026-09-26)

**`SettingsView.swift` says** Hector "uses its own account. Sign out of
Hector separately to remove it from this device." **The privacy policy
now says** (#151) deletion does **not** remove it and the path is
`privacy@`.

Both are literally true and they read as different promises. "Sign out
separately to remove it" invites the reading that signing out deletes
the account; it is local only.

**Worth noting how it arose.** #147 wrote that copy deliberately and
well, to avoid implying full erasure. It only became a contradiction
once #151 documented the real process a day later. **Two accurate
statements written a day apart that do not agree** is a different
failure from either being wrong, and is invisible from inside either PR.
Assigned to the session that found it.

---

## 0.0g Generated Supabase types were 19 tables stale (#153, 2026-09-26)

Missing **19 tables**, not the 4 migrations' worth the task was scoped
around — reported plainly rather than quietly fixing only what was named.

Every unknown table types as `never`, so reaching one required a cast:
`as any` in `account.functions.ts` and `apple-link.ts`, and an entire
`untyped()` helper in `admin.functions.ts` and `podcast.functions.ts`,
both of whose comments already said to delete it once types were
regenerated. **Each cast is a place a genuine type error passes
silently**, and they accumulate invisibly — two were added the day
before by the orchestrator.

**Now zero casts across all four files, `tsc --noEmit` clean with none
re-added.** That last clause is the claim that matters. Added
`.github/workflows/regenerate-supabase-types.yml`.

**Still open:** [DONE (verified 2026-10-09): the freshness check exists as the types-fresh job, .github/workflows/ci.yml:60, plus regenerate-supabase-types.yml; types.ts is regenerated by commits such as 6361714.] nothing stops it drifting again. A CI step that
regenerates and fails on a diff — same shape as the iOS content-export
freshness check — would close it. Assigned.

---

## 0.0h The types-staleness guard blocks every PR that adds a table (2026-09-26) — PARTLY DONE (verified 2026-10-09: no longer blocks anything, it is the separate non-gating job types-fresh at .github/workflows/ci.yml:60; the false-positive on table-adding PRs is still there, the check still compares against production, per the comment in ci.yml)

**#153's guard is correct on main and structurally wrong on a PR.** It
runs `supabase gen types --project-id <prod>` and fails on any diff. But
migrations are applied by `deploy-supabase`, which is `push && ref ==
main` — **post-merge**. So on a PR that adds a table, the checked-in
types are *ahead of* the database, not stale, and the guard reports the
PR's own new table as spurious. #157 (`hector_links`) is the first PR to
hit it; every future table-adding PR will too.

**It is not a false alarm in the usual sense.** The guard is comparing
against the wrong reference. Types should be derived from the
**migrations** — the thing in git — not from whatever production
currently happens to be. The fix is to generate from a local stack
(`supabase db reset` + `gen types --local`) so the invariant becomes
"types match the migrations", which is checkable at PR time.

**Why that fix was NOT made under deadline.** If production has drifted
from the migrations, switching the reference turns a three-PR blocker
into an every-PR blocker. Any such drift must be measured first, on a
branch, before the guard is switched. Doing that at 04:00 on a
submission day is how you lose the day.

**The shape to recognise.** This is the same class as §0.1's admin RLS
test: a guard whose *scope* is narrower than the confidence it projects.
That one ran nowhere; this one runs against the wrong thing. Both look
green-or-red convincingly while answering a question nobody asked.

---

## 0.0i The types guard DEADLOCKED the entire deploy chain (2026-09-26, live) — DONE (verified 2026-10-09: PR #204 3969bb5 split it into the non-gating job types-fresh, ci.yml:49-60, and deploy-supabase needs only [lint-and-typecheck, e2e, deno-tests], ci.yml:317)

> **DEADLOCK FIXED 2026-10-05, PR #204:** the types freshness check is now its own `types-fresh` job that `deploy-supabase` does not `need`, so it can no longer block a deploy. The underlying wrong-reference problem in §0.0h (it still compares against PRODUCTION, so it stays red on a table-adding PR until the migration is deployed) is NOT fixed; it is now merely advisory. Real fix still needs a local Postgres with the PR's migrations applied.

**Observed, not theorised.** `deploy-supabase` declares
`needs: [lint-and-typecheck, e2e]`. The types guard fails on any PR that
adds a table (§0.0h). So merging #157 put Phase 0 on main with
`hector_links` **absent from production**, and the job that would have
created it was *skipped because the guard that needed it was red*.

**The guard blocked the deploy; the deploy was the only thing that could
make the guard pass.** That job applies migrations, deploys Edge
Functions, syncs APNs and seeds the curriculum — all of it frozen on
every subsequent push, not just that one.

**Broken by hand:** the migration was applied in the SQL editor
**together with** an INSERT registering version `20260928040000` into
`supabase_migrations.schema_migrations`. Without that row `db push`
re-runs the migration and dies on `relation already exists` — trading
one deadlock for another. Verified after the fact: table present, RLS
on, **zero policies**, version registered, deploy green.

**The orchestrator predicted this would self-heal after merge and was
wrong**, having not read the job's `needs:`. The correct order was fix
the database *first*, then merge. **Read what a job depends on before
claiming a red check is harmless.**

**It recurs on the next table-adding PR** unless §0.0h is fixed.

---

## 0.0j `main` has NO branch protection and no rulesets (#161, 2026-09-26)

Confirmed via `gh api` — 404 on protection, `[]` on rulesets. **Every
check in this repo is advisory.** Nothing prevents a direct push to
main, and nothing prevents merging a red PR — the `--admin` flag used on
#157 was never needed.

Not changed by the session that found it: enabling protection is a real
behaviour change for every contributor, so it is the owner's call.
**Decide deliberately** — the whole merge discipline is currently
convention, and convention survives exactly as long as everyone is
careful.

---

## ~~0.0k `/api/hector-link` accepts an unverified Cloud Voice id~~ **MOOT 2026-09-27**

**The endpoint no longer exists.** Verified while triaging this
backlog: `git grep` across `src/`, `ios/` and `supabase/functions/` for
`hector-link`, `hector_links`, `HectorSession` and `cloudVoiceUserId`
returns zero hits anywhere in the tree. §0.1-e's Hector decoupling
(#189, 2026-09-27) deleted the entire cross-project bridge this
finding was about — there is no Cloud Voice id to accept, verified or
otherwise. Kept below for history, not because the fix is still owed.

The endpoint authenticated the **caller** but never verified they
control the `cloudVoiceUserId` they post — it is validated for uuid
*shape* only.

`onConflict` is `user_id`, so the `UNIQUE` on `cloud_voice_user_id`
protects only accounts that have **already** linked. Phase 2's entire
population is accounts that have not. An attacker who knows a victim's
Cloud Voice uuid can claim it first, which (a) silently breaks the
victim's own link forever, since every failure here is deliberately
soft, and (b) revokes the **victim's** Hector when the attacker later
deletes their own account.

**The precedent was already in the repo and the file cites it.**
`/api/apple-link` takes an authorization *code* and exchanges it,
specifically so it never trusts a claimed identity. Phase 2 copied the
soft-failure posture and dropped the part that made it safe.

**Fix:** `HectorSession.swift:79-80` already holds `session.accessToken`
beside `session.userID` — send the token, derive the id server-side.
When that config is absent, **fail closed to "not linked"**; a soft
fallback to trusting the posted id reinstates the hole. Soft failure is
right for *storage* and wrong for *authorization* — the distinction
Phase 1 got right.

---

## 0.0l The guard's prod-vs-local diff is platform skew, NOT drift (2026-09-26)

Measured before changing anything, on a throwaway branch, CLI on both
sides (never MCP — §0.0g). Three comparisons: checked-in **==**
production, byte-identical. Both **differ** from local-from-migrations,
by the same diff.

**Zero table or column differences.** The diff is entirely codegen
shape: `__InternalSupabase.PostgrestVersion`, `Json` vs
`NonNullable<Json>` on a NOT NULL jsonb column, and `never` vs
`Record<PropertyKey, never>` on zero-arg RPCs. Production runs Postgres
17.6.1; the local stack floats, and `config.toml` pins no
`[db] major_version`.

**So `supabase/migrations/` has NOT drifted from production.** Switching
the guard to `--local` as-is would convert an occasional false positive
into a permanent one on every PR forever — the escape-hatch outcome by
another route.

**Open question, not yet tested:** pin `major_version = 17` and
re-measure. Even if that closes it, note the residual risk — Supabase
upgrades production's platform *without us*, so a local reference can
break spontaneously. A Supabase **preview branch** (same platform
version, PR's migrations applied) is the reference with no skew by
construction.

---

## ~~0.0m The WEB app has no Block/Report at all~~ **DONE 2026-09-26, #167 — re-verified 2026-09-27**

`app-review-notes.md` claims "every user-facing surface has a '...' menu
offering Block and Report." **True for iOS, and verified by
enumeration** rather than spot-check: exactly three surfaces render
another individual's identity — `LeaderboardView`, `FriendsView`,
`DuelsView` — and all three call the shared `SocialSafetyMenu`.
`TeamsView` (aggregate names) and `SeasonView` (own rank only) don't
qualify.

**The web app had the identical gap and no menu anywhere**:
`league.tsx`, `profile_.friends.tsx`, `duels.tsx` all render display
names with zero Block/Report UI. Apple does not review the web app, so
this does not contradict the notes — but it is a real moderation gap,
and "we have moderation tools" is the kind of claim that gets audited
against the whole product, not just the reviewed half.

**Fixed same-day (#167) for `league.tsx`/`profile_.friends.tsx`.
`duels.tsx` deliberately excluded, not missed** — re-verified
2026-09-27 while triaging this backlog: the shared `SocialSafetyMenu`
component's own doc comment already records the investigation. Duel
cards render no name at all ("Challenge from a friend", "You"/"Them",
win/loss by course) — `getMyDuels`' response has no display-name field —
so there is no identity surface there to attach a menu to today. Not a
gap; confirmed by reading the actual rendered UI and the API response
shape, not assumed from the section title above.

---

## 0.0n A privacy label named the wrong processor for Hector (2026-09-26)

`privacy-nutrition-labels.md` §3 said Hector chat is "Sent to
**NVIDIA**". It is not — `HectorView.swift:301-308` sends it to Cloud
Voice's own endpoint (`voice.obsidianmedia.online`). Hector's *audio*
does reach Deepgram via this repo's `/api/stt`, so item 2 was fine.

**Corrected in both** `privacy-nutrition-labels.md` and
`app-review-notes.md`. Worth noting *how* it happened: the document's
own processor table was right all along (it lists Cloud Voice receiving
"Hector audio and chat") and the prose contradicted it four sections
earlier. **A document can disagree with itself and still read fluently**
— same shape as §0.0f. Naming a processor that never receives the data
is a false declaration to Apple, not a wording nit.

---

## 0.0o OWNER DEVICE TEST — four real bugs the audits all missed (2026-09-26)

Found by the account owner simply using the app. **Every one of these
survived a CI guard sweep, an App Review claims audit and a security
review on the same night** — because all three read code, and none of
them opened the app. Weight this accordingly: hands-on testing is not a
lower tier of evidence than an audit, it is a different axis, and it
caught more shippable defects in ten minutes than the audits did in
hours.

**Working, confirmed on device: Sign in with Apple.** Build 23's
provisioning-profile fix is verified by use, not just by CI.

### 1. Practice tab is broken — P0

"SOMETHING WENT WRONG, TRY AGAIN." on entering the tab. **This is the
single most likely cause of rejection we have**: `app-review-notes.md`
explicitly routes the reviewer to *Practice tab -> choose a scenario ->
hold the microphone*. A reviewer following our own notes hits a red
error.

**Already ruled out — do not re-check:** the Vercel production
environment is complete. `NVIDIA_API_KEY`, `DEEPGRAM_API_KEY`,
`SUPABASE_*`, `LESSON_SESSION_SECRET` are all present.
`NVIDIA_CHAT_MODEL` is absent but has a default
(`nvidia-chat-model.server.ts:20`), so that is not it either. The cheap
explanation is gone; this needs real diagnosis from production logs.

### 2. Teams can be joined but never created — P1

League/Season/Teams offer "join a team" and matchmaking, with **no
surface anywhere that creates one**. A feature that can only be entered
and never originated is an empty room. Apple's 2.1 (App Completeness)
covers exactly this shape.

### 3. First-time signup never showed the placement exam — P1

Confirmed on a genuinely new signup of the demo account. Placement
content exists (`placement_question_types`,
`v5_*_question_type` migrations) and never appeared. **A reviewer may
create their own account** and would land in the same state — which also
means the "account already has progress" premise of the review notes
silently depends on seeding, not on onboarding working.

### 4. iOS lost the CEFR level grouping — P1

The Learn tab no longer shows A1 / A2 / B1 / B2 / C1 bands; it is one
endless scroll, and resuming your last lesson means scrolling to the
bottom. It regressed — it used to group. **This also blocks decent
screenshots**, since the Learn tab is the primary shot.

---

## 0.0p Leaderboards show the user's real Google name — privacy, P1 (2026-09-26)

Owner's suggestion, and it is more than cosmetic: there is no profile
identity of the user's own, so social surfaces render whatever Google
supplied — typically a real full name — to strangers on a public
leaderboard.

**Users should be able to set a display name and avatar.** Framing this
as a feature request undersells it: we declare Contact Info and User ID
as **Linked** in the privacy labels, and a public leaderboard publishing
real names to other users is a disclosure the policy does not describe
and the user never chose. The fix is also the ordinary product answer —
people expect to pick their own handle.

Related: `profiles` already carries `display_name`
(`account.functions.test.ts` asserts it) but has **no email column**
(§0.0 export fix) — so the storage half may largely exist and only the
editing surface be missing. Check before scoping.

---

## 0.0q A STALE BASE URL, NOT A STALE TOKEN — the Practice tab 401s (#170, 2026-09-26)

**Root cause of `SOMETHING WENT WRONG, TRY AGAIN`, and of every 401 in
production logs on `/api/stt` and `/api/apple-link`.**

`AppConfig.apiBaseURL` still pointed at `english-buddy-app-33.vercel.app`.
That host now answers every `/api/*` POST with a **308 Permanent
Redirect** to `learn.alphonsoecosystem.app` — a **cross-origin**
redirect. URLSession drops `Authorization` when a redirect changes
origin, so the app sent a valid bearer token, the redirect stripped it,
and the server correctly answered 401 to a request that had become
anonymous.

**How it was nearly missed.** It was first flagged as cosmetic —
"both domains return 200, nothing is broken." That test was
`GET /`, which is the one request the app never makes. **A `POST` to
`/api/stt` returns 308 on one host and 401 on the other.** The owner
asked for the loose end to be closed anyway; that is the only reason it
was found.

**It also resolves the data point staleness could not explain**: a
freshly-minted Apple token 401ing on `/api/apple-link`. The token was
never stale — it never arrived. Session B flagged that mismatch instead
of forcing the fit, which is what kept the search open.

**Session token refresh (#168, merged) remains correct and necessary**
on its own terms — a session open past an hour still 401s with no retry.
It is simply not what happened here. **Two true things, one of which is
not the cause**, is a shape worth recognising: the plausible fix would
have shipped and the bug would have survived it.

---

## 0.0r Signup email was verifiably broken in two ways nobody could see (2026-09-26)

Found within ten minutes of getting an agent mailbox
(`obsidianteamhq@agentmail.to`), by signing up a real new address and
**reading the mail**. Three code audits, a CI guard sweep and a security
review ran the same night and none could see either defect, because
neither exists in the code — both live in the delivered message.

1. **Every signup email linked to `localhost`.** `site_url` was still
   the GoTrue default `http://localhost:3000`, so the "Prefer a link?"
   fallback built from `{{ .ConfirmationURL }}` carried
   `redirect_to=http://localhost:3000` — dead for every real user, and
   for a reviewer, who is exactly the person likely to try the
   alternative when the code path looks wrong.
2. **The code was EIGHT digits** while `AuthView.swift` and
   `HectorView.swift` both label the field `"6-digit code"`. Not
   blocked — the field is a `numberPad` with no validation — so every
   user was simply told the wrong thing.

**Both fixed and re-verified by receiving a second email**: subject
carries a 6-digit code, no longer runs of digits anywhere, and
`redirect_to=https://learn.alphonsoecosystem.app`. The script now reads
the config back and asserts both rather than trusting the PATCH's 200.

**§0.0 is now genuinely closed** — a brand-new address receives a
working 6-digit code. It had been "applied and presumed working" for a
day.

**The durable lesson: an inbox turns a whole category of "trust the
code" into "watch it happen."** Prefer receiving the mail over reasoning
that the code should send it.

---

## ~~0.0s #160 (Hector Phase 2) needs a rebase its author should do~~ **MOOT 2026-09-27**

**PR #160 was closed, never merged** (`gh pr view 160`: `state: CLOSED`,
`mergedAt: null`, closed 2026-09-26). Its whole premise — linking
existing accounts to the separate Cloud Voice bridge — went away with
that bridge in #189's decoupling (§0.1-e). Nothing to rebase; the
branch (`worktree-hector-phase2-link-existing-accounts`) is dead.
Kept below for history.

Phases 0 and 1 are merged, so #160's own Phase 0 commits replay against
a `main` that already has them (squash-merged, so not ancestors — §0.1b).
Rebasing conflicts across six files: `HectorView.swift`,
`AccountClientTests.swift`, `account.functions.ts`, `routeTree.gen.ts`,
`hector-link.ts` and its test.

Most resolutions are "take main" — it holds the newer, security-fixed
Phase 0 (#163) — but not all, and the exceptions are exactly where
Phase 2's own additions live. **A six-file semantic resolution on
someone else's feature branch is how content disappears while the build
stays green** (§0.1c, and the regex that ate 125 questions). Handed back
to its author rather than rushed.

**Not submission-critical.** Phase 2 migrates *existing* Hector users;
linking is currently fail-closed and inert anyway. Safe to land after
the 30th.

---

## 0.0t A PULL REQUEST CAN HAVE NO CI AT ALL, AND IT LOOKS FINE (2026-09-26)

**#172 produced ZERO GitHub Actions runs.** Not queued, not failed --
absent. Vercel and CodeRabbit ran on it normally, so the PR page looked
like a PR with checks. Three trigger types produced nothing: open,
close/reopen, and a synchronize from an empty commit.

**Cause:** the branch had fallen behind a `main` that had since changed
`.github/workflows/ci.yml`, so *relative to the base* the PR appeared to
MODIFY a workflow file. GitHub withholds Actions for that shape.
Rebasing so `.github/` no longer differed made CI fire within seconds.

**Two compile errors rode in behind it** -- an `await` inside
XCTUnwrap's autoclosure, and an XCTAssertEqual needing Equatable --
neither of which any human would catch by reading, and both of which CI
catches instantly.

**It recurs whenever main changes a workflow and a branch lags.** It hit
the placement branch twice in one session, the second time because #171
had just modified a workflow.

**Why this is worse than a red build.** Absence reads as "unchecked",
not "unverified", and `main` has no branch protection (sec 0.0j), so
nothing stops a merge. **Before merging, confirm CI actually RAN** --
`gh run list --branch <x>` returning nothing is a finding, not a pass.

---

## 0.0u Staleness reverts silently, and it happened three times in one night

Three separate PRs, each opened against a `main` that then moved:

- **#171** would have deleted `support.tsx` and its tests (merged in #174 after that branch point).
- **#175** would have deleted the auth-config guard step from `ci.yml` (#173).
- **#160** could not be rebased at all -- it replayed Phase 0 commits already squash-merged, conflicting across **six files Phase 2 never touches**.

**Each looked like a normal green PR.** The deletions appear in a
`git diff origin/main <branch>` and in nothing else -- not in the PR's
own commits, not in CI, not in a reviewer's reading of the change.

**Two rules that came out of it:**

1. **Diff with TWO dots against fetched `origin/main` before merging.**
   `git diff main...branch` (three dots) compares against the
   merge-base, which is exactly the stale main -- it reports clean while
   the branch is reverting live work. A session reported #171 "rebased
   cleanly, verified" using the three-dot form; it was 3 commits behind
   and would have reverted two fixes.
2. **When a branch replays squash-merged ancestors, cherry-pick its own
   commit instead of rebasing.** #160's six conflicts were entirely
   Phase 0 replay; `git cherry-pick e626f54` applied clean in three
   files. **The conflict count was measuring history, not content.**

**And the trap inside the trap:** Phase 2's sheet still called the
PRE-#163 client signature, so a clean cherry-pick would have
reintroduced the exact authorization defect #163 closed (and failed to
compile). **A clean apply is not a safe apply** -- check what the code
CALLS, not just whether it merged.

---
## 0.0v Crash visibility: use Xcode Organizer first, an SDK later (decided 2026-09-26)

**We currently have no crash reporting at all.** If the app crashes on
a user's device we never learn of it. That is the same blind spot that
made this week's bugs expensive -- the costly ones were all things
nobody could observe.

**Decision: do NOT add a crash SDK before submission.** Apple already
collects crashes, hangs, launch times and energy metrics through
**Xcode Organizer / MetricKit**, under the user's own "Share iPhone
Analytics" consent. That gives real crash visibility with **no
third-party SDK, no App Privacy declaration** (Apple collects it, we do
not), no privacy-policy change and no new build risk. It is already on
for a shipped app; someone just has to look.

**Later, deliberately:** a Sentry/Crashlytics-style SDK adds
symbolication, breadcrumbs and non-fatal reporting, which are worth
having once there are users. It is not a bolt-on -- it means declaring
**Diagnostics** in App Privacy and updating three documents in lockstep:
`privacy.tsx` (which currently states we run no crash-reporting SDK),
`privacy-nutrition-labels.md`, and `app-review-notes.md`. Do it as one
change or the documents start disagreeing, which is exactly how sec 0.0f
and sec 0.0n happened.

---

## 0.0w Advertising Data: declined, not deferred (decided 2026-09-26)

Proposed adding advertising/tracking data collection so it could be
declared. **Declined, and worth writing down so it is not revisited by
accident.**

Ticking Advertising Data means ticking **used for tracking**, which
forces an **ATT prompt**, adds a **"Data Used to Track You"** block to
the product page, and pulls in consent handling under GDPR -- heavier
still at a 13+ rating aimed partly at students. It would also
contradict the privacy policy's own "no advertising, analytics or
crash-reporting SDKs", which is currently a real differentiator for a
language app.

**With no ad product, it buys nothing and costs conversion,
compliance and credibility.** If advertising ever becomes part of the
business model, that is a product decision with its own privacy work --
not a checkbox.

---

## 0.0x NEVER declare App Privacy ahead of the build (2026-09-26)

App Privacy answers describe what the **current binary** does. Ticking
a data type before the feature exists means the submitted build does not
match its own declaration, and if the work slips it is simply false.

**There is no reason to pre-declare:** App Privacy is metadata and can
be edited at any time **without shipping a new app version**. So declare
exactly what is true today, add the feature when it is ready, then
update the answers. Nothing is lost by waiting and a false declaration
is avoided.

---

## 0.0y The privacy policy contradicted the App Store age rating (#177, 2026-09-26)

`privacy.tsx` said "not intended for children under 13" while the App
Store rating was **4+**. Both cannot be true, and a reviewer comparing
the product page to the policy sees it at a glance.

**Resolved by raising the RATING, not lowering the policy.** Accepting
under-13 users would trigger COPPA -- verifiable parental consent before
collecting anything -- and we collect email, a real name, **audio
recordings** and free-text conversation, with public leaderboards
attached. That is a compliance programme, not a wording change.

**The 4+ almost certainly came from under-answering the questionnaire.**
Honest answers -- user-generated content yes, chat yes, competition
between users yes, moderation yes (Block/Report on every surface showing
another person) -- should produce 13+, matching the policy.

**Reading the policy properly found more than the age mismatch**, all
fixed in #177: it called us "an English learning app" (three languages);
it claimed display names are editable "any time from your profile" (true
on web, **false on iOS**); and it never mentioned purchases, push
tokens, podcast playback, Cloud Voice, or that **Google hands us the
user's real name** -- every one of which we declare to Apple as
collected. A policy that under-discloses relative to your own App
Privacy answers is precisely the mismatch review checks for.

**UPDATE 2026-09-28 (submission-readiness audit):** the raise-to-13+
decision above was never actually applied to the live App Store Connect
record -- confirmed live via the API that it's still sitting at
userGeneratedContent: false, messagingAndChat: false, contests: NONE
(appStoreAgeRating: FOUR_PLUS). `scripts/update-age-rating.ts` +
`.github/workflows/update-age-rating.yml` now exist to apply exactly
this section's reasoning (check/apply jobs, same pattern as
check-app-store-status.yml). Running `apply` was blocked by this
session's own permission classifier (a live ASC metadata mutation) --
needs the account owner to run it directly or grant permission. Also
newly confirmed live and still open: koreaAgeRating, australiaAgeRating,
franceAgeRating are all null on the same record.

**UPDATE 2026-09-28, continued:** ran apply (explicit account owner
go-ahead) -- PATCH succeeded (200), userGeneratedContent/
messagingAndChat/contests all confirmed changed live. appStoreAgeRating
stayed FOUR_PLUS. Researched why instead of guessing: Apple's current
tier table puts userGeneratedContent and messagingAndChat BOTH at 4+ on
their own -- neither crosses a threshold alone. socialMedia is the
field that starts at 13+, and it matches the live privacy policy's own
leaderboard/friend-list language. Added socialMedia: true, re-ran apply
(200, confirmed live) -- appStoreAgeRating still shows FOUR_PLUS. A
2026-09 blog post surveying this exact documentation gap concludes the
computed tier likely only recomputes at actual submission time, not on
every API write ("bind when you submit"). Conclusion: the declaration
itself is now honestly correct (confirmed live); the displayed tier
updating is expected to follow at actual submission, not something to
keep forcing via more field guesses. Territory nulls are very likely
the same pre-submission computation gap, not a separate missing input.

---
## 0.0z A STACKED PR's GREEN CHECKS CAN BE ON THE WRONG COMMIT (2026-09-26)

Sharpens sec 0.0t. #181 was stacked on #179's branch. When #179 merged,
its branch was deleted, and #181's checks silently **detached** -- the
PR showed only CodeRabbit and Vercel, no CI at all. Retargeting it at
`main` did not reattach them.

**The trap is that CI had genuinely run and genuinely passed** -- twice.
On `b36d8260` and `c3d6d5df`. The branch head was `1b38c7cd`. **Two
green runs, neither against the code that would merge.** Every summary
view says "passing".

**The check that catches it:**

```
gh run list --branch <b> --json headSha,conclusion
git rev-parse origin/<b>
```

**If the run's `headSha` is not the branch head, the code is
unverified**, no matter how green anything looks. Forcing an empty
commit produced a real run on the real head, which passed -- so nothing
was wrong with the code. The evidence was wrong.

**Also: a stacked PR should be retargeted at `main` BEFORE its base
merges**, not after. Retargeting afterwards leaves the check association
broken in a way the UI does not explain.

---

## 0.1-a Accessibility went from nothing to four features (#179-#182, 2026-09-26)

Answered **No** to every feature on App Store Connect's Accessibility
page, honestly: fixed font sizes across **219** call sites, VoiceOver
labelling in **6 of 49** files, zero reduced-motion handling, and a dark
theme that `RootView.swift`'s `.preferredColorScheme` overrode so the
system setting did nothing.

All four now implemented. The findings worth keeping:

- **Dynamic Type** scaled at one chokepoint (`AlphonsoFont`), so 219
  call sites inherited it. The font was never the hard part -- fixed
  circles and pill rows clipping at large sizes were.
- **VoiceOver's real gap was not missing labels.** Correct/incorrect
  state after Check was **never exposed at all**, so a blind learner
  could not tell whether they got the answer right. Labels are
  cosmetic next to that.
- **Dark mode** surfaced a pre-existing contrast failure in Studio Ink's
  destructive red, found only because deriving new palettes forced
  someone to compute the ratios.

**Still answered No on the App Store, deliberately.** Apple's bar is
"users must be able to complete common tasks using that feature", and
nothing here has been verified BY USE -- no simulator in the build
environment. The acceptance test is behavioural: finish a lesson with
VoiceOver on, at the largest text size, in Dark Mode. **Re-answer only
after someone does that on a real screen.** Flagged and not fixed:
`ConversationView`/`CampaignView` share `SpeakQuestionCard`'s mic
gesture pattern.

---
## 0.1-b Two submission defects only a human eye caught (2026-09-26)

Both found by the account owner opening the app on a real device, after
a full day of audits, a CI guard sweep, a security review and an
orchestrator that trusted its own checks. Neither was visible to any of
them, because neither lives in a place code inspection or CI looks.

**1. Three "verified distinct" screenshots were the same screen.** The
orchestrator confirmed 03-review, 04-hector and 05-listen were distinct
"by checksum" and shipped them. They differed only by the clock --
2:43 vs 2:44 -- so the md5s differed while the screens were identical.
**A verification that cannot fail: on an image with a live clock, two
files ALWAYS hash differently regardless of content.** Root cause:
`dismissSheet()` fell back to one `swipeDown()`, which scrolls sheet
content instead of dismissing, and nothing checked. The sheet stayed
up and every later tab tap re-photographed it. Fixed: `tapTab` now
confirms the tab became SELECTED and `dismissSheet` confirms the tab
bar is reachable again. New check: crop the status bar off before
hashing, AND open the images.

**2. The paywall showed users a raw RevenueCat SDK error** (#183) --
"code 23", "rev.cat/sdk-troubleshooting". Debug instrumentation from
2026-09-23 whose own comment said to revert it once the failure was
diagnosed. It was diagnosed today; the instrumentation had outlived its
purpose and was waiting for a reviewer to find it.

**The generalisable lesson: for anything a user SEES -- screenshots,
error copy, empty states -- code review and CI are structurally blind.
Someone has to look.** The most expensive-to-catch defects this whole
week were the ones nobody could observe, only reason about; a device
and an inbox caught more than every audit combined.

---
## 0.1-c Red-team pass: 4 findings, 2 critical, all fixed and verified (#184-#187, 2026-09-26)

A session running Strix's methodology (active exploitation, every finding
validated by a live PoC against production with throwaway accounts, no
theoretical findings) found four real issues in a few minutes. All fixed,
merged, deployed, and confirmed live by reading pg_proc/pg_policies
directly:

- **#184 CRITICAL -- friendships forgery.** `fr_insert_own`'s WITH CHECK
  only verified `user_id = auth.uid()`, never `friend_id` or `status`, so
  any authenticated user could `POST /rest/v1/friendships` and declare
  ANY account an "accepted" friend with zero consent -- then use that
  forged row to satisfy `create_duel`'s mutual-friends check and challenge
  a stranger. It also defeated Block/Report (#167): block only DELETEs the
  row; the attacker re-forges it. Fixed: dropped the policy, revoked
  INSERT; `accept_friend_invite` (SECURITY DEFINER) is the only writer.
- **#185 CRITICAL -- `_join_team_impl` unauthenticated.** Never revoked
  from anon/authenticated, never checked `auth.uid()`, trusted the
  caller-supplied `_me`. Reachable with NO auth header -- anyone could
  force any user into/out of any team. Masked only by an ambiguous-column
  bug (see below). Fixed: `auth.uid()` guard, columns qualified, execute
  revoked.
- **#186 MEDIUM -- `weekly_xp` anon read.** Unauthenticated
  `POST /rest/v1/rpc/weekly_xp` returned any uuid's weekly XP -- account
  enumeration + activity disclosure. Fixed: execute revoked.
- **#187 MEDIUM -- `gen_random_bytes` unqualified.** pgcrypto lives in the
  `extensions` schema, not `public`, so `create_team`/`auto_join_team`
  404'd on every call. Fixed: `extensions.gen_random_bytes`.

**The meta-finding, and it is about the orchestrator, not the red-team.**
#185 and #187 together mean the team-creation feature merged in #178
**never worked in production** -- every `create_team` call 404'd on
`gen_random_bytes`, and would then have hit the ambiguous-column bug. The
orchestrator "verified" #178 by confirming `create_team` EXISTS and that
the `join_code` grant was correct, and reported it shipped -- but never
CALLED it. Same "verified exists, not verified works" gap as the
TestFlight upload step (checked the wrong log line) and the subscription
product id (confirmed present, not exercised). **Existence is not
function. A DB object that applied cleanly can still fail on its first
real call.** The cheap guard: call the thing once, even destructively in a
throwaway, before reporting a feature done.

None of the four touched `types.ts`, so they deployed with no
types-guard deadlock.

---
## 0.1-e Hector decoupled — the deletion P0 is CLOSED (#189, 2026-09-27)

The Hector-deletion P0 every audit flagged (deleting an Alphonso account
could not remove the separate Cloud Voice account) is resolved, not
patched. Hector now runs in our own backend on the main account
(/api/hector-respond) and persists nothing, so account deletion covers it
by construction. The whole bridge is gone: hector_links (dropped +
production-verified), hector-link/shadow/revocation routes,
cloud-voice-auth, and the separate Hector sign-in/enroll UI. types.ts
regenerated after the drop. Privacy policy updated (no more "separate
system" caveat). Learn with Alphonso no longer depends on Alphonso
Companion at runtime.

**Still owed:** on-device verification of the voice round-trip against
the new endpoint (build 27), and keep the Cloud Voice backend alive until
pre-decouple builds (<=26) age out. Voice now uses a Deepgram voice, not
the old piper "mana" -- it will sound different. Language is hardcoded
"en" (deferred minor: es/fr replies would be voiced in English).

---

## 0.1-d TWO security findings from the red-team pass (2026-09-27) -- BOTH NOW CLOSED (#6 closed in §0.1-f the same day, re-verified in code 2026-10-05; #7 resolved)

The 2026-09-26 red-team pass fixed 4 (#184-#187, see 0.1-c) and left two
flagged and UNFIXED. Recording so they are not lost:

**#6 -- `complete-lesson` trusts self-reported results. MEDIUM. ~~OPEN~~ CLOSED 2026-09-27 (§0.1-f).**
Re-verified in code 2026-10-05: `supabase/functions/complete-lesson/index.ts` and web `completeLessonRemote` both take `answers` and re-grade through the shared grader. **RESIDUAL, new 2026-10-05, low-medium, NOT built:** the answer key ships in the client, and the session token (`iat`, 3h max age) has no MINIMUM age and nothing limits completions per unit time, so a script submitting CORRECT answers can finish every lesson in parallel at once. Replay-farming is already bounded (XP delta over best score). Real mitigations are product calls (min seconds per question, per-day XP cap, lesson unlock order) -- owner decision needed before building. Original text follows.
The `complete-lesson` Edge Function accepts client-reported
`missedQuestionIds` with **no server-side answer check**, unlike
`grade-review`. Any user can forge a perfect completion and mint
XP/streak/league/achievements they never earned. Traced with an exact
repro by the red-team.

- **Not a submission blocker.** It is a cheating / economy-integrity
  vector, not a crash, a data-exposure, or an App Review policy issue.
  A reviewer never hits it. It does not gate the 30th.
- **The fix is a real feature change**, not a config toggle: the function
  must re-grade the submitted answers server-side against the lesson's
  own answer key, the way `grade-review` and `grade-translation` already
  do, and derive XP from that -- never from what the client claims.
  Mirrors the same trust boundary the gamification-write lockdown
  (`20260920050000_revoke_direct_gamification_writes.sql`) established for
  direct table writes; this is the RPC-shaped hole in the same wall.
- **Proposal: dedicated post-launch PR.** The red-team session has the
  repro and the cleanest context to write it. Ship the App Store build
  first; fix this before any real leaderboard/league competition matters,
  because forged XP corrupts leaderboards for everyone once there are
  real users.

**#7 -- leaked-password protection (HaveIBeenPwned). LOW. RESOLVED 2026-09-27.** **CORRECTION (2026-10-09): NOT enabled. The setting needs a higher Supabase plan than this project's; the owner confirmed it on 2026-10-08 and accepted it as a known limitation (remediation OWNER-TODO #4).**
Enabled by the account owner in the Supabase dashboard. Kept below for
the record of why it mattered (web auth uses real passwords).
A Supabase dashboard toggle, off. **It IS relevant** -- the web app uses
real passwords (`auth.tsx` `signInWithPassword` + a reset-password flow),
not only OTP/OAuth, so accounts can be created with a breached password.

- **Fix: two clicks, owner-only.** Supabase Dashboard -> Authentication
  -> Policies (Password security) -> enable "Check against HaveIBeenPwned".
  Zero downside, no code, no downtime. Only the account owner can do it.
- Enable it before real signups accumulate.

---

## 0.1-f Autonomous backlog sweep — complete-lesson re-grading closed, four smaller items closed, one spike blocked (2026-09-27)

Session asked to work this backlog autonomously, one long-lived branch
(`backlog/2026-09-27-autonomous-sweep`), own worktree. Scope was agreed
up front and excluded everything owner-gated (Apple portal, App Store
submission, Supabase dashboard toggles, device QA) — see the session's
own summary for the full punch list. Full web suite green throughout
(153 files / 1,369 tests, 1 pre-existing skip; `tsc --noEmit` clean) and
the touched Deno files independently `deno test`/`deno check` clean.

**§0.1-d #6 CLOSED — `complete-lesson` re-grades every answer itself.**
Was the largest item: `complete-lesson` (both the web `completeLessonRemote`
and the iOS-facing Edge Function) accepted a client-claimed
`missedQuestionIds` list and only checked that the ids named real
questions in the lesson — never that any answer was ever actually
graded. A forged client could report a perfect score regardless of what
it submitted. Turned out to require a real interface change across three
runtimes, not a one-file fix, because the client had never been sending
its actual answers, only which ones it claimed to have gotten wrong:

- **Request contract**: `missedQuestionIds: string[]` → `answers: {
  questionId, answer }[]` — one raw submission per real question,
  covering every question in the lesson (`validateLessonAnswerCoverage`,
  `src/lib/progress-math.ts` + the Deno mirror, rejects missing/duplicate/
  foreign question ids the same way `deriveLessonCompletion`'s old
  membership check did — that function is untouched, still used
  elsewhere for local optimistic UI).
- **Grading**: new `src/lib/grade-lesson-answer.server.ts` (web) mirrors
  `api/grade-translation.ts`'s local-first, AI-fallback translate grading
  for the one question type that needs it; every other type reuses
  `deriveAnswerCorrectness` (`src/lib/srs.ts`) unchanged. On the Edge
  Function side, `grade-review`'s own `answer-correctness.ts` (+ its five
  dependencies: `spoken-answer{,-fr,-es}.ts`, `translation-answer.ts`,
  `translation-grader.ts`) **moved to `supabase/functions/_shared/`** so
  `complete-lesson` reuses the identical grading `grade-review` already
  had, instead of a second hand-kept Deno copy — `_shared/` already had
  one cross-function import precedent (`apns.ts`), this is the second.
  `complete-lesson`'s `findLesson` query widened from `questions(id)` to
  the full `QuestionRow` shape (`type, prompt, choices, bank,
  answer_index, answer_text`) to actually grade with.
- **Clients**: web's `lesson.$id.tsx` now records every question's raw
  submission (`answeredQs`), not just misses. iOS's Kit
  (`ProgressSyncClient.swift`) gained a `LessonAnswer` struct and
  `completeLesson`'s signature changed to match; `LessonPlayerView.swift`
  (app target) and the offline queue (`SyncQueue.swift`'s
  `PendingLessonCompletion`, `SyncEngine.swift`'s replay, and the
  SwiftData record in `SyncQueueStore.swift`, which stores the answer
  pairs as two parallel arrays rather than a nested Codable type — same
  caution `AppSyncStateRecord` in that file already documents) all
  updated to match.
- **CI**: `.github/workflows/ci.yml`'s `deno-tests` job paths updated for
  the five files moved to `_shared/`.

**Verification, split honestly by what could actually be checked here:**
`swift build`/`swift test --package-path ios/LearnWithAlphonsoKit` ran
clean locally — **410/410 Kit tests passing, including the updated
`ProgressSyncClientTests`/`SyncEngineTests`** (see the correction below;
`swift.exe` is not actually blocked in this environment). The Kit half
of the iOS change is real, verified RED→GREEN TDD, not just reviewed.
**`ios/LearnWithAlphonso/Sources/LessonPlayerView.swift` (the app
target) is NOT verified** — SwiftData/SwiftUI don't resolve outside
Xcode, `xcodebuild` needs macOS, and this is a Windows sandbox. Treat it
as unverified until `ios-app-build` is green, per
[[feedback-ios-app-build-is-the-only-signal]] — reviewed carefully
against the Kit's new API and existing patterns, which is risk
mitigation, not verification.

**New finding, not fixed here (separate scope):**
`complete-lesson`'s `courseSchema` is `z.enum(["en", "fr"])` — missing
`"es"`, unlike web's own `completeLessonSchema`. An iOS Spanish-course
lesson completion would be rejected before reaching any of the logic
above. See `ARCHITECTURE.md`'s Edge Functions section for the flag;
one-line fix plus a regression test, left for its own small PR.

**Correction to a stale memory, verified empirically this session:**
`swift build`/`swift test` both ran cleanly end to end (58 files
compiled, 410 tests passed) — the 2026-09-25 "swift.exe is
blocked/unavailable" finding (§0.7c above) no longer holds, at least in
this environment. **`LearnWithAlphonsoKit` changes can and should get a
real local TDD cycle again** — don't assume the Kit is CI-only without
checking first. The app-target-needs-macOS half of that finding is
unaffected and still true, for an unrelated, durable reason.

**Four smaller items closed:**

- **§0.1d (English-only copy) CLOSED.** `src/routes/index.tsx`'s hero,
  eyebrow and meta title/description all said "English" only; the app
  ships English/French/Spanish. Copy updated to name all three; the test
  that pinned the old sentence now asserts the page names all three
  languages instead of one exact string (same fix shape this entry's own
  text prescribed).
- **§0.8 podcast grants CLOSED.** New migration
  `20260930010000_revoke_podcast_excess_grants.sql` revokes the
  never-explicitly-granted-but-platform-default INSERT/UPDATE/DELETE on
  `podcast_episodes`/`podcast_folders` for `anon`/`authenticated`, and
  `anon`'s INSERT on `podcast_play_events` (`authenticated`'s was already
  revoked by `20260926223031`). Not a live vulnerability — RLS + SELECT-
  only policies already deny it — same "unnecessary surface" reasoning
  `20260920050000_revoke_direct_gamification_writes.sql` used.
- **§0.8f (non-MP3 upload) + hardSplit CLOSED.** `podcast-tool.ts add
  --file` now sniffs the first bytes (`isLikelyMp3`,
  `src/lib/podcast-authoring.ts`) and rejects a non-MP3 file by name
  instead of silently storing it under an `.mp3` extension as
  `audio/mpeg` (the exact episode-2 M4A incident). `hardSplit`
  (`src/lib/podcast-tts.ts`) now prefers the nearest earlier whitespace
  over a fixed character offset, so a forced split never lands mid-word;
  falls back to a hard cut only when no whitespace exists in range.
- **§0.0l types-guard spike BLOCKED, not run.** Planned to pin
  `major_version = 17` in `supabase/config.toml` and measure
  `--local`-generated types against the checked-in ones on a throwaway
  branch. Docker Desktop's daemon isn't running in this sandbox
  (`docker ps` fails to connect) and the Supabase CLI isn't installed, so
  `supabase start`/`db reset` can't run here. Genuinely blocked on
  infrastructure this environment doesn't have, not attempted-and-failed
  — needs a session with a running local Supabase stack.

**Verified already fixed by prior work, corrected here rather than
re-done** (found while triaging, before writing any code):

- **§0.8b (report-only duplicate-prompt test)** — already rewritten to
  assert a recorded per-course baseline (`CROSS_PACK_DUPLICATE_BASELINE`,
  all three at 0) instead of `console.log`ging findings vitest swallows.
  All three courses' real duplicates were found and fixed. This entry's
  own "still open" framing was stale.
- **§0.8 Phase 2a (podcast transcripts)** — `podcast-tool.ts`'s
  `add --transcript`/`transcript` commands and the
  `podcast_transcripts` table both exist and match the design this
  entry called for (plain text, SSML-stripped via
  `normalizeTranscript`). Attaching episode 1's actual transcript is
  still a live-data action needing the service-role key, so still an
  owner/CI action, not a code gap.

---

## 0.1-g Three small verified fixes + one new dead-code finding (#191, 2026-09-27)

Follow-up to the §0.1-f sweep, same session's continuation.

**§2.2's "GDPR export still reads frozen `user_progress.xp`" CLOSED, and
turned out bigger than scoped.** Checked the actual table schemas before
fixing rather than trusting the one-column framing: `cefr_level`,
`league_tier`, and all three `placement_*` columns are *also* duplicated
on `language_progress`, and nothing writes any of the five `user_progress`
copies anymore (confirmed by grepping every `.upsert()`/`.update()`
against `user_progress` in `sync.functions.ts`). `exportMyData` now
selects an explicit live-columns list for `user_progress` instead of
`select("*")`.

**New finding, deliberately not fixed:** `mergeGuestProgress`
(`sync.functions.ts`) is the *one* exception that still writes
`user_progress.xp` — and it has no `course` parameter at all, a leftover
from before the multi-course migration. Writing a guest's merged XP into
a column nothing reads anymore means that XP silently vanishes from
every real display (leaderboards and `fetchProgress` both read
`language_progress.xp`). **Not fixed here, and not urgent**: grepped for
callers and found none anywhere in the app — no route, no button, no
call site. It's dead code with a latent bug, not an active one. Fixing
it properly means deciding which course a guest's progress belongs to,
a real design question, not a one-line patch. Worth either wiring it up
properly (if guest mode is still a real product feature) or deleting it
outright (if it isn't) — currently in the worst state, neither.

**`complete-lesson` / `start-lesson-session` missing `"es"` CLOSED**
(flagged in §0.1-f's ARCHITECTURE.md note). Also found `start-lesson-session`
had the identical gap, which is the more serious half: it issues the
token `complete-lesson` verifies, so a Spanish-course iOS lesson could
never even start a completion attempt, not just fail to submit one.
`grade-review` already had `"es"` correctly; both gaps predate Spanish's
2026-09-21 launch and were simply never updated.

**`podcast_playback` DELETE grant CLOSED.** RLS (`podcast_playback_own`)
was already `FOR ALL`, scoped correctly — the `GRANT` line alongside it
just never listed `DELETE`, so a user had no way to clear their own
listening history despite the policy already permitting it. One-line
fix. No UI surfaces this yet (not built, not asked for) — the capability
now exists at the database level for whoever adds the button.

---
## 0.1 Admin subsystem merged, UNDEPLOYED (#140, 2026-09-25)

Phase 4 is on main and **has no shipping path** — no Vercel project.
Episode uploads go through `scripts/podcast-tool.ts` until it is
deployed. (`admin_users` now has its first row.)

**The Critical it fixed.** "Replace audio" signed an upload URL **at the
live object** with upsert, so the browser overwrote published audio
*before* the server sniffed it, and a sniff failure then deleted it. One
mislabelled file would have 404'd every learner on a published episode —
no versioning, no backup, row still `published=true` pointing at
nothing. Fixed with a staging key promoted only on success. **The
invariant: a file at the final path always means a finished, verified
object.**

**A test that ran nowhere.** The `admin_users` RLS test was documented as
running in CI and ran nowhere — `bun run test` executes in a job that
sets no Supabase env, so it skipped silently. Now in `deploy-supabase`
with `ADMIN_RLS_TEST_REQUIRED=1`. **Scope it honestly:** that job is
`push && ref == main`, so the guard fires **post-merge**, not on the PR.

**Deployment runbook:** second Vercel project, build `bun run build:admin`,
team `shayans-projects-d00acc44`; set `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; point
`admin.<domain>`; insert the first admin by hand (no bootstrap endpoint
by design).

---

## 0.1b "N commits ahead" on merged PRs is a squash artifact (2026-09-25)

`gh pr merge --squash` writes a **new** commit, so branch commits are
never ancestors of main and `git rev-list main..branch` counts them
forever. **Verified rather than assumed:** ten merged PRs' distinctive
markers all confirmed present on main. Files that differed did so because
*later* PRs moved main forward.

**61 stale remote branches deleted.** The cheap prevention is
`--delete-branch` on every merge.

---

## 0.1c A slice-replace deleted nine sections of this file (2026-09-26)

Recording this because the file is gitignored, so there was no diff to
review and no way to recover except rewriting from memory.

The §0.2 state-of-play rewrite used
`s[:i] + new + s[j:]` between `## 0.1d The product says it is English-only, and a test enforces that (2026-09-26)

Found by the session verifying App Store copy, and it is wider than the
one line they flagged.

| Location | Claim |
| --- | --- |
| `src/routes/privacy.tsx:32` | "Alphonso is an **English** learning app" |
| `src/routes/index.tsx:64` | "**Learn English** with lessons that actually stick." — the homepage hero |
| `src/routes/index.test.tsx:37` | a test pinning that exact hero string |

**The app ships 609 English, 575 French and 583 Spanish lessons.** French
and Spanish are **65% of the content by lesson count**, all three courses
have all five question types, and the homepage does not mention them.

**Third instance of the same shape this week:** stale copy with a test
protecting it. `legal-pages.test.tsx` pinned `support@lingua.app`;
`index.test.tsx` pins the English-only hero. A guard that asserts the
current string is not a guard against the string being *wrong* -- it is
a guard against it being *changed*, which is the opposite of what is
wanted when the string is already false.

**Why it matters beyond tidiness.** App Store copy has been verified to
say "English, French, or Spanish" (accurate). If the listing says three
languages and the site says one, that is an inconsistency a reviewer can
see, and it undersells two thirds of the work that has shipped.

**Fix:** update both strings and rewrite the test to assert the page
names all three courses, rather than pinning one sentence. Assigned.

---

## 0.2 State of play` and
`## 0.2b SHIPATON`. Every §0.0x and §0.1 entry had been inserted into
exactly that range, because each was anchored on `## 0.1 Admin
subsystem merged`. **The replace silently removed all nine.** It
reported success, as destructive edits do.

**Two habits this should change:**

1. **Insert before an anchor; never slice between two.** A slice assumes
   nothing valuable arrived in the gap since you last looked.
2. **New sections go ABOVE the state-of-play block**, which is the one
   part of this file that gets wholesale-rewritten.

Same shape as the regex that ate a pack-object boundary in
`lesson-bank-es.ts` earlier the same week: an edit that compiles, reports
success, and quietly destroys content.

---

## 0.2 State of play — 2026-09-26

**Main clean, zero open PRs, deploy green.** Test suite **146 files /
1,288 tests** (CI on main). All three new tables live and verified in
production: `blocked_users`, `content_reports`, `apple_auth_tokens`.
`admin_users` has its first row.

### The audit's P0 list, one day later

| Blocker | State |
| --- | --- |
| Sign in with Apple | **merged** (#146) — inert until Supabase + portal config |
| Native account deletion + export | **merged** (#147) |
| AI data disclosure | **merged** (#144) |
| Apple token revocation | **merged** (#149) — inert until the 4 secrets |
| Block and report | **merged** (#150) — enforced at 7 paths |
| Paywall price from StoreKit | **merged** (#148) |
| Legal contact addresses | **merged** (#145) |
| Privacy policy accuracy | **merged** (#151) |
| New-user signup | **fixed and applied**, verification still owed |
| Xcode 26+ / iOS 26 SDK | **already satisfied** — 26.6 / iOS 26.5 |

**Deferred with reasons, not forgotten:** the Hector re-architecture (a
genuinely separate Supabase project — real, not a four-day job) and
RevenueCat verification (circular: the reviewer is the first person who
can exercise the paywall).

### Owner-only, and the first is invisible if missed

1. **Apple Developer + Supabase config**, then `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID`. Supabase →
   Apple provider: **Client IDs = the bundle id, Secret Key EMPTY** (that
   field is web-OAuth only). **Nothing goes red without these** — Sign in
   with Apple and revocation both just quietly do nothing.
2. **Screenshots** — iPhone 15 Pro Max (1290x2796) and iPhone 15
   (1179x2556). Shot list in the Shipaton workspace.
3. **Age rating** questionnaire — must reflect AI and social.
4. **Verify signup** with a plus-addressed never-used address.
5. **Rotate the Supabase `service_role` key** (exposed twice).

### Prepared and waiting in the Shipaton workspace

- `03-submission-materials/privacy-nutrition-labels.md` — seven items,
  all Linked / App Functionality. **Tracking: No. Diagnostics: not
  collected** — there are no ad, analytics or crash SDKs anywhere.
- `03-submission-materials/app-review-notes.md` — paste-ready notes plus
  demo-account prep. **Do not give a reviewer an OTP account.**
- `03-submission-materials/screenshot-shot-list.md`
- `02-launch-checklist/2026-09-25-p0-plan-and-decisions.md`
- `06-risks-and-gaps/2026-09-25-external-app-store-audit.md`

### What the parallel run taught

Three sessions, eight PRs, **zero doc conflicts and zero file
conflicts** — against yesterday's 27-PR day where every collision was a
doc conflict, one of them silently wrong. The two rules did it: **no
session edits the shared docs** (the orchestrator does one pass, this
one), and **every session in its own worktree**.

The failures that remained were the ones **no single PR can see**:

- **A migration version collision** (#149 and #150 both chose
  `20260928020000`). Git sees no conflict, both PRs pass, and the guard
  only fires once both are on main — breaking the deploy. Caught by
  reading two PRs side by side. **With parallel sessions, claim
  migration versions in the kickoff.**
- **Two accurate statements that disagree** (§0.0f). #147's Hector copy
  was good when written; #151 made it a contradiction a day later.
- **Kit-green saying nothing about the app target** — third occurrence
  (#147), same as #115.

---

## 0.2b SHIPATON: five days left, and three deliverables share one blocker (2026-09-25)

**Devpost deadline 2026-09-30.** RevenueCat's own guidance was to be
publicly live by 2026-09-23 — already past. Full context lives in
`D:\AgentDevWork
epos\Hackaton\Shipaton\HANDOFF.md`, which is
authoritative over everything else in that folder.

**Three of the five remaining submission deliverables are blocked on the
same single cause — no Mac, no Simulator, anywhere:**

| Deliverable | State |
| --- | --- |
| App Store screenshots (auth, lesson browser, lesson player, review queue, Hector, paywall) | **not started** |
| Devpost screenshot, exactly 1179×2556, no device frame | not done |
| Demo video, ≤2 min (script drafted, never recorded) | **not recorded** |
| App description / subtitle / keywords sign-off | drafted, needs the account owner |
| Actual App Store submission | needs an explicit decision; gated by Apple's first-subscription rule |

### Limrun — evaluate now, and point it at the deliverables, not the dev loop

Already named in the Shipaton handoff as a Ship Kit sponsor perk with
**$100 free credits**, and already identified there as the answer to the
"no Mac/Simulator" line. Cloud Xcode plus iOS/Android simulators driven
by CLI/API/MCP: remote compile with build caching, simulator interaction
through the accessibility tree, **60fps recording and demo-video
generation**, browser preview links. Pricing splits idle vs build time.

**What it unblocks, in priority order:**

1. **The demo video.** Highest value of anything outstanding — a judge
   sees it before they see any code, and it currently cannot be produced
   at all. The script is already written.
2. **Screenshots**, at exact pixel sizes. Devpost's 1179×2556-no-frame
   spec is a simulator device size, not a crop job.
3. **Local Swift compile**, which this machine has not had since
   `swift.exe` was blocked (§0.7c) — would have caught #115's
   `TranslateQuestionCard` error in seconds instead of a CI cycle.
4. **Roughly half the device checks** (§0.8e) — including **#12**, the
   only defect the build-21 device pass actually found, which is a
   layout bug a per-tab screenshot catches.

**What it does NOT solve, and this is the half that matters.** The
device gate stays: `AVAudioSession` arbitration (#10), background audio
and lock-screen Now Playing (#6, #7), real call/headphone interruptions
(#9), real STT (#13). Those need hardware. It also does nothing for the
submission decision itself.

**With five days left the dev-loop speedup is a rounding error.** Claim
the credits and aim it at the video and screenshots first.

**Lance** — the other Ship Kit perk, AI-agent-driven App Store
submission, free 3 months — targets the one item limrun does not. Worth
evaluating alongside.

---

## 0.3 State of play — end of 2026-09-24

`main` at `1cfb1515`. 30 PRs merged this day (#83-#112), zero open.
Deploy pipeline verified green end to end.

### Content

| Course | Lessons | Questions | Types |
| --- | --- | --- | --- |
| English | **609** | 3,096 | mc, fill, listening, speak, translate (+1 reorder) |
| French | **550** | 2,750 | mc, fill, listening, translate |
| Spanish | 508 | 2,540 | mc, fill |

Spanish is now two question types and ~100 lessons behind French, which
is itself behind English. The "full parity" claim is retired.

### Verified numbers

- **129 test files / 1,094 tests**, per CI on a clean runner.
- Coverage ~94% statements (was 89.87% at the start of the day).

**Take test counts from CI, not from a local run.** This machine
accumulated **41 node/bun processes** over two days, and a starved run
reports fewer files rather than failing: it produced a 5,000ms timeout
and an 82-of-129 collection in the same hour, both of which look like
real failures and are not. All three sessions hit this independently;
two of them quoted a wrong number to the account owner before catching
it. Nothing background during a verification pass, and prefer CI when
in doubt.

### Five guards added, each for a class that previously shipped green

1. GDPR export table drift (`account.functions.test.ts`)
2. Duplicate migration versions (`ci.yml`, deno-tests)
3. Migration **ordering** (`src/lib/migration-order.test.ts`) -- the
   duplicate guard cannot see this one
4. Stale bundled iOS content (`ci.yml`, lint-and-typecheck)
5. Missing Edge Function `deno.json` import map (`ci.yml`)

### Four production defects found, all of which had shipped green

1. **GDPR export returning incomplete data** -- 9 user-scoped tables
   missing since the gamification batch. Portability only; deletion was
   never affected (all cascade from `auth.users`).
2. **The deploy pipeline silently broken** -- Edge Functions had not
   deployed since Phase 3 and the curriculum seed had *never* run. A
   failing job nobody was watching.
3. **Duplicate migration version** -- two sessions picked the same
   timestamp; broke `main`'s deploy on the second merge.
4. **Migration ordering** -- a security fix versioned before the table
   it hardens. Would have merged green and silently no-opped, leaving
   the INSERT grant open.

Plus: a placement exam that **inflated** learners' level (the no-TTS
fallback printed the answer), and `/api/stt` transcribing every language
as English for want of one parameter.

### The two patterns worth carrying

**Cross-session interactions are the dominant failure mode.** Five of
the last eight PRs needed a fix before merging, and every one was
invisible to the session that wrote it -- a duplicate version, an
ordering dependency, a hardcoded count in another language's test.
File-level overlap checks do not catch this class; the guards above do.

**"The test could not fail" is the most common defect class in this
codebase**, ahead of anything in the product code. Three sessions each
shipped one independently in a single day: a tautological id-set
comparison, an assertion that React reuses a DOM node, and a guard
asserting a property of the *pool* while the bug was in the *draw*. See
§0.10 and §0.11. Mutation-testing by hand is the only thing reliably
catching it -- and note that a mutation test can itself mislead if the
mutation perturbs the wrong axis.

---

## 0.4 V5 in flight — merge status (2026-09-24)

Three parallel worktree PRs all merged to `main` this day, in this order:

- **#84** English content quality (plausible distractors + audit of all
  534 English lessons) — merge commit `01747a50`.
- **#83** iOS Canopy theme (4th, iOS-only theme, new default) — merge
  commit `0d9cfa42`. **Real-device check DONE 2026-09-24** on TestFlight
  build 18: account owner's verdict was "not looking bad... acceptable
  for now". So it does not repeat the items 11/13/15 pattern of shipping
  something visibly wrong — but it is **explicitly not signed off**:
  a proper QA pass on Canopy is still owed (see §0.7 below).
- **#85** GDPR export fix + ESLint scope — merge commit `0a6786c4`.

Local `main` and `origin/main` are in sync at `0a6786c4`.

**Diagnostic worth keeping**: #83 and #85 both showed
`lint-and-typecheck` failing and both looked broken. Neither was — a
pre-existing `prettier/prettier` break on `main`
(`scripts/upload-review-screenshot.ts`, from `566b71c`) had been failing
that check on *every* PR, and #84 happened to carry the fix. When
several unrelated PRs fail the same check, suspect `main` first.

---

## 0.5 Direct tester/user feedback

Raised 2026-09-21, real feedback from actual use (not roadmap
speculation) — treat these with corresponding urgency.

### ~~iOS app has basically no UI/UX~~ **DONE 2026-09-22, PR #68, merged**
Raised 2026-09-22: user opened a real build on their phone and found it
looked like stock SwiftUI throughout — no branding, no design system,
nothing matching the web app's look. Confirmed on inspection (zero
design-system files, `Assets.xcassets` had only the app icon). Full
write-up at §1.5 item 11 below — ported the web's Meadow theme to a
real SwiftUI design system and applied it to every screen. Merged,
build 9 shipped to TestFlight — see the next entry for what that
real-device check actually found.

### ~~Build 9 mostly illegible in Dark Mode + sign-in screen layout bug~~ **DONE 2026-09-22, PR #69, merged**
Raised 2026-09-22, the moment the user actually looked at build 9 on
their phone (screenshots): League title, "Saying Hello" nav title, and
the "Set your country" empty state all rendered as near-invisible white
text on the app's light background; the sign-in screen had a huge empty
gap pushing "Continue with Google" almost off-screen; fill-in-blank/
input fields were nearly invisible against the page. User also asked
whether the extra web themes they'd designed (Studio Ink, Manuscript —
already in `styles.css`) could be connected to iOS too. Full write-up
at §1.5 item 12 below — root cause was the device being in system Dark
Mode with no `.preferredColorScheme` override, fixed by turning the
single fixed Meadow palette into a real theme system (all 3 web themes)
with `.preferredColorScheme` pinned to whichever theme is active; sign-in
screen's `Divider()` stretch bug fixed and given a real visual pass;
input-field contrast fixed app-wide. **This is the second time in a row
"CI green" and "looks right on a real device" diverged for this app's
UI** — worth remembering next time a screen-facing iOS change feels
done after CI passes alone.

### ~~Language picker truncated to one letter + app "doesn't feel alive"~~ **DONE 2026-09-22, PR #70, merged**
Raised 2026-09-22, on build 10: the course picker (top-left corner)
showed only a single letter per option ("E/F/E" — English and Español
indistinguishable) since full names left no room in a `.segmented`
picker sharing the toolbar with a trailing button. Also: "it's mature
but I don't think it's alive... it feels like an empty piece of
background with some written knowledge on it... no live element."
Full write-up at §1.5 item 13 below — flag-based `CoursePicker`, a new
streak/hearts/XP status header with a continuously pulsing flame,
gradient primary buttons, staggered row entrance.

### ~~No mascot visuals for Alphonso or Hector~~ **DONE 2026-09-22, PR #71 (not yet merged)**
Raised 2026-09-22: user pointed out the app has two named personas
(Alphonso, its own namesake; Hector, the Pro tutor) with zero visual
form anywhere, and asked specifically for Hector to visually appear
with wrong-answer help (a side-panel character explaining the correct
answer). Agreed instead to use Alphonso for this — Hector is Pro-gated
($9.99/mo), so giving him away free in the ordinary lesson flow would
undercut the subscription; Hector keeps his own visual presence
exclusively in his paid conversation screen. User then generated real
character portraits for both themselves (Higgsfield credits were
exhausted) and shared them directly. Full write-up at §1.5 item 14
below.

### ~~Question font size too small (web + iOS)~~ **DONE 2026-09-21**
Question prompts 22px→25px on web (`lesson.$id.tsx`/`review.tsx`),
`.title3`→`.title2` on iOS (`LessonPlayerView.swift`/
`ReviewQueueView.swift`). Answer choices/fill-input/reorder-token text
also bumped one step each — web's `AnswerOption` is shared by lesson,
review, AND placement, so all three got it from one change. CI-verified
(real Xcode build + full test suite). Didn't touch compact secondary
lists (e.g. the finish screen's missed-question recap) — flag
separately if those also need it.

### ~~Pronunciation button on every vocab card (web + iOS)~~ **DONE 2026-09-21**
Added to every vocab card, both platforms, all three courses (English/
French/Spanish) — taps `speak()` (web) / `AVSpeechSynthesizer` (iOS)
with the course's locale. Added a shared `localeForCourse` helper to
`courses.ts` (was duplicated as an inline ternary in two places
already). CI-verified.

### ~~Spanish course size/depth parity with English/French~~ **DONE 2026-09-21**
Grown overnight in four stages: 25→40→100→130 packs (110→177→358→508
lessons). Now at full parity: 130 packs (more than French's 100),
508 lessons (matches French's 500, close to English's ~510), same
topic/grammar coverage breadth across A1-C1 -- numbers, animals,
weather, clothing, professions, all major tenses/moods (including
relative-clause subjunctive, si-clauses types 2/3, passive "se",
por/para), business/politics/media/art/legal vocabulary, confusable
verb pairs, idioms, formal register, academic writing verbs. CI-verified
(real Xcode build + full test suite, all green).

### ~~Spanish course vocab images~~ **DONE (concrete-noun packs) 2026-09-21**
Two waves: 69 terms (colors, family, food, places) from the first
100-pack milestone, then 254 more from the 15 concrete-noun packs added
in the parity push (animals, clothing, school objects, professions,
nature/outdoors, fruits/vegetables, colors & shapes, city places,
technology, appliances, work vocabulary, sports, furniture, landscape,
art/culture). 323 Spanish terms total now have images.

**Key technique, worth remembering for any future course**: search
Pexels/Pixabay with the English *concept*, not the target-language
word. Searching the literal Spanish word against their English-indexed
search produced systematic wrong matches from word collisions —
"padre" → Padre Island, "malo" → Saint-Malo, "jefe" → a "Boss" perfume
bottle, "partido" (match) → matchsticks, "empate" (tie/draw) → a
necktie. Every batch was manually reviewed and bad matches (~6-16%
per batch) were dropped before merging, not shipped blind.

**Deliberately still not covered**: the grammar/conjugation/idiom/
connector packs (~85 of the 130 packs) — conjugated verbs and abstract
grammar terms don't photograph meaningfully regardless of query
language (`fetch-vocab-images.ts`'s own design note, per TASK-088).
Skip trying to fetch images for these entirely; it's not an oversight.

Raw candidate batches (including the rejected noisy first attempt that
searched literal Spanish words) are kept at
`scripts/vocab-images-batch-es*.json`/`vocab-terms-es*.json` for
reference. Native-speaker review pass on all Spanish content is still
a separate open item — same as French's own content.

---

## 0.7 Canopy needs a real QA pass — open — PARTLY DONE, REST OWNER-ONLY (2026-10-09: Limrun QA run 2 on release candidate dd52ff0 exercised the main flows and theme screens, see the remediation ledger; the Dynamic Type, dark mode and VoiceOver rows that need a real device remain [DEVICE])

**Priority: medium-high.** Raised 2026-09-24 by the account owner after
looking at TestFlight build 18: Canopy is "acceptable for NOW" but
"needs a proper QA pass". Merged and on a device is not the same as
reviewed.

What that pass should actually cover, given this app's own history:

- **Every screen, not a sample.** Canopy was rolled out across ~17
  already-styled screens in one pass. Items 11/13/15 each shipped a
  screen-level defect that CI could not see (illegible dark-mode text, a
  truncated picker, a clipped segmented control).
- **The screens nobody looks at.** Paywall, settings, sign-in,
  lesson-finish, league-promotion, empty states, error states. The
  sign-in `Divider()` bug and the `PaywallView` "SF Symbol and plain
  text" gap both lived in exactly this category.
- **Dynamic Type and long strings.** The two picker bugs (items 13, 15)
  were both "this fits on my screen" failures.
- **Theme switching**, not just Canopy at rest: Canopy ↔ the other three
  at runtime, and the `profiles.theme` round-trip with the web app.
- **A signed-out/fresh install**, since Canopy is the new default only
  when no preference is saved — that path is the one the nullable-column
  bug originally broke, and it is the path a new user actually takes.

Needs a human with the device; an agent cannot do this one.

---

## 0.6 Deferred, explicitly parked 2026-09-24 — pick up later

Both raised while merging #83/#84/#85 and deliberately not started, at
the user's direction. Neither is blocked by the other.

### 0.6.1 Regenerate the stale `src/integrations/supabase/types.ts` — DONE (verified 2026-10-09: the seven tables are all in types.ts, no untyped() helper remains anywhere under src/ (git grep finds none), regeneration is a workflow, and the freshness check is the types-fresh job)
**Priority: medium. Needs a human with Supabase project access — an
agent in this sandbox cannot do it.**

Seven tables added by the gamification (#64–67) and push (#59) batches
were never regenerated into the committed generated types:
`challenge_completions`, `device_tokens`, `duel_queue`,
`season_cohort_members`, `season_placements`, `team_members`, `teams`.

Consequence today: a typed `supabase.from()` against any of them does
not compile — `from()`'s parameter is a literal union built from that
file, so real, existing tables are rejected. PR #85 had to work around
it with a widened `from` helper in `account.functions.ts` (documented
there and in `ARCHITECTURE.md`). Expect the same workaround to be
needed by anything touching those tables until this is fixed.

Fix: regenerate against the live project with the Supabase CLI
(`supabase gen types typescript --project-id qhcjpfbxfcltjbiuknyt`, but
**verify the current CLI flag syntax rather than trusting that string**
— this repo has been bitten by assumed CLI syntax before). Commit the
result. Worth pairing with a CI freshness check in the same spirit as
the two guards added in PR #87, so it can't silently rot again — though
that check needs project credentials in CI, which is why it wasn't done
alongside them.

Until then: **treat the generated types as under-describing the schema**,
not as an authoritative list of what exists.

### 0.6.2 Extend the generative-content pipeline to French and Spanish — DONE in PRs #313/#317/#319 (2026-10-18; rechecked in 2026-10-19 history)

> The design/risk notes below describe the pre-implementation state and are retained for provenance. They are not evidence that the shipped pipeline remains open; verify any new content or quality issue against the current implementation before reopening this item.
**Priority: medium. A real initiative, not a batch item.**

> **Unblocked 2026-09-24.** The morphology question this was waiting on
> has been answered: the account owner adopted **`french-verbs` +
> `french-verbs-lefff`** (Apache-2.0, 809/810 across every mood the
> French bank uses, 100% coverage of its 117 infinitives, throws rather
> than guessing on an unknown verb). Evidence and the two rejected
> alternatives are in
> `docs/superpowers/specs/2026-09-24-french-content-audit-design.md`
> §8.5; the adoption's three conditions are in §8.3.
>
> Three things that do **not** follow automatically from that:
> - **Spanish still needs its own spike.** One library was verified
>   against French. Spanish conjugation is at least as involved, and
>   nobody has checked whether the same package serves it.
> - **The generative distractor design is still unspecced** — how many
>   variants, which persons, how they rank against the existing pool.
> - **This item is about generating *content***, not distractors. It
>   reuses the same morphology authority but is a separate build.

The generative sentence-template pipeline (PR #76) shipped as an
**English-only pilot** — hand-authored grammar templates plus an
LLM-proposed, `compromise`-validated vocab dataset, feeding the existing
`apply --confirm` path. See `ARCHITECTURE.md`'s "Generative content
pipeline" and §3's "True generative sentence-template content" entry for
the full write-up of what shipped and what the review caught.

Why this matters more than it looks: the pilot **does not yet reduce the
pain that motivated it**. That pain is the French/Spanish
native-speaker review burden (§3) — 500 and 508 lessons respectively,
still unreviewed for grammar/naturalness/idiom. Until the same
architecture extends to those two languages, the pilot is a proof of
mechanism rather than a saving.

The hard part is not the templates, it's the morphology authority.
English leans on `compromise`; French and Spanish need an equivalent
that can conjugate and agree correctly, and the pilot's own experience
says the validator must be the sole authority rather than the LLM. Pick
that library first and spike it against a known-correct conjugation
table before committing to the approach — the English pilot only
verified 7 verbs that way, and its review notes flag that a new
LLM-proposed verb is never re-checked against such a table.

Other known follow-on gaps carried from the pilot, all still open:
cross-verb MC-distractor pollution is reduced but not eliminated; the
POS cross-check false-rejects some genuinely ambiguous common words
(book/cook) with no manual-add path.

---

## 0.8 Podcast / audio library — phases and carried risks (2026-09-24)

Phase 1a (web "Listen" tab) merged as PR #98 (`d6bb7303`). Everything
below is from that session's own handoff, recorded here because
`BACKLOG.md` is gitignored and it could not edit the main checkout from
its worktree.

### Episode 1 PUBLISHED — 2026-09-24

Live at `podcast-audio/en/a1/ordering-coffee.mp3`, `published_at`
2026-09-25T03:08:37Z. Verified independently of the CLI's own output:
the row reads `duration_seconds = 172` (matching the file's real
2:52, so **the resume-position trap did not fire**), and the object
serves HTTP 200 `audio/mpeg` at 1,378,473 bytes — byte-identical to
the local master. `podcast_folders` went from empty to `en` → `en/a1`.

This is the first real content behind the Phase 1a web Listen tab.

Local master and sources:

```
D:\AgentDevWork\Podcast\Learn With Alphonso  ep01-ordering-coffee.mp3          1.31 MB, 2:52, mono 64 kbps 44.1 kHz
  ep01-ordering-coffee.script.txt   verbatim TTS input
  ep01-ordering-coffee.md           voice/model/settings + notes
```

English A1, slug `ordering-coffee`. ElevenLabs, voice **Matilda**
(`XrExE9yKIg1WjnnlVkGX`, american, informative-educational — chosen to
match the en-US course locale), model `eleven_multilingual_v2`.

Facts worth carrying forward:

- **Free tier is 10,000 characters/month.** This episode billed 2,593
  of 3,033 submitted (`<break>` tags are only partly billed).
  **7,407 left this month** — roughly two more episodes of this length.
  Bulk publishing is therefore gated on a paid tier, not on the code.
- **Break tags render shorter than nominal.** ~60s of declared pause
  produced ~45s of audio. Budget 1.3x when writing to a duration floor;
  this one landed at 2:52 against a 3:00–4:00 target.
- **Single-shot generation, so the chunk-join probe is still
  unrun.** The `duration_seconds` risk below is untouched, and remains
  the gate on bulk publishing.
- Publishing needs `podcast-tool.ts` run by the account owner — it
  takes the `service_role` key, which must not pass through an agent
  session.

### Phases — re-verified against the code 2026-09-25

The list below replaces an earlier one that was badly stale: it
described Phase 0 and Phase 1b as unbuilt when both had shipped.
Verified by reading `RootView.swift`, `Info.plist` and the iOS sources,
not by reading the previous version of this list.

- **Phase 0 — iOS tab consolidation. DONE.** `RootView.swift` declares
  exactly five: `Learn · Listen · Practice · Hector · Profile`, with
  Review folded into Learn (due-count badge) and the rest behind
  `ProfileHubView`. No longer gates anything.
- **Phase 1a — web Listen tab. DONE** (#98).
- **Phase 1b — iOS client. DONE.** `ListenView`, `PodcastAudioPlayer`,
  `PodcastMiniBar`, `PodcastClient`, `PodcastModels`, `PodcastPlayback`,
  `PodcastTree` all exist, and `UIBackgroundModes: [audio]` is in
  `Info.plist`. Unverified on a real device — that is build 20's job,
  not a missing feature.
- **Phase 2 — transcripts, comprehension questions, XP, SRS wiring. [2026-10-09 audit: 2a transcripts are DONE (web src/components/PodcastTranscript.tsx, iOS ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastTranscript.swift, Android core/podcast/PodcastTranscript.kt); 2b comprehension questions and 2c XP/SRS tuning remain NOT STARTED, no code found.]
  NOT STARTED. Parked as one lump, but it is three things with three
  different blockers, and only one of them is genuinely blocked.**

  - **2a — transcripts. UNBLOCKED TODAY.** Needs no play data and no
    device confidence; it is an accessibility obligation, and audio
    with no captions excludes deaf and hard-of-hearing learners from
    the day it ships. **And the transcript for episode 1 already
    exists, word-perfect**: the episode was generated from
    `ep01-ordering-coffee.script.txt`, so the spoken text *is* the
    input, with no STT, no Deepgram and no chunk-join probe involved.
    Note this does **not** follow from the `source` column — episode 1
    is `source='upload'` because the MP3 was generated outside the
    tool. The right shape is `podcast-tool.ts add --transcript <txt>`,
    stored regardless of source.
    - Plain text only. **Timed cues are a separate, later decision** —
      aligning a script to audio needs forced alignment, which *is* the
      Deepgram path and *is* gated on the chunk-join probe.
    - Any migration here must be versioned **after `20260926223031`**
      (the play-event RPC), not merely after the library migration.
      See §0.9 and the ordering guard.
  - **2b — comprehension questions.** Needs 2a's transcript, then
    authoring judgement. Not gated on play data either; questions are
    authored, not inferred.
  - **2c — XP amounts and SRS wiring. Genuinely gated, but on less
    than it looks.** Two separable questions: *does the pipeline
    record correctly* (does the event fire, with the right episode_id,
    does position clamp) — one real device session answers that, which
    build 20 provides; and *what are the right XP values and review
    intervals* — that needs volume and is properly later.

  So the parked item is **2c-tuning only**. 2a should ship now.

- ~~**Phase 3 — offline download, search. HALF DONE.**~~ **DONE, verified
  2026-09-27** — both halves confirmed built by reading the actual code,
  not the stale claim below:
  - Web search shipped (#119).
  - **iOS search: built.** `ListenView.swift` uses `.searchable`,
    `PodcastSearch.normalizeQuery`, `client.searchEpisodes` — this entry's
    "zero search references" claim was stale by the time it was checked.
  - **Offline download: built.** `PodcastDownloadManager.swift` +
    `PodcastCache`/`PodcastCacheBudget` (Kit) handle download, a size
    budget with eviction candidates, and offline listing
    (`PodcastCache.offlineListing`). Landed via #131/#133 (worktree-
    podcast-offline-spec/-kit), merged 2026-09-25, and this entry was
    simply never updated after.
- **Phase 4 — admin subsystem.** [DONE (verified 2026-10-09: the admin/ app exists on main and PR #140 merged; moderation tools added by #250).] App-wide roles, RLS, admin area, audit
  trail. Not started. Serves lesson authoring and moderation too.

**So the unblocked work is Phase 3's remainder** — neither half needs
the device or the ElevenLabs quota.

### Carried risks

- **Run the chunk-join probe before bulk-publishing any TTS episodes.**
  A wrong `duration_seconds` permanently zeroes every learner's resume
  position. The player now clamps against the media's real duration, so
  playback survives, but the stored value stays wrong and is what
  `clampPosition` measures against on read.
- ~~**`authenticated` holds a direct INSERT grant on
  `podcast_play_events`**~~ **DONE — verified applied 2026-09-25.**
  `authenticated` now has no INSERT on that table. Worth recording
  *because* the migration that did it was the one the ordering test
  flagged as possibly skipped (versioned before the table's own
  migration): it applied regardless. Two grant issues remain, both
  inert rather than urgent: `anon` still holds INSERT there, and both
  roles hold INSERT/UPDATE/DELETE on `podcast_episodes` and
  `podcast_folders`. RLS is enabled on all four with SELECT-only
  policies on the content tables, so no policy means deny and nothing
  is exploitable — but the grants are unnecessary surface and should be
  revoked the way
  `20260920050000_revoke_direct_gamification_writes.sql` did.
- **Revisit storage before any Pro gating.** [STILL OPEN (2026-10-09): no Pro gating exists for podcasts, so this only matters if that is ever added.] A public bucket cannot
  enforce entitlement, and that migration is the expensive one.
- **Regenerate `types.ts` after merge** [DONE (verified 2026-10-09): git grep untyped( over src/ finds nothing.] and delete the `untyped()` cast
  in `podcast.functions.ts` — see §0.6.1, same root cause.
- **Audio egress is metered and far heavier than current traffic**:
  ~2.9 MB per 6-minute episode, so 100 episodes × 100 learners ≈ 29 GB.

### Deferred minors (from that branch's own review)

- `pause` fires before `ended` [CAN'T VERIFY (2026-10-09): the iOS player was rewritten by PR #262; confirm on a device. Related and STILL OPEN on main: PodcastAudioPlayer.swift:495-497 upserts a left episode with no stamp; fixed on the open PR #270 branch (d0c2410, PodcastAudioPlayer.swift:509-515).], so finishing an episode issues two
  racing position upserts. Harmless only because `clampPosition` maps
  the result back to 0 on read.
- ~~`parseArgs` silently misreads `--confirm yes` (dry-runs while the
  operator believes it wrote), a valueless `--parent` (falls back to
  root), and `--sort abc` (NaN → raw Postgres error). `--course`/
  `--level` unvalidated locally. The `--confirm` one is a
  data-integrity trap, not a minor.~~ **DONE 2026-09-24** (PR #114,
  `bb372f1c`).
- `findCycle` never gates a real reparent — the CLI has no move
  command, so the guard can only fire on an already-cyclic tree. Not a
  live bug, but the protection is not load-bearing.
- `hardSplit` cuts mid-word [DONE (verified 2026-10-09: src/lib/podcast-tts.ts:17-27 falls back to the last whitespace)] at a fixed offset; falling back to the last
  whitespace is three lines and strictly better.
- No scrubber, though the plan specified one [STILL OPEN (verified 2026-10-09: no Slider anywhere in the iOS Sources or web PodcastPlayer.tsx)] — an undeclared deviation
  at the time.
- No DELETE on `podcast_playback` [DONE (verified 2026-10-09: supabase/migrations/20260930020000_grant_podcast_playback_delete.sql:10)] — a user cannot clear their own
  listening history.
- `music-metadata` is imported at module top level [DONE (verified 2026-10-09: scripts/podcast-tool.ts:219 uses a dynamic import)], so **every**
  command fails with `Cannot find package 'music-metadata'` if it is
  missing — including `folder`, `validate` and `publish`, none of which
  read audio. Hit live 2026-09-24 publishing episode 1 (stale local
  `node_modules`; the dep is declared and locked, just uninstalled).
  Harmless — it fails at import, before any Supabase write, so there is
  no partial state — but it misdirects. A dynamic `await import()`
  inside `durationSecondsOf` confines the requirement to the one command
  that actually needs it.

---

## 0.8d A TTS script is not a transcript (2026-09-25)

Phase 2a shipped `podcast-tool.ts transcript`, and the obvious source
for episode 1 is the script it was generated from. **It cannot be used
raw.** `ep01-ordering-coffee.script.txt` carries ElevenLabs SSML —
`<break time="1.0s" />` twenty-odd times — and `normalizeTranscript`
strips BOM, CRLF and blank-line runs but **not markup**. Attaching the
script directly would put `<break time="1.0s" />` in front of the deaf
and hard-of-hearing learners the feature exists for.

A cleaned sibling now lives beside it:

```
D:\AgentDevWork\Podcast\Learn With Alphonso  ep01-ordering-coffee.script.txt      TTS input, SSML included
  ep01-ordering-coffee.transcript.txt  learner-facing, 386 words, 0 tags
```

**This recurs for every TTS-generated episode**, so it is a process
question, not a one-off: either keep a clean sibling per episode (the
current answer), or have `--transcript` reject input containing markup
— rejecting is better than stripping, since silently removing tags from
a genuinely hand-written transcript would be surprising. Worth deciding
before episode 2.

Note the tool itself is not wrong: it is general, and SSML is an
artifact of how *this* episode was produced.

---

## 0.8e Build 21 device pass — results (2026-09-25)

Run by the account owner on TestFlight build 21. **9 pass, 1 real
defect, 1 checklist error of mine, 2 outstanding.**

**Passing:** no "More" overflow; due badge legible and correct; Settings
still on Learn's gear; all four themes render; episode plays with the
screen locked; lock screen and Control Center show the right title with
working play/pause/±15s; resume works within iOS and across to web; a
phone call pauses it and unplugging headphones pauses it.

**#10 PASSES, and it was the one that mattered.** A podcast playing, a
speaking exercise opened: the podcast **pauses cleanly and does not
auto-resume** on return. Zero automated coverage exists for this and
none can be added — it is the audio-session collision the whole Phase 1b
design is built around. Confirmed on hardware.

**#12 FAILS — the mini-bar overlaps the tab bar.** `RootView.swift:69`
applies `.safeAreaInset(edge: .bottom)` to the **TabView itself**, with
a comment asserting this makes the bar "sit above the tab bar and push
content up, instead of covering the last row". On device the inset is
consumed inside the tab bar's own region and the bar overlaps it.
`PodcastMiniBar` carries horizontal and vertical padding but nothing for
the tab bar. Likely fix: apply the inset to each tab's root content
rather than to the `TabView`. **Note the shape** — a comment that states
the behaviour it was meant to produce, on a layout nothing but a device
can check. Owned by the podcast session.

**#3 was my error, not a defect.** I listed "Season" as a Profile hub
destination. It never was: the hub holds League, Friends, Achievements
and Settings, and **Season is nested under League**
(`LeaderboardView.swift:81`) because League and Friends own their own
`NavigationStack`s and presenting them modally avoids nested stacks.
The owner checked correctly against a wrong list. Lesson: build the
device checklist from the code, not from the spec's prose.

**Outstanding:**

- **#11 — untested, not passed.** Playback continued under airplane
  mode, which is expected (a 1.3 MB file buffers fully) but does not
  exercise the check. The check is **browsing**: open Listen with
  airplane mode on and navigate the folder tree — honest offline state,
  or a stuck spinner?
- **#13 — French `speak` on device.** Build 21 is the first carrying
  `SpokenAnswerFR`. Not yet run. Sharper than it sounds: French `speak`
  uses the same `.playAndRecord` session the podcast must yield, so it
  re-tests #10 from the other side.

---

## 0.7b Memory starvation can fake a TEST FAILURE, not just spawn errors (2026-09-25)

Escalation of the starved-run problem, and the worst form of it yet.

Previously a starved run showed **spawn errors beside a green summary**
(`124 passed (124)` next to `Errors 6 errors`) — misleading, but the
tell was visible. On 2026-09-25 the English session hit a run reporting
**1 genuinely failed test** in `ai-quota.server.test.ts`, alongside six
worker-spawn errors, with eight competing vitest processes and 806 MB
free. **It passes 15/15 alone and in a clean run.**

So memory pressure can manufacture a red test. That is materially harder
to recognise as environmental than a short file count, because a named
failing test in a file you just touched is the most convincing possible
evidence that you broke something. The correct response to an unexpected
single failure on this machine is **re-run it alone before believing
it**, and check free memory.

**Measured root cause, 2026-09-25 (correcting three sessions' separate
diagnoses):**

- The box has **7.86 GB of RAM**, and sits at **~0.84 GB free**.
- It is **not disk**: `D:` has **190 GB free**, `C:` 11 GB. A session
  read "0.83 GB free of 7.86 GB" as disk; it was memory.
- It is **not the stray processes**. There were 26 stray node/bun
  processes totalling **732 MB combined** — most are 1–6 MB. Sweeping
  them reclaims roughly 500 MB.
- The actual consumers are **five concurrent `claude` processes at
  ~2.0 GB**, plus 467 MB of Memory Compression, itself a symptom.

**So four parallel sessions plus test suites do not fit in 7.86 GB.**
`maxWorkers: 4` (#116) fixed CPU contention and cannot fix this. Running
the suite in chunks and reconciling against the collected file count is
the correct method on this machine, not a workaround. CI stays
authoritative.

---

## 0.7c `swift.exe` is blocked on this machine (2026-09-25)

An Application Control policy now blocks `swift.exe`; it ran earlier the
same day and does not now, from either bash or PowerShell. Reported by
the podcast session.

**Consequence, and it is not small.** For app-target code
(`ios/LearnWithAlphonso/Sources/`), `ios-app-build` is the only
pre-merge signal, and **it compiles without running tests**.
`ios-swift-tests` covers `LearnWithAlphonsoKit` only. So a session can no
longer get a local RED/GREEN on any Swift change.

**How to work with it:** push as much logic as possible **into the Kit**,
where CI still runs real tests — for the offline-download work that
means eviction policy, partial-file handling and cached-duration
reconciliation belong in `LearnWithAlphonsoKit`, leaving only
`URLSession` wiring and UI in the app target. Compare
[[0.8e]]'s device findings: the app-target half is already the part only
a device can check.

---

## 0.8f Episode 2 is not an MP3, and the tool assumes one (2026-09-25)

The account owner supplied
`D:\AgentDevWork\Podcast\LWAE02\Stop_freezing_in_English_with_AI.m4a`
— **M4A/AAC, 5:30 (330.443s), stereo, 257 kbps, 10.1 MB**.

**`podcast-tool.ts add` hardcodes MP3 in three places** and none of them
validate the input:

- `storagePathFor()` names the object `${slug}.mp3` regardless
- the upload passes `contentType: "audio/mpeg"` unconditionally
- `durationSecondsOf()` parses with `{ mimeType: "audio/mpeg" }`

So handing it an M4A stores AAC bytes under an `.mp3` name and serves
them as `audio/mpeg`. Browsers and AVPlayer often sniff past that, which
is worse than failing — it would work until something didn't.

**Worked around by transcoding** to the established convention (mono,
64 kbps, 44.1 kHz): `ep02-stop-freezing.mp3`, **2.64 MB**, duration
preserved exactly at 330.443s. 10.1 MB → 2.64 MB also matters for the
metered-egress note in §0.8.

**The real fix, for whoever touches the CLI next:** either reject
non-MP3 input by magic bytes with a named error (the pattern
`--transcript` now uses for markup), or accept common audio types and
derive extension and content-type from what was actually given. Silently
mislabelling is the one option to rule out. Same family as the
transcript/SSML case in §0.8d: an input the tool assumes rather than
checks.

**Also unresolved: where episode 2 goes.** The folder tree is `en` →
`a1` only, and "Stop freezing in English with AI" is not A1 beginner
content. Needs either a new folder or a deliberate decision to file it
under a level it does not belong to.

---

## 0.8b A report-only test whose reports are swallowed (2026-09-25)

`curriculum-consistency.test.ts`'s "no duplicate prompt text across
different packs" gates French at zero and is **report-only for English
and Spanish** -- it `console.log`s the offenders instead of failing.

**Vitest intercepts that console.log and never prints it.** A normal
`vitest run` shows 46/46 passed and nothing else. The same command with
`--disableConsoleIntercept` prints:

```
en: 7 cross-pack duplicate prompt groups (not gated):
es: 57 cross-pack duplicate prompt groups (not gated):
```

Confirmed independently by computing the same metric outside the test:
en 7, fr 0, es 57.

So the check has been producing real findings and discarding them since
it was written, and a session reasonably read the silence as "zero" --
"no output" is indistinguishable from "nothing measured". This is a
distinct and nastier member of the [[tests that cannot fail]] family:
not a test that cannot fail, but one that **finds the defect and throws
it away**, manufacturing confidence rather than merely failing to
provide it.

**Fix:** assert against a recorded baseline (`expect(dupes.length)
.toBe(57)` for es, 7 for en) so the number lives in the file, falls as
they are fixed, and fails loudly when a new one is added. A report-only
branch that cannot report is worse than no check.

**The es 57 are not cosmetic** -- many are contradictory answers to an
identical prompt, which marks a correct learner wrong: happy ->
feliz/contento, teacher -> maestro/profesor, nurse ->
enfermero/enfermera, fish -> pez/pescado, and
`yo ___ (hacer) mi tarea.` -> hago/he hecho (two tenses, no tense cue).
Owned by the Spanish content audit session. The en 7 go to the English
session.

**Spanish corpus, measured 2026-09-25:** 130 packs but only **2,540
questions** -- the most packs and the fewest questions of the three
courses (en 3,096, fr 2,875), because 83 of 130 packs are short
(3 at 10 lines, 53 at 15, 27 at 20, 47 at 25).

---

## 0.8c `ios-release.yml` reports success without uploading (2026-09-25)

`gh workflow run ios-release.yml --ref main` archives, signs, exports an
`.ipa`, uploads it as a build artifact — and **skips the TestFlight
upload**, finishing `completed/success`. The upload step is gated on a
`workflow_dispatch` input:

```yaml
- name: Upload to TestFlight (App Store Connect)
  if: ${{ inputs.upload_to_testflight }}
```

which is `type: boolean, default: false`. Omit it and the job is green
with step 11 `skipped`, which reads identically to success unless you
inspect the step list rather than the job conclusion.

**Always trigger it as:**

```sh
gh workflow run ios-release.yml --ref main -f upload_to_testflight=true
```

Hit live 2026-09-25 submitting build 21; cost one full archive cycle.
Build 20 had been triggered from the Actions tab, where the checkbox is
visible, which is why it did not happen before.

The default is arguably correct — a signed archive is useful without
publishing it, and defaulting to upload would make an accidental
dispatch push a build to testers. The gap is that the *result* does not
distinguish "exported" from "shipped". A cheap improvement: a final step
that prints which of the two happened, so the run summary says it.

Same family as §0.8b and §0.11 — a green signal that is silent about the
thing you actually wanted. Sixth instance in two days.

---

## 0.9 Migration version collisions — guarded 2026-09-24

Two parallel sessions independently chose version `20260926010000`
(#96's translate question type, #98's podcast library). **Git cannot see
this collision** — the filenames differ, so neither PR conflicts and
both go green — but Supabase keys applied migrations *by version*, so
`supabase db push` cannot disambiguate and fails. The failure therefore
lands on `main`, in `deploy-supabase`, attributed to whichever PR merged
second, and takes the whole chain with it (Edge Function deploy, APNs
sync and the curriculum seed are all skipped).

Fixed in PR #100 (`ff4ba57f`) by renaming the **unapplied** migration;
renaming an *applied* one is what caused the history mismatch #96 had
just finished repairing. A CI guard in `deno-tests` now fails the PR on
duplicate versions.

**Convention going forward:** use a real timestamp with seconds
(`20260924081755`), not a rounded `HHmmss` of zeros. Round numbers are
exactly what two sessions working the same day both reach for.

**Related:** never pin a migration version in a test.
`podcast-schema.test.ts` did, and the rename broke it at module load.
It now globs `*_podcast_library.sql` and throws if that does not match
exactly one file.

---

## 0.9b Placement exam was teaching to its own test (#128, 2026-09-25)

**25 of the placement exam's 60 English questions duplicated course
content**, so a learner could meet a question in the exam that sets
their starting level and again in a lesson. French was clean; Spanish
had 2. All now gated at **0** by
`src/data/placement-lesson-overlap.test.ts`.

**Ten were self-inflicted and recent.** When Phase 5 taught the exam the
`listening` type, its sentences were authored by lifting them from the
course's own listening packs — so *every* listening question in the
placement exam was scoring recall of one specific lesson item. The other
15 were older: 13 `mc` matching hand-written units, 2 `translate`
matching `a2p23`/`c1p23` verbatim.

**Why nothing caught it — the structural lesson.** There are three pairs
of content sets and only two had an owner:

| Pair | Owner |
| --- | --- |
| lesson ↔ lesson | `curriculum-consistency.test.ts` (never reads the pool) |
| placement ↔ placement | `placement-validity.test.ts` (never reads the banks) |
| **placement ↔ lesson** | **nobody** |

Neither existing guard was wrong. **A gap between two guards is
invisible to both** — which is a different failure from a guard that
cannot fail, and needs a different remedy: enumerate the pairs, not the
checks.

**A fourth gap surfaced while writing the guard:** nothing checked
whether the pool repeats *itself*. That matters because the pool is
sampled three-per-band, so identical content sitting in two bands can be
drawn in a single sitting and counted twice. Also gated at 0 now.

**All 27 fixes went on the placement side**, deliberately: placement ids
are not review keys, so no learner's saved SRS state moved — and it kept
the work out of `lesson-bank-es.ts` while the Spanish audit was live.

### The carried hazard — a shared prompt TEMPLATE

One overlap was against **`esa1p1`'s prompt template**,
`How do you say "%s" in Spanish?`, not against a specific line. **Two
packs share that template.** So disambiguating by swapping the word just
defers the collision to the next time either pack covers that word. Where
a duplicate sits under a shared template, **change the question's form**,
not the word. Handed to the Spanish session for step 4.

---

## 0.10 Placement exam — speaking deliberately excluded (2026-09-24)

Recorded here because the Phase 5 session could not: this file is
gitignored and exists only in the main checkout.

**The exam assesses `mc`, `fill`, `listening` and `translate`. Speaking
is deliberately out.** Not an oversight, and not a gap to close later
without re-deciding:

- It would gate onboarding on a microphone permission prompt **before
  the learner has any reason to grant it**.
- A denial makes the question **unanswerable**, so the exam cannot
  score it at all.
- The typing fallback that rescues a speak question inside a lesson
  would here be **assessing writing while claiming to assess speaking** —
  worse than not asking.

That leaves one question type the exam never shows, as an argued gap
rather than the accidental three-type one it started as. Revisit only
if placement accuracy for spoken production becomes a real complaint,
and only with a design for the permission prompt.

**iOS has no placement flow at all** — every "placement" hit in the
Swift sources is SwiftUI's `ToolbarItem(placement:)`. So this is web
plus the mirror table, not four surfaces.

### What the whole-branch review caught, worth remembering

The session spent the plan defending against placing learners **too
low**, and shipped content that placed them **too high**. Every one of
these was invisible to every test:

- **The no-TTS fallback printed the answer.** Every listening
  question's `audioText` is character-identical to its correct choice,
  so showing the sentence above the options handed out a free mark. Two
  free marks take a band under the 2-of-3 rule, and a free band raises
  the starting level. Inherited from the lesson player without noticing
  that **what costs one heart there sets the course level here**.
  Listening questions are now removed from the exam when speech
  synthesis is unavailable, rather than pretending to assess listening
  on a device that cannot play it.
- **Two options, not four** — a 50% guess floor sitting beside 25%
  multiple-choice questions, in an exam decided on 2 of 3.
- **Three translate prompts contained their own answers** ("Greet
  someone in the morning." accepting "Morning.").
- **`sort(() => Math.random() - 0.5)` is not a shuffle** — measured
  13.8% against a fair 16.7%. A well-known broken idiom; use
  Fisher-Yates.

### The testing lesson, which generalises past placement

Three assertions in a row here could not fail:

1. `dump.placement.length === 45` — replaced with a derivation from
   `PLACEMENT_QUESTIONS.length`, which is tautological because the dump
   is a `.map()` of that same array.
2. The id-set comparison suggested as the fix **is also weak**: both
   sides derive from the same array, so it only detects a change to the
   key template. Its mutation test passed because slicing the dump
   changes *which* items map, not because the assertion pins content.
3. A listening route test asserted a button became enabled — true
   whether grading works or not.

The real gap was that **nothing asserted content volume or
distribution** once the hardcoded 45 went. Fixed by a placement-validity
suite asserting properties rather than identity: four options, no prompt
containing its answer, per-band coverage by type, no duplicate option
text in any course.

**Generalises to:** an assertion comparing two values derived from the
same source tests the derivation, not the data. Assert *properties* the
derivation does not guarantee.

---

## 0.11 Two testing traps, both found the hard way (2026-09-24)

Recorded from the Phase 5 session, which could not reach this file from
a worktree. Both generalise past placement.

### Sample-then-filter vs filter-then-sample

**"Filter the sampled set" and "sample the filtered pool" read
identically and are not the same.** A fixed-size draw that samples first
and filters second can come up short.

Concretely: the placement exam draws 3 questions per CEFR band. When the
device cannot play audio, listening questions must be excluded. Drawing
3 and *then* dropping the unplayable ones can leave a band holding one
question — which no learner can pass, so it **deflates** the placement.
Shipped behaviour filters into a `playablePool` *before* the draw.

**Any code that samples a fixed count per bucket and then filters has
this bug.** Worth grepping for when touching sampling logic.

Note the symmetry with the defect it replaced: the first version
*inflated* placement (the no-TTS fallback printed the answer), and the
first fix *deflated* it. Both were invisible to every test.

### A guard can assert the right property and still not bite

The placement-validity suite asserted the pool held at least 3 non-audio
questions per band. **That stayed true while the code sampled first**,
because the property is about the *pool*, and the bug was in the *draw*.
The guard was correct and useless simultaneously.

**Generalises to:** a guard has to exercise the real composition, not a
property that merely implies it. This is the sibling of the
already-recorded lesson that an assertion comparing two values derived
from the same source tests the derivation, not the data (§0.10), and of
the mutation-test lesson in `AGENTS.md`.

Three distinct versions of "the test could not fail" have now been found
in one day, by three different sessions. It is the most common defect
class in this codebase, ahead of anything in the product code.

---

## 1. Launch-blocking — do this before adding more features

### 1.1 RevenueCat production setup + real App Store launch
**Priority: highest.** No purchasable subscription exists anywhere —
`PaywallView` shows "not available yet." Every feature built so far
(Hector, weakness tracking, generative practice, all of V3) sits behind
a business model that isn't live. Full checklist:
`docs/v2-kickoffs/09-revenuecat-and-app-store-launch.md` (note: that doc
references the repo's old path `english-buddy-app-33` — stale, the repo
is now `LearnWithAlphonso`).

Known current state (re-verify, don't trust):
- App Store Connect app record exists: "Learn With Alphonso", app id
  `6813969159`, bundle `com.obsidianmedia.learnwithalphonso`, Team ID
  `9Y6GYPM3K5`.
- ~~RevenueCat still on a Test Store key, no real Offering/Package.~~
  **REAL PRODUCTION SETUP DONE 2026-09-23** (driven by Shipaton
  hackathon urgency — see
  `D:\AgentDevWork\repos\Hackaton\Shipaton\02-launch-checklist\
  execution-record.md` for the full raw record of every API call):
  - **Paid Applications Agreement confirmed signed** — verified
    indirectly (a real subscription-group creation succeeded, which
    Apple only allows with the agreement active).
  - Real subscription group "Alphonso Pro" (`22405850`), subscription
    "Alphonso Pro Monthly" (`6815009725`, product id
    `com.obsidianmedia.learnwithalphonso.pro.monthly`), en-US
    localization, and a **real $9.99/month price live in all 174 App
    Store territories** (a base USA price does NOT auto-equalize to
    other territories — a real gap found and fixed via
    `GET /v1/subscriptionPricePoints/{id}/equalizations` +
    `scripts/create-subscription-product.ts`'s `equalize-prices`
    command).
  - **A 2-week `FREE_TRIAL` introductory offer live in all 175
    territories** (same script's `create-intro-offer` command, looped
    per-territory — Apple's API has no bulk/all-territories mode for
    this).
  - RevenueCat dashboard fully wired (done manually by the account
    owner, not API-scriptable — no RevenueCat API credentials
    available): app registered via a fresh In-App Purchase Key
    (StoreKit 2, correct since the app targets iOS 17+), `Alphonso Pro`
    product created and linked, `pro` Entitlement created from scratch
    and attached (none existed under this RevenueCat project before),
    `default` Offering with a `$rc_monthly` Package.
  - Production public SDK key (`appl_pVgkoYpsyxxpjtmwJRxLMTwQYMN`) set
    as the `REVENUECAT_API_KEY` repo secret. Build bumped 14→15
    (`project.yml`) to be the first build capable of showing this real
    offer.
  - **Build 15 shipped but was confirmed BROKEN on a real device**:
    paywall showed "Subscriptions aren't available in this build yet"
    (the exact string `EntitlementStore.loadOffering()` shows when
    `AppConfig.revenueCatAPIKey` is `nil`) — the key never actually
    reached the built app despite the pipeline reporting success.
  - **Root cause found and FIXED 2026-09-23**: `INFOPLIST_KEY_RCApiKey`
    (a per-config build setting) resolved correctly at every build-
    setting layer checked (generated `.pbxproj`,
    `xcodebuild -showBuildSettings`) but never reached the actual
    archived `Info.plist` — this target merges `GENERATE_INFOPLIST_FILE`
    synthesis with a real `INFOPLIST_FILE` (already true for
    `CFBundleURLTypes`), and that merge mode only carries over Apple's
    own well-known keys via `INFOPLIST_KEY_*`, not arbitrary custom
    ones. Fixed by moving `RCApiKey` directly into
    `ios/LearnWithAlphonso/Info.plist` (same pattern `CFBundleURLTypes`
    already used), with `ios-release.yml` `sed`-substituting the real
    key over the Test Store default before archiving. Verified for real
    against the actual archived binary (`plutil`/`PlistBuddy`, not
    assumed) before shipping build 16. **Reusable lesson**: any future
    custom `INFOPLIST_KEY_*` setting on this target that lives in a
    per-config block (not `base`) should be assumed broken the same way
    — put it in `Info.plist` directly instead.
  - Build 16 shipped 2026-09-23 with the real fix — Archive/Export/
    Upload all succeeded.
  - **Real blocker found and confirmed 2026-09-23**: after fixing
    RCApiKey (build 16/17), the paywall failed with
    `RevenueCat.ErrorCode 23` ("none of the products could be fetched
    from App Store Connect"). Chased through two genuinely real, now-
    fixed gaps (App Store Review Screenshot uploaded; subscription
    group's own localization created — a separate requirement from the
    subscription's own) — but the subscription still won't work. Root
    cause, confirmed via Apple's own official App Store Connect Help
    docs: **"Your first auto-renewable subscription must be submitted
    with a new app version."** A hard rule specific to an app's first
    subscription, no API workaround. **This subscription cannot work at
    all — not even for our own sandbox/TestFlight testing — without
    attaching it to a real app version and submitting that version for
    actual App Store Review.** Full trail in
    `D:\AgentDevWork\repos\Hackaton\Shipaton\02-launch-checklist\
    execution-record.md`.
  - **Current decision (account owner, 2026-09-23)**: prepare Part 2
    (real App Store Connect screenshots, final description/keywords
    sign-off) first, then revisit whether/when to actually submit —
    deliberately not rushed into submission by this discovery. Nothing
    submitted yet, nothing attached to an app version yet.
  - **Part 2 progress 2026-09-24** (audited read-only via
    `check-app-store-status.yml`'s `app-info` job, app `6813969159`):
    - `appStoreState` is **PREPARE_FOR_SUBMISSION**; primary category
      **EDUCATION** is set (secondary is unset — optional); the age
      rating declaration is **fully populated**. So those Part 2 boxes
      are already ticked.
    - **The keywords draft could not have been submitted.** It was
      **141 chars against Apple's 100-char limit**, and contained
      **"duolingo alternative"** — a competitor trademark, which App
      Store Review rejects in metadata. On a *first* submission, i.e.
      the one that gates this whole subscription, that is not a risk
      worth taking for one keyword. Rewritten to a compliant
      94-char set (98-char alternative offered) in
      `Hackaton/Shipaton/03-submission-materials/app-store-copy-draft.md`.
    - Pricing question there resolved: **$9.99/mo + 2-week free trial**.
      Recommended keeping the price out of the description (Apple
      doesn't require it; hardcoding costs a review cycle if it changes)
      but surfacing the free trial, which is currently invisible.
    - **Still genuinely open: real App Store screenshots.** Needs a
      human with a device — that is now the binding item in Part 2, not
      the copy.
- Code signing + TestFlight upload pipeline works and is proven
  (`.github/workflows/ios-release.yml`); a build on TestFlight includes
  this session's full V3 work (shipped 2026-09-21, before tonight's
  font/pronunciation/Spanish-course work).
- ~~**Certificate-limit blocker**~~ **PERMANENTLY FIXED 2026-09-21**.
  A release run failed at the Archive step with `error: Choose a
  certificate to revoke. Your account has reached the maximum number
  of certificates.` Root cause, confirmed via a new diagnostic tool
  (`scripts/manage-ios-certificates.ts` + `.github/workflows/
  manage-ios-certificates.yml`): `-allowProvisioningUpdates` (automatic
  signing) on a fresh GitHub-hosted runner every time means each run's
  certificate's private key is destroyed with the VM the moment the job
  ends, so every run was minting a new certificate instead of reusing
  one, until the account's cap was hit. `ios-app-build` (the PR/push CI
  job) is unaffected -- Simulator-only, `CODE_SIGNING_ALLOWED=NO`.
  - Immediate unblock: revoked 10 orphaned "Apple Development: Created
    via API" certificates (safe -- their private keys were already
    permanently gone).
  - Investigated generating a fresh persisted Distribution certificate
    for the permanent fix -- found the account's Distribution-cert pool
    was *also* capped at 3 per type (both legacy `IOS_DISTRIBUTION` and
    modern `DISTRIBUTION`), all 6 slots filled by 5 *other* real apps
    (Alphonso Companion, Warboss Highway, obsidianmediaremotectrl x2,
    Obsidian Cockpit, Let It Rain) -- none of them LearnWithAlphonso.
    Built a `profiles` command (same script) to show which real app
    each certificate belongs to via its provisioning profile, since a
    certificate alone isn't app-specific. With that visibility, revoked
    `WTUJW63B9Y` (Let It Rain's certificate, explicitly authorized) to
    free a slot -- Let It Rain already had a stale unrelated profile
    pointing at an already-gone certificate, so if that app breaks,
    check its own signing setup, not this fix.
  - Generated a new, CI-owned "Apple Distribution" certificate + App
    Store provisioning profile via the App Store Connect API
    (`scripts/generate-ios-distribution-signing.ts`,
    `.github/workflows/setup-ios-manual-signing.yml`) -- the private
    key is generated on the runner and never touches any local machine
    or the Apple Developer portal. Stored as 4 new repo secrets
    (`IOS_DIST_CERTIFICATE_P12_BASE64`, `IOS_DIST_CERTIFICATE_PASSWORD`,
    `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_PROVISIONING_PROFILE_UUID`).
  - `ios-release.yml` now imports this certificate into a temporary
    keychain and installs the profile every run (`CODE_SIGN_STYLE=Manual`),
    instead of `-allowProvisioningUpdates` minting a fresh one --
    immune to ever hitting this cap again from this workflow.
  - **Fully verified end-to-end 2026-09-21** after three more real bugs
    found and fixed live (each confirmed via an actual CI run, not
    guessed):
    1. OpenSSL 3.x's default PKCS12 export (AES-256/PBES2, SHA-256 MAC)
       isn't importable by Apple's `security import`
       ("MAC verification failed" even with the correct password) --
       fixed by forcing legacy `PBE-SHA1-3DES`/SHA1 in
       `generate-ios-distribution-signing.ts`'s `openssl pkcs12
       -export` call. Didn't need to re-mint the certificate for this --
       re-exported the same already-issued key+cert pair from the old
       (incompatible) `.p12` into a new one.
    2. A global `xcodebuild ... CODE_SIGN_STYLE=Manual
       PROVISIONING_PROFILE_SPECIFIER=...` command-line override applies
       to *every* target in the build, including Xcode's implicit
       signing targets for SPM package products (RevenueCat,
       LearnWithAlphonsoKit) -- those categorically reject provisioning
       profiles and failed the archive. Fixed by scoping the manual-
       signing settings to just the `LearnWithAlphonso` app target's
       Release config in `project.yml` (XcodeGen) instead.
    3. That fix didn't take at first because `project.yml` ended up
       with two `Release:` keys under the same target's
       `settings.configs` (a pre-existing one for
       `INFOPLIST_KEY_RCApiKey`, plus the new one) -- a duplicate YAML
       mapping key silently overwrites the earlier one, so the signing
       settings were discarded and the generated `.pbxproj` kept
       `CODE_SIGN_STYLE=Automatic`. Found via a temporary debug step
       printing the actual `.pbxproj` contents; fixed by merging into
       one `Release:` block. Also: the profile UUID is baked into
       `project.yml` with `sed` before `xcodegen generate` runs (a
       literal value), not resolved via `$(VAR)` build-setting
       indirection -- that indirection doesn't reliably resolve for
       code-signing-specific attributes even though it works fine for
       plain settings like `$(REVENUECAT_API_KEY)`.
    - A real run (`gh run 35658829889`) archived, signed, and exported a
      `.ipa` successfully end-to-end. A follow-up run with
      `upload_to_testflight=true` (`gh run 35659235645`) got all the way
      to `altool` authenticating and validating against Apple's real
      servers -- it was rejected only for an unrelated, expected reason
      (`CURRENT_PROJECT_VERSION` / build number 6 already used on
      TestFlight from an earlier upload this session), not any signing
      failure. Bump `CURRENT_PROJECT_VERSION` in `project.yml` before
      the next real TestFlight upload.
- Privacy policy page exists (`src/routes/privacy.tsx`,
  `/privacy`) — usable for App Store Connect's Privacy Policy URL field,
  but its *content* hasn't been verified adequate for Apple's actual
  review requirements.

Real steps still needed (see the doc for full detail):
1. ~~Sign the Paid Applications Agreement in App Store Connect~~ **DONE
   (confirmed signed) 2026-09-23.**
2. ~~Create the subscription product/group (~$9.99/mo "Alphonso Pro")~~
   **DONE 2026-09-23**, priced and free-trial-enabled in every
   territory — see "Known current state" above.
3. ~~Connect it in RevenueCat: reuse the existing `"pro"` entitlement,
   create a real Offering + Package~~ **DONE 2026-09-23.**
4. ~~Swap `AppConfig.revenueCatAPIKey` for the production public key~~
   **DONE 2026-09-23** — set as the `REVENUECAT_API_KEY` repo secret
   (no app code change needed, it reads from Info.plist at build time).
5. **Verify an actual sandbox purchase grants Pro end-to-end** [CAN'T VERIFY from code (2026-10-09): needs a sandbox or TestFlight purchase on a device; build 49 carried the subscription into review.] — **still
   open, the real remaining step.** Don't consider this done on config
   alone.
6. App Store Connect submission metadata: real screenshots (no
   mockups), description/keywords/subtitle (needs your input on
   tone/positioning, not auto-generated), ~~export-compliance
   answer~~ **DONE 2026-09-22** — `ITSAppUsesNonExemptEncryption =
   false` set in `ios/LearnWithAlphonso/Info.plist` (PR #63), so
   App Store Connect no longer asks on submission. Verified against
   the actual binary first (not assumed): all networking is plain
   HTTPS/TLS via `URLSession`; the one hand-implemented algorithm,
   `LearnWithAlphonsoKit/SHA256Pure.swift` (standard FIPS 180-4
   SHA-256), is used only for a PKCE `code_challenge`
   (authentication/integrity, never confidentiality) — the EAR
   Sec. 740.17(b)(1) exemption. Re-evaluate if this app ever adds
   encryption for actual data confidentiality. ~~Age rating
   questionnaire, category~~ **DONE 2026-09-22** — set via the App
   Store Connect API (`appInfos`/`ageRatingDeclaration` resources):
   primary category `EDUCATION`; age rating declaration answered "no"
   on every content descriptor after actually checking the app (no ad
   SDK, no `WKWebView`/unrestricted browsing — Google sign-in's
   `ASWebAuthenticationSession` doesn't count, no user-to-user
   messaging — Hector is user↔AI not user↔user, no gambling/contests/
   weapons/mature content anywhere in the lesson or scenario content).
   Apple computed `appStoreAgeRating: FOUR_PLUS` from that
   declaration — confirmed via a follow-up read, not assumed. One
   separate, non-form consideration worth remembering at actual
   review time: Hector's replies are LLM-generated (NVIDIA NIM),
   constrained by system prompts but not a hard content filter — this
   is an App Review Guideline 1.x risk, not an age-rating-form one, so
   it wasn't part of this declaration, but have an answer ready if
   Apple asks during review. Still open: real screenshots (no
   mockups), description/keywords/subtitle (needs your input on
   tone/positioning, not auto-generated).
7. Actual submission — a real, semi-irreversible action. [SUPERSEDED (2026-10-09): submitted 2026-09-30/10-01 as build 49 (see 0.0-y); build 49 was later pulled and build 50 (release candidate dd52ff0 plus later fixes) is the one to submit.] **Confirm with
   you explicitly, immediately before doing this**, same as every other
   production/account action this project treats as needing a live
   go-ahead. **Still open as of 2026-09-28** — see sec 0.0y's update and
   items 8-11 below for what's been resolved first.
8. ~~PrivacyInfo.xcprivacy privacy manifest~~ **DONE 2026-09-28** —
   missing entirely from the iOS project (Apple's mandatory since May
   2024 for apps using required-reason APIs; this app's UserDefaults
   usage qualifies). Added to both the app and widget targets,
   `NSUserDefaults` reason `1C8F.1`. Verified green in CI
   (`ios-app-build`, `ios-swift-tests`), commit `a0627d2`.
9. ~~Sign in with Apple's App ID capability, "not yet confirmed done"
   per the entitlements files' own comments~~ **DONE (confirmed live)
   2026-09-28** — real `bundleIdCapabilities` for
   `com.obsidianmedia.learnwithalphonso` include `APPLE_ID_AUTH`,
   `PUSH_NOTIFICATIONS`, `APP_GROUPS`, `IN_APP_PURCHASE`. One unrelated
   unused capability, `PUSH_TO_TALK`, is also enabled — harmless,
   worth removing later.
10. ~~4 Apple ID revocation secrets in Vercel production~~ **DONE
    (confirmed live) 2026-09-28** — `APPLE_TEAM_ID`/`APPLE_KEY_ID`/
    `APPLE_PRIVATE_KEY`/`APPLE_CLIENT_ID` all present, target
    production.
11. New finding, 2026-09-28: Vercel's own scanner flags
    `SUPABASE_SERVICE_ROLE_KEY` (and `LESSON_SESSION_SECRET`,
    `DEEPGRAM_API_KEY`, `NVIDIA_API_KEY`) with a live
    `"readable-secret"` issue — sharpens the existing "rotate
    service_role key" item elsewhere in this file. Not acted on yet,
    intentionally deferred until after App Store submission.

### 1.2 Marketing site content pass — PARTLY DONE, verified 2026-09-24 — CAN'T VERIFY from this repo (2026-10-09: the marketing site is the separate LearnWithAlphonsoMarketing repo; legal pages and footer were updated by PR #247 / marketing #1, the rest of the list is unchecked)
**Priority: medium (was high).** This entry said only "already handed
off... if that session's work isn't done yet, the prompt itself is the
spec". It was stale: that session shipped substantial work on
2026-09-23 (repo `obsidian-media/LearnWithAlphonsoMarketing`, last push
2026-09-23T08:35). Verified against the live site
(`learnwithalphonsomarketing.vercel.app`, home + /features + /pricing)
rather than against the repo's commit titles.

Item-by-item status of the original seven:

- ~~**Missing pricing section**~~ **DONE.** A real `/pricing` page:
  Free $0, "Hector Pro" $9.99/mo.
- ~~**Inaccurate iOS "coming soon" copy**~~ **DONE.** Home page now
  reads "🦙 In TestFlight beta on iOS", exactly as this entry asked.
- ~~**Thin AI-conversation description**~~ **MOSTLY DONE.** /features
  now says "12 roleplay scenarios by voice or text, with clarity
  feedback on your spoken answers and difficulty that adapts to your
  CEFR level", plus a sample scenario. Reasonable depth now.
- **No social proof** — **STILL OPEN.** Nothing anywhere. Note the
  original constraint still applies and still matters: it **must not be
  fabricated**. With no real users to quote yet, the honest options are
  to leave it out (current state, and defensible) or to substitute
  something true and concrete — course size, CEFR coverage, question
  counts — rather than inventing testimonials.
- **No Android status** — **STILL OPEN.** Zero mentions on any of the
  three pages. Android is intentionally not started (§3 Platform), so
  the fix is a one-line honest statement, not a roadmap promise.
- **Only one sample question shown** — **STILL OPEN.** Still exactly
  one per page (home: "She ___ to the store yesterday"; /features: a
  fill-in-the-blank about coffee). With 1,542 lessons across three
  courses this undersells the product badly — cheapest high-value fix
  left.
- **No competitor differentiation** — **PARTIAL.** /features has a "Why
  Alphonso" section and positioning ("Not another flashcard app"), but
  no named comparison. May well be deliberate; decide rather than
  default.

**Also worth a re-check, not yet actionable**: /pricing marks Hector Pro
"coming soon, not yet purchasable". Per §1.1 the real subscription
products now exist in App Store Connect (group `22405850`, monthly
`6815009725`), but the subscription still needs app review before it can
actually be bought — so that copy is probably still accurate. Re-verify
it the moment the subscription goes live, because it flips from accurate
to actively wrong at that instant.

### 1.3 V4 #2 (real push notifications) — built, config done, awaiting real-device verification — PARTLY DONE (verified 2026-10-09: built and configured, claim_device_token exists (PR #255); real delivery to a physical device is OWNER-ONLY and unconfirmed)
**Priority: high.** **Update 2026-09-22**: all config steps below are
now done —
- APNs Auth Key created (Production environment, scoped to
  `com.obsidianmedia.learnwithalphonso`), Key ID/Team ID/Bundle ID set
  as `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_KEY_P8` repo
  secrets, synced into Supabase Edge Function secrets via CI's existing
  "Sync APNs secrets" step (`.github/workflows/ci.yml`) — confirmed via
  a real run.
- Push Notifications capability confirmed enabled on the App ID
  (checked read-only via the App Store Connect API).
- Distribution provisioning profile regenerated to include it — reused
  the **existing** certificate (`Apple Distribution: Shayan Salimi`,
  `6DP48X2D46`), no new certificate minted, so this did not repeat the
  certificate-cap incident (§1.1). New profile id `UN2TVL9PX2`, UUID
  `47ba1703-5a9b-4427-9136-e9655ba3fa11`; `IOS_PROVISIONING_PROFILE_BASE64`/
  `IOS_PROVISIONING_PROFILE_UUID` repo secrets updated to match.
- `LearnWithAlphonso-Release.entitlements` wired into `project.yml`'s
  Release config (PR #60, merged to `main`, `ios-app-build` CI green).

**Still not done — the one real remaining step**: an actual signed
TestFlight build has not been run since this config landed, so **no
push has ever actually been delivered to a real device**. Don't
consider this feature done until: (1) a real `ios-release.yml` run
archives/signs/uploads successfully with the new profile (confirms the
provisioning profile change didn't break anything), and (2) a real
device with the TestFlight build installed actually receives a
nudge-a-friend or leaderboard-overtake push end-to-end.

Original blocker context (now resolved), kept for history:
Merged 2026-09-21 (`docs/v4-kickoffs/` batch, PR #59 → `main`): `device_tokens`
table + RLS migration, `supabase/functions/send-push` + `_shared/apns.ts`
(ES256 JWT signing, dead-token pruning), iOS registration flow
(`RemotePushRegistrar.swift`, wired into the existing local-notification
permission prompt), and leaderboard-overtake/nudge-a-friend push triggers.
Everything gracefully no-ops until the secrets below exist — no crash, no
broken UI, same contract `AppConfig.revenueCatAPIKey` already established.
**No push has been or can be sent/verified — this is 100% untested against
a real device**, because of the step below.

**What's needed — an interactive Apple Developer portal action, no agent
can do this:**
1. Sign in at [developer.apple.com/account](https://developer.apple.com/account)
   with the account that owns Team ID `9Y6GYPM3K5` (this project's team, per
   §1.1 above).
2. Go to **Certificates, Identifiers & Profiles → Keys**
   (`developer.apple.com/account/resources/authkeys/list`) and click **+**.
3. Name it (e.g. "LearnWithAlphonso APNs Key"), check **Apple Push
   Notifications service (APNs)**, click **Continue**, then **Register**.
4. **Download the `.p8` file immediately — Apple lets you download it
   exactly once, ever.** If it's lost, the key must be revoked and a new
   one generated (and every consumer below updated). Don't commit it to
   the repo; store it in a password manager / secrets vault.
5. Note the **Key ID** (10-character alphanumeric, shown on the key's own
   page) — Team ID is already known (`9Y6GYPM3K5`).
6. Under **Identifiers**, open the `com.obsidianmedia.learnwithalphonso`
   App ID and enable the **Push Notifications** capability (currently off).
7. The existing Distribution provisioning profile (from §1.1's
   `setup-ios-manual-signing.yml`/`generate-ios-distribution-signing.ts`)
   was generated *before* that capability existed on the App ID — it will
   need regenerating/updating to include it, or the Release archive step
   will fail once push entitlements are wired in (next step).

**What to do with the key once you have it:**
1. Set it as **Supabase Edge Function secrets** (not GitHub secrets — these
   are read via `Deno.env.get` at runtime in `supabase/functions/_shared/apns.ts`):
   ```
   supabase secrets set APNS_KEY_ID=<the 10-char Key ID>
   supabase secrets set APNS_TEAM_ID=9Y6GYPM3K5
   supabase secrets set APNS_BUNDLE_ID=com.obsidianmedia.learnwithalphonso
   ```
   For the multi-line `.p8` contents, prefer an env file over a shell
   one-liner (avoids quoting/newline issues):
   `supabase secrets set --env-file ./apns.env` where `apns.env` contains
   `APNS_KEY_P8="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"`
   (or check current Supabase CLI docs for the exact multi-line-secret
   syntax — verify, don't guess, since CLI flag behavior shifts over time).
2. Once the App ID + provisioning profile both support Push Notifications
   (step 6/7 above), wire `LearnWithAlphonso-Release.entitlements` into
   `ios/LearnWithAlphonso/project.yml`'s `Release` config the same way
   `Debug` already references `LearnWithAlphonso-Debug.entitlements` — see
   that file's own header comment for exactly why this was deliberately
   left unwired until now.
3. Trigger a real TestFlight build and verify an actual device receives a
   nudge/leaderboard-overtake push end-to-end — **don't consider this done
   on config alone**, same discipline as §1.1's RevenueCat checklist.

Full design: `docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md`.

### 1.4 V4 #6 (iOS streak widget) — built, blocked on App Group + provisioning profile — DONE (verified 2026-10-09: ios-release.yml:44-46 installs the widget provisioning profile, and the widget target ships in builds 45-50, project.yml:420-426)
**Priority: medium.** Merged 2026-09-21 (same PR #59): a home-screen
streak widget (`LearnWithAlphonsoWidget` WidgetKit extension target),
sharing a read-only progress snapshot from the app via App Group
`group.com.obsidianmedia.learnwithalphonso` + shared `UserDefaults`
(`WidgetSharing.swift`/`WidgetProgressPublisher.swift`). Compiles and
passes `ios-app-build`/`ios-swift-tests` in CI (Simulator, unsigned) —
but that App Group has never been registered anywhere in the Apple
Developer portal, so a real signed Release archive (`ios-release.yml`)
will fail once this target is actually embedded, until:
1. Register the App Group `group.com.obsidianmedia.learnwithalphonso`
   under **Identifiers → App Groups** in the Apple Developer portal, and
   add it to both the main app's App ID and a new
   `com.obsidianmedia.learnwithalphonso.widget` App ID (the widget
   extension's bundle id, from `project.yml`).
2. Generate/update the Distribution provisioning profile(s) to include
   the widget extension's App ID with the App Group entitlement.
3. Only then does `ios-release.yml`'s manual-signing archive step have a
   chance of succeeding with this target embedded — **do not** attempt to
   "fix" a signing failure here by editing that workflow's signing logic
   itself (§1.1's fragile, carefully-fixed pipeline); the fix is always on
   the portal/provisioning side for this kind of gap.

---

## 1.5 V4 candidates — indexed, not yet scoped

Full detail in `docs/v4-kickoffs/00-INDEX.md` (added 2026-09-21). Ten
candidates were indexed same-day; status as of the 2026-09-21 batch below:

- ~~1. Spanish course~~ **DONE 2026-09-21** (see §0.5 above).
- ~~2. Real push notifications~~ **DONE 2026-09-22.** Built, configured,
  and deployed — see §1.3 above. Build 8 is the first TestFlight build
  that can actually receive one; a real on-device push hasn't been
  confirmed yet (needs a physical device, not something buildable from
  here).
- ~~3. Placement test / smarter onboarding~~ **DONE 2026-09-21.** Adaptive
  band-skip/stop quiz logic, new-signup default-route to `/placement`
  (soft nudge, not a gate), Spanish placement pool expanded 3→9
  questions/band. Merged PR #59.
- ~~4. Multi-turn conversation campaigns~~ **DONE 2026-09-21.** New
  `Campaign`/`CampaignScene` data shape, one real campaign ("A day in a
  new city") end-to-end on web + iOS. Only one campaign shipped, as
  proof of architecture — converting other `scenarios.ts` entries into
  campaigns is separate follow-up work, not started. Merged PR #59.
- ~~5. Content authoring tooling~~ **DONE 2026-09-21.** `scripts/pack-tool.ts`
  CLI (new/draft/validate/preview/apply) wrapping the bank-engine `Pack`
  format, with AI-assisted drafting (NVIDIA NIM) and a required
  human-review step before anything is spliced into a real course file.
  Merged PR #59.
- ~~6. iOS widget / Live Activity~~ **DONE 2026-09-22** (home-screen
  streak widget, not a Live Activity) — see §1.4 above. Signed and
  shipped in build 8 for the first time; hasn't been confirmed
  actually rendering live data on a real device/home screen yet.
- ~~7. Deeper gamification~~ **DONE 2026-09-22** (3 of 4 systems; themed
  content events explicitly deferred, see below). All merged to `main`
  in dependency order (#64 → #65 → #66 → #67), each rebased and
  re-verified (not just fast-forwarded) where a later merge conflicted
  with an earlier one's already-landed changes — see the four
  sub-bullets below for what needed a real rebase vs. what merged
  clean. Full spec: `docs/superpowers/specs/2026-09-22-deeper-
  gamification-design.md`. Plans: `docs/superpowers/plans/
  2026-09-22-weekly-xp-shared-helper.md`, `-teams.md`,
  `-season-ladder.md`, `-challenges.md`.
  - `weekly_xp` shared helper — merged PR #64 first (foundation; both
    Teams' and Season Ladder's migrations call it). Clean merge, no
    conflicts.
  - Challenges (fixed weekly solo goals + open/stranger duel
    matchmaking) — merged PR #65 second, no dependency on #64. Clean
    merge. Also shipped the first duel UI on either platform (web
    `/duels` + iOS `DuelsView`) since none existed despite the backend
    already supporting it — a scope decision made with explicit user
    go-ahead mid-implementation, not in the original plan.
  - Teams (persistent groups, invite code + public discovery +
    auto-assign, 7-day switch lock, weekly-XP leaderboard, lazy-
    resolved weekly win bonus) — merged PR #66 third. **Needed a
    rebase**: conflicted with #65's `src/integrations/supabase/
    types.ts` (both added RPC type entries in the same alphabetically-
    sorted block) — resolved by merging both sets of entries in order
    rather than picking one side. `routeTree.gen.ts` and `league.tsx`
    auto-merged cleanly.
  - Season ladder (Duolingo-style weekly promotion/demotion cohorts,
    distinct from the permanent `league_tier` badge; resolved lazily
    via a new `get-season-status` Edge Function, ranking/promotion
    math extracted as pure unit-tested TS rather than raw PL/pgSQL) —
    merged PR #67 last. **Needed a rebase** (the heaviest of the
    four): conflicted with #66's changes to `league.tsx` (both added a
    league-page entry-point link at the same spot — resolved by
    keeping both links side by side), `LeaderboardView.swift` (both
    added a `.topBarLeading` toolbar item — resolved with two adjacent
    `ToolbarItem`s, Teams' and Season's), `ProgressSyncClient.swift`
    (both independently widened the same properties/`requireSuccess`
    from `private`/`private static` to internal, with slightly
    different doc comments — resolved by keeping the already-landed
    Teams-branch comment), and `routeTree.gen.ts` (resolved by
    re-running `bun run build` after the rebase rather than trusting
    the text merge). Re-ran the full verification suite after
    rebasing, not just the changed files — caught nothing new, but
    that's the point of re-running it.
  - Themed content events — **explicitly deferred, not part of this
    build.** Its own content-authoring concern, not a gamification-
    mechanic one; the spec's own "Deferred" section has the minimal-
    vs-full scoping already thought through for whoever picks it up —
    don't design it from scratch again, read that section first.
- 8. Referral / virality mechanics [STILL OPEN (verified 2026-10-09: no referral code in src, ios or migrations)] — not started, still needs a real
  design pass.
- 9. Reverse-direction courses [STILL OPEN (2026-10-09)] — not started, its own bigger initiative
  per the index doc, needs market/pedagogy investigation first.
- 10. Full offline course download [STILL OPEN (2026-10-09: only podcast offline download exists, PodcastDownloadManager)] — not started, its own bigger
  initiative per the index doc, needs technical scoping first.
- 11. iOS design system — **DONE 2026-09-22, PR #68, merged to `main`,
  build 9 shipped to TestFlight.** Not one of the original V4 kickoff
  candidates — prompted directly by the user opening a TestFlight build
  and finding it had essentially no visual design (confirmed: zero
  design-system files anywhere in `ios/LearnWithAlphonso/Sources/`,
  `Assets.xcassets` had only the app icon, every screen was stock
  SwiftUI). Ports the web app's default Meadow theme (`src/styles.css`)
  to a real SwiftUI design system — `ios/LearnWithAlphonso/Sources/
  DesignSystem/` (color/spacing/radius tokens computed from the CSS's
  oklch values via a standard OKLab conversion, Fraunces/Geist bundled
  as their upstream **variable** font files and resolved to a specific
  weight/optical-size via CoreText's `kCTFontVariationAttribute` since
  neither ships static weight instances, the `.hard-shadow`
  pressed-button effect, reusable card/badge/progress-bar components) —
  applied to every screen in the app, including Season/Teams/Duels
  (item 7 above). Built in its own worktree/branch off `main`
  specifically to avoid colliding with item 7's concurrent work. See
  `ARCHITECTURE.md`'s "Native iOS app" section for the full breakdown
  and "Known rough edges" for a real `Section`/`header:` brace-nesting
  bug this caught (twice) via CI.
  **Real-device testing (2026-09-22) surfaced two problems** — see item
  12 immediately below for the fix, DONE the same day as a direct
  follow-up: (a) almost every screen was near-illegible (white text on
  a light background) because the device was in system Dark Mode and
  the fixed-light palette had no `.preferredColorScheme` override; (b)
  the sign-in screen had a real `Divider()`-stretch layout bug and
  looked sparse. This is exactly why "CI green" and "looks right on a
  real screen" are different claims — flagged as such at the time, and
  the flag caught something real.
- 12. iOS theme system (Studio Ink + Manuscript) + real-device bug
  fixes — **DONE 2026-09-22, PR #69, merged, build 10 shipped to
  TestFlight.** Direct
  follow-up to item 11 once the user actually looked at build 9 on
  their phone (see item 11's "Real-device testing" note above for what
  they found). Root-cause fix, not a patch: iOS now has a real *theme
  system* — `AlphonsoThemeID`/`AlphonsoPalette`/`AlphonsoThemeManager`
  (`@Observable` singleton) in `AlphonsoTheme.swift`, all three of the
  web's themes (Meadow/Studio Ink/Manuscript, matching `THEME_NAMES`
  exactly), colors computed from each theme's oklch values same as
  Meadow was, two more font families bundled per new theme (Instrument
  Serif/Sans for Studio Ink, Newsreader/Source Sans 3 for Manuscript —
  6 font families total now). `AlphonsoColor`'s members became computed
  properties reading the active theme instead of fixed constants, so
  every already-styled screen from item 11 needed zero changes.
  `RootView` applies `.preferredColorScheme(theme.colorScheme)`
  app-wide (wrapping `AuthView` too) — the actual fix for the Dark Mode
  bug: system-styled chrome now resolves against the *active theme's*
  light-or-dark-ness rather than the device's own setting, which is
  also what makes Studio Ink (a genuinely dark theme by design) render
  correctly, not a special case. New `SettingsView.swift` (the app had
  no settings screen at all before this) is the in-app theme picker,
  reachable from a gear button on the Learn tab — applies instantly,
  syncs to `profiles.theme` in the background via a new Kit extension
  (`ProgressSyncClient+Profile.swift`, plain PostgREST GET/PATCH under
  `profiles`' existing RLS, no RPC needed since that table never had
  its direct-write grant revoked the way the gamification tables did),
  round-tripping with the web app's own theme picker on the same
  account. Sign-in screen: fixed the `Divider()`-in-`HStack` stretch
  bug (a real, well-known SwiftUI gotcha — it wants to fill available
  cross-axis height unless constrained) and got a real visual pass
  (icon mark, a bordered card around the form) since it was flagged as
  needing more than a one-line fix. Every parchment-background input
  field app-wide now uses a new `alphonsoInputBackground()` modifier
  (parchment + a visible hairline border) — plain parchment-on-surface
  was too subtle to read as an input field on a real screen. See
  `ARCHITECTURE.md`'s "Native iOS app" and "Known rough edges" sections
  for the full breakdown. Real-device check on build 10 confirmed the
  fix worked, and surfaced items 13/14 below.
- 13. iOS liveliness pass — **DONE 2026-09-22, PR #70, merged, build 11
  shipped to TestFlight.** Direct follow-up once the user looked at
  build 10: (a) the course-language picker showed only a single
  truncated letter per segment ("E/F/E" — English and Español
  indistinguishable) since full names left no room in the toolbar
  alongside a trailing button; (b) "mature but doesn't feel alive... an
  empty piece of background with some written knowledge on it... no
  live element." Fixes: shared `CoursePicker` (`AlphonsoComponents.swift`)
  with flag + 2-letter code instead of full names, replacing the
  identical duplicated `Picker` in `LessonBrowserView` and
  `ReviewQueueView`; new `StatusHeaderView.swift` (streak/hearts/XP/
  league tier at the top of the Learn tab, continuously pulsing flame
  via new `PulsingGlow` modifier — the one element always quietly
  animating rather than only on tap — reads `SyncQueueStore`'s cached
  last-known progress, no new network call); `AlphonsoPrimaryButtonStyle`
  flat fill → gradient; lesson/leaderboard rows now use
  `.springEntrance` with a small index-based delay so they cascade in
  as they scroll into view (`List` is lazy, each row's own `onAppear`
  fires independently). See `ARCHITECTURE.md`'s "Native iOS app"
  section for the full breakdown.
- 14. Mascot visuals (Alphonso + Hector) — **DONE 2026-09-22, PR #71,
  merged, build 12 shipped to TestFlight.** User pointed out the app
  has two named personas
  (Alphonso, its own namesake/host; Hector, the Pro AI tutor) with zero
  visual presence anywhere — confirmed by search first, not assumed
  (`LESSON_ASSETS.md`'s own status banner says its image/character
  section was never built). User generated real character portraits for
  both (alpaca/llama characters — Hector in AR goggles in a grand
  library, Alphonso in a royal cape and sunglasses; Higgsfield was out
  of credits, so these were user-provided, not generated by this
  session) and shared them directly. Cropped both to tight
  face/shoulders avatars and compressed for bundle size (`Alphonso.png`
  1.1MB→~470KB, `Hector.png` 6.6MB→~750KB), added as `Assets.xcassets`
  imagesets. **Alphonso does wrong-answer help** in the Lesson Player
  and Review Queue — new `AlphonsoTipCard` (portrait + "Alphonso says" +
  the explanation) slides in from the trailing edge on a wrong answer,
  via a shared `ExplanationView` so every question-type call site across
  both screens shares one correct/incorrect decision point instead of
  three near-duplicates each. **Deliberately Alphonso, not Hector**, for
  this — Hector is a $9.99/mo persona; giving him away for free in the
  ordinary lesson flow would undercut the subscription. Hector instead
  gets real presence in his own paid screen (portrait on his sign-in
  step, a small avatar beside his chat bubbles). Alphonso also now
  greets the user on the app's own sign-in screen. See
  `ARCHITECTURE.md`'s "Native iOS app" section for the full breakdown.
  Real-device check on build 12 found the small circular-avatar card
  read as too timid — user sent a mockup wanting Alphonso bigger,
  speaking through a real speech bubble, and asked for exactly one
  version, not both. **DONE 2026-09-22, PR #72, merged to `main`**: new
  `SpeechBubbleShape` (a real `Shape`, not a plain box), portrait grew
  52pt circle → 88×112pt rounded rectangle, kept deliberately in-flow
  (same `VStack` as Check/Continue, never an overlay) specifically
  because the user's own mockup had Alphonso's cape covering the Check
  button. `AlphonsoTipCard`'s public API didn't change, so no call site
  needed touching. Real CI caught a genuine bug before merge:
  `SpeechBubbleShape` needed `InsettableShape` conformance (not just
  `Shape`) for `.strokeBorder` to compile — `swift -frontend -parse`
  doesn't catch protocol-conformance errors like this, only real
  `ios-app-build` CI does. **Still needs**: the same real-device
  confirmation loop as every prior iOS UI item.
- 15. Course picker still unreadable on a real device — **DONE
  2026-09-22, PR #73, merged to `main`.** Real device screenshot on
  build 12 showed item 13's flag+2-letter-code fix wasn't enough: the
  `.segmented` control itself is too narrow for a `.topBarLeading` slot
  competing with a large `navigationTitle`, so segments still clipped to
  unreadable slivers. Root-cause fix, not another label tweak: switched
  `.pickerStyle(.segmented)` → `.pickerStyle(.menu)` — a menu picker only
  ever renders one selection + a chevron, so it always has room
  regardless of screen size or toolbar contents. Both PR #72 and #73
  touched `AlphonsoComponents.swift`/`ARCHITECTURE.md`; merged back to
  back with no conflict (GitHub reconfirmed #73 as cleanly mergeable
  after #72 landed). **Still needs**: real-device confirmation, same as
  every prior iOS UI item — this makes three consecutive iOS UI PRs
  where CI-green and looks-right-on-device diverged at least once each
  (items 11, 13, 15), worth remembering next time a screen-facing iOS
  change feels done after CI passes alone.

## 2. V3 backlog — scoped, not yet built

Full detail in `docs/v3-kickoffs/` (00-INDEX.md + 4 docs). Summary:

### 2.1 Real push notifications — DONE IN CODE (2026-10-09: see 1.3; this entry predates the build, device delivery unconfirmed)
`docs/v3-kickoffs/01-real-push-notifications.md`. The most concretely
scoped item. Needs: an APNs Auth Key (Apple Developer Console → Keys),
a `device_tokens` table (RLS-scoped to `auth.uid()`), remote-notification
permission + device-token registration on launch (materially different
from the existing local-only `NotificationScheduler`), and a server-side
trigger (Supabase has no built-in cron for Edge Functions as of the
note that raised this — verify current capability before assuming
`pg_cron` + `SECURITY DEFINER` is the only path). Would upgrade two
features currently running weaker approximations:
- **Nudge-a-friend (iOS)**: currently a `nudges` table the recipient's
  app polls for on foreground — only surfaces once they *already*
  opened the app, which mostly defeats the point of a nudge.
- **Leaderboard "you've been overtaken"**: currently an in-app toast,
  same underlying limitation.

Build the push infrastructure once, serve both.

### 2.2 Friends v2 remainder + leaderboard course-awareness
`docs/v3-kickoffs/02-friends-v2-remainder-and-leaderboard-course-awareness.md`.
**Update 2026-09-22**: both built, PR #62, `ios-app-build`/`ios-swift-tests`
CI green. **Corrected 2026-09-24: PR #62 is MERGED** — this entry still
said "not yet merged (migration needs explicit go-ahead first)" long
after it had landed. Verified via `gh pr view 62`. Treat the two
sub-items below as shipped.
- ~~**Remove a friend**~~ **DONE.** `remove_friend` RPC (sibling of
  `accept_friend_invite`, atomic both-directions delete), wired into web
  (inline confirm) and iOS (swipe-to-remove + confirmation dialog).
  **Deliberately scoped out**: blocking (nothing asked for it
  specifically) and username search (real trust-model design question —
  does a search-initiated add need a consent/request step, unlike
  today's link-based instant-mutual-friend model? — deserves its own
  design pass, not a bolt-on).
- ~~**`get_leaderboard` course-unaware ranking**~~ **DONE, and turned out
  to be a bigger bug than described.** Verified live: `user_progress.xp`
  isn't just a stale legacy column — it's been **completely frozen since
  2026-09-08** (the multi-course migration). Neither `complete-lesson`
  (Edge Function) nor its web duplicate (`src/lib/sync.functions.ts`)
  has written `xp` to `user_progress` since; both write only to
  `language_progress`. Every all-time leaderboard rank for every user
  has been wrong since that date. Fixed by summing `language_progress.xp`
  across a user's courses instead — kept as one unified ranking, not
  per-course-selectable (zero client changes needed either way; a real
  per-course leaderboard is a legitimate bigger follow-up needing new UI
  + course-selection state, which iOS has no shared store for today).
  ~~**Related, smaller finding not fixed**: `account.functions.ts`'s GDPR
  export also reads `user_progress.xp` directly, so an exported "your
  data" file still shows the same frozen number — worth a follow-up.~~
  **DONE 2026-09-27, #191.** Widened to all five frozen columns once
  checked properly (`cefr_level`, `league_tier`,
  `placement_level/score/taken_at` are duplicated on `language_progress`
  too, same as `xp`) — see §0.1-g.

### 2.3 Web/iOS social parity — decision needed, not investigation — STILL OPEN (2026-10-09: an owner decision, not investigation)
`docs/v3-kickoffs/03-web-social-parity-decision.md`. Leaderboards'
overtake/recap and friends' activity-feed/nudge are iOS-only. **This
needs your call**: deliberate platform-exclusive strategy, or a gap to
close on web too? Nobody has decided yet.

### 2.4 Hector option B reinvestigation (spike) — OBSOLETE (2026-10-09: Hector no longer uses Cloud Voice at all, it runs on this backend since PR #189, see 0.1-e, so there is nothing to compare Option B against)
`docs/v3-kickoffs/04-hector-option-b-reinvestigation.md`. V2's
weakness-detection doc chose Option C (this repo's own lightweight
NVIDIA NIM detection) over Option B (reusing AlphonsoEcosystem's real
Cloud Voice weakness pipeline) for time reasons, not because C was
judged better. Worth a real look only if Option C's detection quality
becomes an actual complaint — don't do this speculatively.

---

## 3. Carried from V1/V2 — still open

From `DEFERRED-WORDS.md` (full item-by-item history there; only the
still-open ones are repeated here):

### Content & courses
- ~~**SM-2 audit**~~ **AUDITED 2026-09-22, fix PR #74, merged to `main`.**
  Read-only audit found two real issues in `src/lib/srs.ts`: (1) the
  post-lapse interval formula's third branch was dead code —
  `RETIRE_AFTER_REPETITIONS=4` caps live repetitions at 3, so
  `floor(repetitions * 0.5)` can only ever be 0 or 1, meaning every
  lapse collapsed to the same fixed 1-or-3-day interval regardless of
  how much progress the item had earned. Fixed: interval now scales
  proportionally off the item's real prior interval. (2) **Not fixed,
  flagged for you**: items retire permanently after only 4 correct
  answers (~12 days total), unlike Anki/canonical SM-2's indefinite
  ever-growing-interval model — may be intentional (finite queue,
  incidental re-exposure via later lessons) but is a bigger design call
  than a tuning constant, raised rather than changed unilaterally. No
  telemetry exists anywhere to check lapse/retention rates against real
  usage — that's a real gap if this gets revisited again.
- **Harden the 3 existing courses (started 2026-09-22)** — reframed
  from the old "third+ language module" item once English/French/Spanish
  all reached content parity. Scope explicitly agreed with you: an
  automated *consistency* scan (structural/mechanical bugs), not a full
  native-speaker linguistic review (~1500 lessons total across 3
  languages isn't something to rubber-stamp in one sitting).
  - ~~**Automated content-consistency scan**~~ **DONE 2026-09-22, PR
    #75, merged to `main`.** New `src/data/curriculum-consistency.test.ts`,
    CI-enforced going forward, checks all 3 courses for: duplicate
    unit/lesson/question ids, out-of-range mc answer indices, duplicate
    mc choice text, empty prompt/choice/explanation strings, orphaned
    `imageKey` references into `VOCAB_IMAGES`, fill-question answers
    missing from their own word bank, reorder-question answers that
    don't reconstruct from their token pool, and question/lesson ids
    that would fail the server-side item-key regex
    (`review.functions.ts`'s `/^[a-z0-9]+:[a-z0-9]+$/`).
  - **Found and fixed on the first run**: 5 real MC questions across
    all 3 languages with duplicate-looking choices (e.g. "may"/"May",
    "est"/"Est") — traced to a genuine generator bug, not bad content:
    `pickDistractors` (duplicated in both `lesson-bank.ts` and
    `bank-engine.ts` — see the tech-debt item below) deduped candidates
    case-*sensitively*, so a cloze pack reusing the same word as the
    correct answer for two differently-capitalized lines could surface
    both casings as separate choices. One logic fix in both duplicated
    copies, not 5 content edits, since content regenerates from packs
    on every load. All 3 courses pass clean now.
  - **Deliberately not done**: a real native-speaker review pass on
    French (flagged since the module shipped, 500 lessons) and Spanish
    (508 lessons) content for grammar/naturalness/idiom correctness —
    the scan above is mechanical, it does not and cannot judge
    linguistic quality. Still needs an actual human. English wasn't
    flagged the same way (original/base course).
- ~~**True generative sentence-template content**~~ **PILOT DONE
  2026-09-22, PR #76, merged to `main` — English-only, real follow-on
  work remains.** New `generate` subcommand on `scripts/pack-tool.ts`:
  hand-authored grammar templates + an LLM-proposed, compiler-validated
  vocab dataset (`src/data/generative/`, `src/lib/generative-vocab*.ts`)
  — an LLM proposes vocabulary, `compromise` (a real morphological
  library, queried via a verified derivation that works around two
  confirmed bugs in its own subject-agreement detection) is the sole
  authority that conjugates and compiles. Output feeds the *existing*,
  unmodified `apply --confirm` pipeline. Full detail:
  `ARCHITECTURE.md`'s "Generative content pipeline" section.

  Built via brainstorming → spec → self-critique → implementation plan
  → 11-task TDD execution → a fresh whole-branch review (dispatched on
  a separate model, not self-reviewed) → a fix pass. The review found
  the *mechanism* was solid but the *generated artifact* wasn't: 3
  Critical findings (a sampler that silently omitted 3rd-person
  subjects from generated packs — 3 of 5 measured packs never tested
  the agreement rule the pilot exists to prove; the same prompt could
  have two different "correct" answers; missing capitalization/articles
  made output ungrammatical) plus 6 Important findings, all fixed and
  verified. One suggested fix (context-based POS disambiguation) was
  investigated and *declined* after verification showed it would be a
  regression — real diligence, not rubber-stamped review feedback.

  **Real, still-open follow-on work — this is a pilot, not "the backlog
  item is done"**: French/Spanish (deliberately out of scope — this
  pilot doesn't reduce the actual motivating pain, the French/Spanish
  native-speaker review burden below, until the same architecture
  extends to them); cross-verb MC-distractor pollution is reduced, not
  eliminated (would need semantic verb/object modeling or a shared
  `bank-engine.ts` change); a new LLM-proposed verb beyond the 7
  spike-verified ones is never re-checked against a known-correct
  conjugation table before compiling; the POS cross-check still
  false-rejects some genuinely ambiguous common words (book/cook-class,
  no manual-add path exists yet); the live NVIDIA vocab-proposal call
  took several minutes in this session's sandbox (external network
  latency, not a code defect); the full 90-file test suite hung twice
  in the same sandbox under accumulated process load — a scoped
  118-test run was used as substitute evidence, a human should re-run
  the full suite once before trusting this as fully verified.
- **Native-speaker review pass on the French content bank** [STILL OPEN, handed to the content sessions (2026-10-09)] — flagged
  since the French module shipped, still not done. Now more relevant:
  French is 500 lessons as of 2026-09-21 (was 125), so there's more
  surface area to review.
- **Third+ language module** — explicitly paused until French is fully
  hardened (this backlog's other French items) and until Android/iOS
  parity questions above are settled. If picked up, Spanish is the
  obvious next course (see V4 brainstorming, section 5).
- **No image quality-scoring automation** — every vocab-image batch
  (manual or scripted) still needs a human/agent spot-check; Pexels
  search relevance isn't perfect.

### Review / spaced repetition
- ~~**SM-2 algorithm hasn't been audited/tuned**~~ **See §3 "Content &
  courses" above (SM-2 audit, PR #74, merged) — duplicate entry,
  superseded there, kept struck-through rather than deleted per this
  doc's own history-preservation convention.**
- **Concurrent-device review grading** [STILL OPEN (2026-10-09, unchanged)] and **offline streak-continuity**
  (iOS offline-first) — two known, deliberately-unsolved edge cases.
  Full detail in `ARCHITECTURE.md`'s "Known rough edges". Not urgent
  (single-device usage is the overwhelming common case); revisit only
  if real usage surfaces either as a frequent complaint.

### Platform
- **Android** — intentionally not started. [OBSOLETE (2026-10-09: stale, the Android app is on main under android/LearnWithAlphonso with tests and a release workflow; remaining work is owner-gated, see android/LearnWithAlphonso/OWNER-SETUP.md)] `docs/v2-kickoffs/
  08-android-groundwork.md` scopes why it's its own multi-week
  initiative, not a batch item — matching iOS's full V1+V2 feature set
  (auth, lesson player, review queue, hearts/XP/streaks, two AI
  conversation modes, RevenueCat, code signing, TestFlight) is a
  comparable amount of work to what iOS itself took. The V3 index's
  recommendation was to wait until iOS/web feel more "settled" —
  section 1.1 (RevenueCat/launch) is arguably the last thing standing
  between "settled" and "still mid-launch."

### Speculative / low-priority
- **NVIDIA Riva TTS/STT** [STILL OPEN, speculative (2026-10-09)] — researched once (Phase 1), rejected at the
  time (gRPC-only, no mature Node client). The app has since moved to
  Deepgram for TTS/STT (PR #19), so the original comparison target has
  moved. Worth a fresh look only if Deepgram becomes a real cost/quality
  problem — not investigate-for-its-own-sake.

---

## 4. Known rough edges / tech debt (tracked in `ARCHITECTURE.md`, indexed here for visibility)

Full detail lives in `ARCHITECTURE.md`'s "Known rough edges" section
(that file is committed, not gitignored) — this is just a pointer so
these don't get lost in a file nobody re-reads:

- `src/integrations/supabase/{client.ts,client.server.ts,
  auth-middleware.ts}` carry "auto-generated, do not edit" banners and
  duplicate a fetch helper 3 ways — consolidating risks a future
  regeneration reverting the fix.
- ~~`scripts/export-ios-content.ts` is still a **manual** step after any
  change to `curriculum.ts`/`curriculum-fr.ts`/`scenarios.ts`/
  `achievements.ts`/`vocab-images.ts` — no CI enforcement, no loud
  failure if forgotten (already bit once: iOS's bundled achievement
  count silently stayed stale).~~ **CI-ENFORCED, checked 2026-09-27** —
  `ci.yml`'s `lint-and-typecheck` job re-runs the export and diffs the
  result, failing loudly (`"Bundled iOS content is stale"`) if forgotten.
  This entry was stale; the guard already exists. `seed-curriculum-db.ts`
  at least has a CI step now (no-ops without
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` secrets).
- ~~`USER_ID_TABLES` in `account.functions.ts` (GDPR export/delete) needs
  manual updating whenever a new user-scoped table is added — nothing
  enforces it stays in sync; had three real silent bugs once already.~~
  **DONE 2026-09-24, PR #85, merged to `main`.** It had drifted a fourth time: 9 user-scoped tables
  from the gamification/push batches were never added, so `exportMyData`
  had been returning incomplete GDPR exports since those landed.
  *Deletion was fine* — all 9 cascade from `auth.users` — so this was a
  portability bug only. Now split into `USER_ID_EXPORT_TABLES` +
  `OTHER_OWNED_EXPORT_TABLES` (`nudges`/`duels`, keyed by
  `sender_id`/`challenger_id`, invisible to a `user_id` scan) for export
  and `USER_DELETE_TABLES` (only what `authenticated` can actually
  DELETE) for erasure, with a test in `account.functions.test.ts` that
  parses `supabase/migrations/` and fails the build on drift. See
  `ARCHITECTURE.md`'s "Known rough edges" for the full write-up.
- ~~Test coverage thin spots~~ **DONE 2026-09-24.** Overall is now
  92.60%/80.83%/89.55%/93.85% (was 90.55/79.24/89.02/91.56 on
  2026-09-20). Also closed a separate gap found while measuring:
  `challenges`/`season`/`teams.functions.ts` were the only
  `*.functions.ts` modules with no test file at all, all three from the
  gamification batch (#65–67). Writing those tests surfaced a real (if
  latent) bug in `teams.functions.ts` — see §0.8. Both named thin spots are closed: `__root.tsx` 18.36% ->
  **97.95%** statements / 100% lines, `HeartsModal.tsx` 68.62% ->
  **96.07%** / 100% lines. The untested parts turned out to be real
  logic, not boilerplate — `AuthSync`'s session and auth-event handling
  plus the pre-hydration theme script, and the focus trap plus the
  refill-due transition. Both new test groups were mutation-tested
  (disabling the focus trap fails two tests; flipping the theme script's
  default fails another). The third item, `analyze-weaknesses.ts` at
  "~8%", was simply stale — it is at 91.17%, and so are its siblings.
- `bun run dev` still doesn't boot in this Windows sandbox — `bun run
  build` works; nothing UI-level has been visually verified locally,
  only via CI/deployed preview.
- ~~**`bun run lint` reports ~717 errors that are NOT real**~~ **DONE
  2026-09-24, PR #85, merged to `main`**, via fix (b) below. Re-measured first: it had grown to
  **3,632** problems, not ~717 — there are 15 nested worktrees now, not
  3. Of those, 3,630 came from `.claude/worktrees/` (other branches'
  code) and exactly **2** were real in the live tree. Fixed by adding
  `.claude/worktrees/**` to `eslint.config.js`'s `ignores`, which is
  both the safer option and the durable one — no worktree was deleted,
  and a future stale one can't reintroduce the noise. The two real
  findings (a `prettier/prettier` break in
  `scripts/upload-review-screenshot.ts`, and the known harmless
  `react-refresh/only-export-components` warning in `CookieConsent.tsx`)
  were deliberately left alone at your call. Original note kept below
  for history:
  > All of them live under `.claude/worktrees/{test-coverage,
  > theme-manuscript,ui-ux-redesign}`, three stale git worktrees
  > (`git worktree list` marks them `prunable`) physically nested inside
  > this repo's own directory tree, so `eslint .` (run from repo root)
  > walks into them and lints their old, differently-formatted code.
  > Two real fixes, either is fine: (a) a human runs `git worktree list`
  > to inspect each one, then `git worktree remove <path>` once confirmed
  > safe, or (b) add `.claude/worktrees` to the ESLint `ignores` config.
  ~~**(a) is still open and still worth doing** — 15 nested worktrees is a
  lot of dead weight, and several are `prunable`; the ignore just means
  lint no longer depends on someone getting around to it.~~ **(a) DONE
  2026-09-27.** Had grown to 50 nested worktrees (+1 outside
  `.claude/worktrees/`, a broken pre-rename leftover from when this repo
  was still `english-buddy-app-33`) by the time it was actually done.
  Every branch verified against `main` first — squash-merge content
  diff, or commit-subject correlation against the merged PR it
  belonged to — before removal; zero content lost (confirmed, not
  assumed). Six directories hit Windows' `MAX_PATH` limit on delete and
  needed `Remove-Item` with a `\\?\` long-path prefix instead of `git
  worktree remove`. Local branches (134) and the now-redundant remote
  branches (39, all pre-verified merged) were deleted too. Repo is back
  to a single `main` worktree with no dangling branches anywhere,
  local or remote. The `.claude/worktrees/**` eslint ignore stays —
  cheap insurance against the next one.
- **`src/integrations/supabase/types.ts` is stale** [DONE (verified 2026-10-09): see 0.6.1] — found 2026-09-23
  while fixing the GDPR export. Seven tables from the gamification/push
  batches (`challenge_completions`, `device_tokens`, `duel_queue`,
  `season_cohort_members`, `season_placements`, `team_members`, `teams`)
  were never regenerated into it, so a typed `supabase.from()` call
  against any of them doesn't compile. Worked around locally with a
  widened `from` helper in `account.functions.ts`; the real fix is
  regenerating against the live project, which needs the Supabase CLI +
  credentials this sandbox doesn't have. **Needs a human with project
  access.** Until then the generated types under-describe the schema —
  don't trust them as a complete picture of what exists.
- ~~Cloud Voice's separate Supabase project (`ywavjlmjbxuslbxactsx`,
  Hector's own account system) has auto-paused once already on
  free-tier inactivity — check its status before assuming a Hector
  sign-in failure is a code bug.~~ **MOOT 2026-09-27** — Hector was fully
  decoupled from Cloud Voice/Alphonso Companion (§0.1-e, #189). There is
  no separate account system left to auto-pause; Hector runs entirely on
  this app's own backend now.
- **A new Edge Function directory needs its own `deno.json` import
  map, and nothing catches a missing one until the real deploy** —
  found 2026-09-22 shipping `get-season-status`. `deno check` and
  `deno test` both pass without it (they resolve `npm:`/bare
  specifiers differently), but `supabase functions deploy` (the
  Supabase CLI's own bundler, used by `ci.yml`'s `deploy-supabase`
  job) fails with `Relative import path "@supabase/supabase-js" not
  prefixed with / or ./ or ../`. Fixed by adding a `deno.json` with
  `{"imports": {"@supabase/supabase-js": "npm:@supabase/supabase-js@2"}}`,
  matching every sibling function directory
  (`complete-lesson`/`send-push`/etc.) — copy one of theirs when
  creating a new Edge Function, don't assume local verification caught
  everything a real deploy will.

---

## 5. Already fixed this session (2026-09-21) — kept for history

- **iOS OTP email bug**: Supabase's built-in mailer refused delivery to
  non-team-member addresses; iOS's OTP flow also shared a template that
  only showed a magic link, never the 6-digit code. Fixed via Resend as
  custom SMTP + a corrected email template. Confirmed working via a
  real end-to-end test (user received a real 6-digit code).

  **HALF FIXED — corrected 2026-09-25, see §0.0.** The SMTP half was
  complete. The template half patched only
  `mailer_templates_magic_link_content`, and Supabase sends that
  template **only to an address that already has a confirmed user**. A
  first-time address gets the **Confirm signup** template from the
  identical `/auth/v1/otp` call, and that one still shipped with a link
  and no `{{ .Token }}`. So new-user signup stayed broken for four days
  while this entry read "confirmed working".

  **The verification is the lesson, not the bug.** That end-to-end test
  was real — real device, real inbox, real code. It was run with an
  account that already existed, which is the only kind of account the
  person running it had. It proved the working path worked and was
  structurally incapable of touching the broken one. Found only by
  signing up as a genuinely new user on a clean simulator, which is a
  thing nobody holding a phone with the app installed can do.
- **iOS had no Google OAuth**: scope gap (iOS's design doc wrongly
  assumed OTP was ported from web's pattern; web actually uses
  password + Google OAuth, never OTP). Fixed by reusing the *same*
  Google OAuth client already configured in Supabase for web — no new
  Google Cloud credentials, PKCE handshake via
  `ASWebAuthenticationSession`.
- **NVIDIA chat model end-of-life**: `meta/llama-3.1-70b-instruct` hit
  a `410 Gone` on 2026-08-26, hardcoded identically in four files
  (chat, weakness detection, generate-practice), silently breaking
  conversation chat on both web and iOS. Centralized into
  `src/lib/nvidia-chat-model.server.ts`, updated to a currently-live
  model.
- **Vercel's GitHub integration** — lost across an org transfer,
  reconnected and fully confirmed working (real webhook-triggered
  deploy on plain `git push`, no manual trigger).
- **Netlify DNS records for Resend** — DKIM/SPF/DMARC/MX added for
  `hello.alphonsoecosystem.app`, domain verified.
- **Email send rate limit** — raised from Supabase's default 2/hour to
  30/hour now that custom SMTP (Resend) is active; the low default was
  a leftover built-in-mailer abuse guard that no longer made sense.

---

## 6. Sources

- `DEFERRED-WORDS.md` (gitignored, still exists — item-by-item history)
- `docs/v2-kickoffs/00-INDEX.md` + `08-android-groundwork.md` +
  `09-revenuecat-and-app-store-launch.md` (gitignored)
- `docs/v3-kickoffs/00-INDEX.md` + `01`–`04` (gitignored)
- `docs/v4-kickoffs/00-INDEX.md` (gitignored)
- `ARCHITECTURE.md`'s "Known rough edges" section (committed)
- `AGENTS.md`'s Testing section + RevenueCat note (committed)
- This session's own work (auth fixes, NVIDIA fix, marketing prompt)

## 0.0-ai DECIDED 2026-10-07: minimum age 13 (App Store 13+); build Phase 3b (stranger matching) with guardrails — PARTLY DONE (verified 2026-10-09: matching with the 13+ confirmation and the kill switch is built, #242-#245; setting the 13+ rating in App Store Connect and the optional App Review consultation are OWNER-ONLY and not verifiable from code)

Owner: "age rating can 13+ ... make sure the feature will come out complete". Research (2026-10-07): Apple guideline 1.2 (Feb 2026) says apps used PRIMARILY for "Chatroulette-style experiences, random or anonymous chat" do not belong on the App Store; Apple has not defined the terms (forum thread 815409 points to an App Review consultation). Messaging/UGC do not raise the age rating by themselves (2025 tiers 13+/16+/18+). Guardrails chosen so matching reads as "study with a learner at your level", not random chat: opt-in with an explanation, same course and CEFR within one step, never re-match a past buddy, preset messages only, display name + progress only, block and report on the buddy card, and a server-side switch to turn matching off without a release. OWNER: set the 13+ rating in App Store Connect; optional App Review consultation before the iOS build that includes matching.

## 0.0-aj Flaky Android unit test: LearnViewModelTest (found 2026-10-07) — DONE in PRs #307/#310 (2026-10-17; stale 2026-10-09 status below)

Historical incident: `LearnViewModelTest > challenges load and a claim posts this week's monday then refreshes progress` failed once in CI with `IllegalStateException at TestMainDispatcher.kt:72` on PR #240. The test was stabilized in #307/#310; this note is retained as background, not as a current failure or proposed fix.

## 0.0-ak GDPR export reads are capped by PostgREST max-rows (found 2026-10-07, review of #242) — DONE in this branch (2026-10-19)

`src/lib/account.functions.ts` now pages export reads with `.range()` and guards against data changing across pages; `src/lib/account.functions.test.ts` covers pagination and failure/incomplete-export behavior. The 2026-10-09 “no paging” note below is stale. Remaining verification is a signed-in export against production data and confirmation that every table is readable under the caller's RLS policies.

Historical finding: the original unpaged reads could silently truncate at PostgREST's row limit. The pagination and regression coverage are now implemented in this branch; see the dated resolution note above. Production signed-in behavior remains a separate verification gate.
