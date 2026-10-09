# Learning goal planner, part 3 (Android) Implementation Plan

> Status (2026-10-09): implemented (#226); merged code, not released to Google Play.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Android Learn tab shows the learner's goal card and lets them set, change and remove it, rendering the plan the server already computes (same numbers and wording as web and iOS).

**Architecture:** No plan maths on the device. In `:core` (pure JVM, tested on this machine with Gradle): `ApiHttp` gains GET/PUT/DELETE; `LearningGoalClient` calls `/api/learning-goal` and `LearningGoalDecoding` reads the shared contract (`learning-goal.fixtures.json`, copied into core test resources and pinned byte-for-byte by the web test); `GoalCopy` holds the wording; `GoalCache` keeps the last plan per user and course for being offline only. The card's whole state machine, including the stale-request guard that the iOS review found untestable in SwiftUI, lives in a pure `GoalCardModel` in `:core` so it IS unit-tested. `:app` has a thin ViewModel, a Compose card and a setup dialog.

**Tech Stack:** Kotlin, ktor client (MockEngine tests), kotlinx.serialization.json, coroutines-test, JUnit 5, Jetpack Compose / Material3 in `:app`, Vitest for the one web-side pin.

**Spec:** `docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md`. Parts 1 (web) and 2 (iOS) are merged (#223, #225). This is rollout step 3. Android code can merge, but a store release stays owner-gated.

## Global Constraints

- The device never computes the plan. Unknown future `status` or `realism` strings decode to `UNKNOWN`; a required field missing or mistyped is `LearningGoalError.Unavailable`.
- `goal.createdAt` is a plain string (the server sends ISO-8601 with milliseconds and `Z`).
- Days are UTC. Dates display as `10 Nov 2026` from a fixed English month table (same as web and iOS), never the device locale.
- Wording is the web card's and iOS `GoalCopy`'s, word for word; change all three together.
- A coroutine cancellation must never be mapped to an error or to "offline": `CancellationException` is rethrown.
- Only `java.io.IOException` means offline. Everything else that throws is `Unavailable`.
- Free and Pro both get the card. No AI call, no quota. No build is cut and nothing is released to Play.
- File writes in this environment drop backslashes (Kotlin string templates use `$`, which is safe; avoid `\n`/`\u` escapes or check them after writing).
- Gradle needs `ANDROID_HOME`, `GRADLE_USER_HOME` (both under `<playground>`) and `JAVA_HOME` (`C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`); run `.\gradlew.bat` from `android\LearnWithAlphonso`; long builds in the background. A cold build can take 20 minutes.

## Review Focus

- A stale answer (a load, save or remove that finishes after the course changed or a newer request started) must never overwrite the card; this is unit-tested in `GoalCardModel`, not only reasoned about.
- `plan: null` with a goal present renders "pick a new target"; a failed remove is an inline error that leaves the goal editable and is never "offline".
- The offline cache is per user, written only with goal AND plan, read only for an `IOException` (never for 401 or 5xx), and ignored for a signed-out user.
- A preview request writes nothing; Save is possible only after a preview for the CURRENT selection arrived.
- Cancellation (a screen leaving) is never shown as an error.

## File Structure

- Modify `core/.../net/ApiClients.kt` (`ApiHttp`: `get`, `put`, `delete`), test `ApiHttpTest.kt` (new)
- Create `core/.../goal/LearningGoal.kt`, `GoalCopy.kt`, `GoalCache.kt`, `GoalCardModel.kt`; `core/.../net/LearningGoalClient.kt`
- Create tests `LearningGoalTest.kt`, `LearningGoalClientTest.kt`, `GoalCopyTest.kt`, `GoalCacheTest.kt`, `GoalCardModelTest.kt` and `core/src/test/resources/learning-goal.fixtures.json`
- Modify `src/lib/learning-goal-ios-fixtures.test.ts` (also pins the Android copy)
- Create `app/.../ui/learn/GoalCardViewModel.kt`, `GoalCard.kt`, `app/.../data/GoalPrefsStore.kt`; modify `AppContainer.kt`, `LearnScreen.kt`
- Modify README, ARCHITECTURE, AGENTS, CHANGELOG, `android/LearnWithAlphonso/DEVICE-CHECKLIST.md`, local BACKLOG

---

### Task 1: ApiHttp GET, PUT and DELETE (core)

**Files:** Modify `ApiClients.kt`; create `core/src/test/.../net/ApiHttpTest.kt`.

**Interfaces:** Produces `suspend fun get(path: String, query: Map<String, String> = emptyMap()): HttpResponse`, `put(path: String, body: JsonObject): HttpResponse`, `delete(path: String, query: Map<String, String> = emptyMap()): HttpResponse`, all with the existing bearer header and one refresh-and-retry on 401. `post` and `postMultipart` behaviour is unchanged.

- [ ] **Step 1: Write failing tests** with `MockEngine`: `get` sends `GET` to `/api/x?course=en&targetLevel=B1` (query encoded, order preserved) with the bearer token and no body; `put` sends `PUT` with the JSON body and `Content-Type: application/json`; `delete` sends `DELETE` with the query; a 401 then 200 retries once with the refreshed token for each verb; a refreshed token still rejected returns that second 401 with exactly two requests; with no refresh configured a 401 returns after one request; existing `post` tests still pass.
- [ ] **Step 2:** `:core:test --tests "*ApiHttpTest"` fails to compile. **Step 3:** implement by generalising the private `send` over `HttpMethod` (use `client.request(url) { method = ...; url { query.forEach { parameters.append(k, v) } } }`). **Step 4:** run the whole `:core:test`. **Step 5:** mutation-check (drop the bearer header on get, send a body on get/delete, drop the retry, wrong verb). **Step 6:** commit.

---

### Task 2: Models and decoding (core)

**Files:** Create `goal/LearningGoal.kt`, `LearningGoalTest.kt`, `core/src/test/resources/learning-goal.fixtures.json` (copy of `src/lib/learning-goal.fixtures.json`), modify `src/lib/learning-goal-ios-fixtures.test.ts`.

**Interfaces:** Produces `enum GoalStatus { DONE, EXPIRED, JUST_STARTED, AHEAD, ON_TRACK, BEHIND, UNKNOWN }`, `enum GoalRealism { OK, AMBITIOUS, UNREALISTIC, UNKNOWN }`, `data class GoalPlan(currentLevel, targetLevel, targetDate: String, lessonsInScope, lessonsRemaining, lessonsDoneLast7Days, requiredPerWeek: Int, status, realism, suggestedDate: String?, asOf: String)`, `data class StoredGoal(course, targetLevel, targetDate, createdAt: String)`, `data class LearningGoalState(goal: StoredGoal?, plan: GoalPlan?)`, `sealed class LearningGoalError : Exception { class Invalid(detail: String?); object NotSignedIn; object Unavailable; object Offline }` with `userMessage`, and `LearningGoalDecoding.state(json: String)` / `plan(fromPreview: String)`.

- [ ] **Step 1: The web pin first.** Extend `learning-goal-ios-fixtures.test.ts` with a second `it` comparing `android/LearnWithAlphonso/core/src/test/resources/learning-goal.fixtures.json` to the web file; run it, expect FAIL (missing); copy the file; expect PASS; mutate one character of the copy, expect FAIL, restore.
- [ ] **Step 2: Write failing tests** reading the fixtures from the classpath: every `plans` sample and every `envelopes` sample decodes (`stored_plan_null` gives a goal and null plan; `none` gives both null; `preview` through `plan(fromPreview)`); every field of a plan with distinct values lands in the right property (swap-proof, as the iOS review required); `just_started` and `on_track` raw strings map to `JUST_STARTED` and `ON_TRACK`; unknown status and realism strings map to `UNKNOWN`; a missing or mistyped required field, a plan that is not an object, a non-JSON body and a goal missing `targetDate` are `Unavailable`; a `createdAt` with microseconds and `+00:00` still decodes; `userMessage` texts equal the web card's ("That goal can't be saved. Check the level and date." / the server detail, "Sign in again to use goals.", "Couldn't load your goal. Try again.", "You're offline. Showing your last saved plan.").
- [ ] **Step 3-5:** compile-fail, implement with `ContentJson.json.parseToJsonElement` and explicit field reads (`intOrNull`, `contentOrNull`; a JSON number written as `12.0` is accepted only if integral), pass, mutation-check each rule. **Step 6:** commit.

---

### Task 3: The client (core)

**Files:** Create `net/LearningGoalClient.kt`, `LearningGoalClientTest.kt`.

**Interfaces:** Consumes Task 1 and 2. Produces `class LearningGoalClient(private val http: ApiHttp)` with `suspend fun fetch(course: String): LearningGoalState`, `preview(course, targetLevel, targetDate): GoalPlan`, `save(course, targetLevel, targetDate): LearningGoalState`, `remove(course)`.

- [ ] **Step 1: Write failing tests** (MockEngine): `fetch` is `GET /api/learning-goal?course=en`; `preview` is `GET` with `course`, `targetLevel`, `targetDate` and no body; `save` is `PUT` with exactly `{"course","targetLevel","targetDate"}`; `remove` is `DELETE ?course=es`; 400 throws `Invalid(detail)` with the body's `error` string, or `Invalid(null)` when unreadable; 401 and 403 throw `NotSignedIn`; 500 and 502 throw `Unavailable`; an `IOException` thrown by the engine throws `Offline`; any other exception throws `Unavailable`; a `CancellationException` is rethrown unchanged (not `Offline`); a 200 with a wrong-shaped body is `Unavailable`.
- [ ] **Step 2-5:** compile-fail, implement (read the response text, map status, decode), pass, mutation-check (drop the cancellation rethrow, map every exception to Offline, treat 400 as Unavailable, GET with a body). **Step 6:** commit.

---

### Task 4: Wording and cache (core)

**Files:** Create `goal/GoalCopy.kt`, `goal/GoalCache.kt`, `GoalCopyTest.kt`, `GoalCacheTest.kt`.

**Interfaces:** Produces `object GoalCopy` with `formatDate`, `headline`, `progress`, `statusLine`, `weeklyLine`, `previewLines`, `suggestionLine`, `realismLine`, `loadFailureMessage(error, hadCachedPlan)`, `actionFailureMessage(error)`, `estimateNote`, `monthsFromToday(months, now: Instant)`, `tomorrow(now)`, and UTC day helpers `dayOf(millis)`/`millisOfDay(day)` (noon UTC; null for a non-date); the strings are exactly the iOS `GoalCopy` / web `GoalCard.tsx` strings. `interface GoalCacheStore { fun get(key: String): String?; fun put(key: String, value: String); fun remove(key: String) }` and `class GoalCache(store)` with `read(userId, course)`, `write(state, userId, course)`, `clear(...)`, `key(userId, course)`.

- [ ] **Step 1: Write failing tests** mirroring the iOS `GoalCopyTests` and `GoalCacheTests` case by case: `formatDate("2026-11-10") == "10 Nov 2026"`, September is `Sep`, impossible dates (`2026-02-30`, month 13) come back unchanged; headline, progress, every status line, weekly line hidden for DONE and EXPIRED, suggestion shown whenever sent, realism lines never repeat the suggestion, the load wording says "Connect to load your goal" when offline with no cache, the action wording says "Try again when you're connected", `monthsFromToday` clamps (31 Aug + 6 months = 28 Feb; 29 Feb 2028 + 12 = 28 Feb 2029), `tomorrow`, day helpers are UTC and noon-based. Cache: round trip per user and course, another user or course reads null, clear, corrupt data reads null, a state without goal or without plan is not cached and clears the old entry, an entry with a goal but no plan reads null, every status survives the round trip, a null/blank user id never reads or writes.
- [ ] **Step 2-5:** compile-fail, implement with `java.time` (`ZoneOffset.UTC`, `LocalDate`), pass, mutation-check each rule. **Step 6:** commit.

---

### Task 5: The card's state machine (core)

**Files:** Create `goal/GoalCardModel.kt`, `GoalCardModelTest.kt`.

**Interfaces:** Consumes Tasks 2-4. Produces `interface GoalApi { suspend fun fetch(course); suspend fun preview(...); suspend fun save(...); suspend fun remove(course) }` (implemented by `LearningGoalClient` via a one-line adapter) and `class GoalCardModel(api: GoalApi, cache: GoalCache, userId: () -> String?)` exposing `state: StateFlow<GoalCardState>` where `GoalCardState(phase: LOADING|EMPTY|GOAL|FAILED, goal, plan, loadError: LearningGoalError?, actionError: String?)`, and `suspend fun load(course)`, `suspend fun remove(course)`, `suspend fun save(course, level, date): Boolean`, `suspend fun preview(course, level, date): PreviewResult` (`Ok(plan)` or `Failed(message)`). A `generation` counter makes every call drop its result when a newer `load`/`remove`/`save` started or the course changed.

- [ ] **Step 1: Write failing tests** with a fake `GoalApi` whose calls can be suspended and released (CompletableDeferred): load success sets GOAL/EMPTY and writes the cache; load failure Offline with a cached plan shows GOAL with `loadError = Offline` (editing disabled by the UI), Offline without cache is FAILED, NotSignedIn/Unavailable never show the cached plan even when one exists; signed-out user id (null) fails with NotSignedIn without calling the API; **a slow load for course A finishing after load(B) is dropped** (state shows B); **a save for A finishing after a course switch is dropped but the cache is still written for A**; a remove for A finishing late does not empty B; a failed remove sets `actionError` with the action wording, keeps the goal, and does not set `loadError`; a failed save returns false with the message; a cancelled call (`CancellationException`) leaves the state untouched and propagates; preview returns Ok/Failed and never touches state; remove clears the cache; save writes the cache and moves to GOAL.
- [ ] **Step 2-5:** compile-fail, implement, pass, mutation-check each guard (remove the generation checks one at a time; show the cache for any error; swallow cancellation). **Step 6:** commit.

---

### Task 6: App wiring and Compose UI

**Files:** Create `app/.../data/GoalPrefsStore.kt` (SharedPreferences-backed `GoalCacheStore`), `ui/learn/GoalCardViewModel.kt`, `ui/learn/GoalCard.kt`; modify `AppContainer.kt` (`goalClient`, `goalCache`), `LearnScreen.kt` (one `item(key = "goal")` above the challenges, keyed by course so each course has its own card state).

- [ ] **Step 1: ViewModel** (`viewModel(key = "goal-" + course.code)`): wraps `GoalCardModel`; `load` on creation and when asked to retry; exposes `state` and the preview/save/remove actions on `viewModelScope`.
- [ ] **Step 2: Card composable** following the Learn screen's card style (`parchment` rounded column, `AlphonsoSectionHeader("Learning goal")`): loading text, failed (message from `GoalCopy.loadFailureMessage`, "Try again"), empty ("Set a learning goal" primary button), goal (headline, `AlphonsoProgressBar`, progress, status line as plain text, weekly, suggestion, realism, `estimateNote`, offline note with "As of", `actionError`, Change/Remove secondary buttons disabled while offline), with `semantics { contentDescription = "Learning goal" }` on the container.
- [ ] **Step 3: Setup dialog** (`AlertDialog` or full dialog): level choices A1-C1 (segmented/radio list), a Material3 `DatePickerDialog` whose `selectableDates` rejects today and earlier (UTC), 3/6/12-month preset buttons, the live preview via `LaunchedEffect(level, day)` (a newer key cancels the older), preview lines and server reason on failure, Save disabled until a preview for the current selection arrived and while saving, `estimateNote`. Prefill 6 months ahead like iOS.
- [ ] **Step 4: Verify:** `:app:compileDebugKotlin` and `:app:testDebugUnitTest` locally (background; cold build is long), then the whole `:core:test`. Record explicitly that layout, TalkBack, font scaling and the dialog were NOT run on a device or emulator.
- [ ] **Step 5: Commit.**

---

### Task 7: Documents, review, PR

- [ ] CHANGELOG entry (Android part 3; what is not verified), README bullet, ARCHITECTURE paragraph (core pieces, `GoalCardModel`, fixtures pin now covers iOS and Android), AGENTS row (Android files; wording changes in four places; the web pin covers both copies), `android/LearnWithAlphonso/DEVICE-CHECKLIST.md` (goal card layout, setup dialog and date picker, TalkBack, 200% font scale, offline cache, course switch mid-save), local BACKLOG item 8 (all three parts merged; device checks owed).
- [ ] Full verification: `:core:test` whole, `:app:testDebugUnitTest`, `:app:compileDebugKotlin`, the web pin test, `bunx tsc --noEmit`, `bun run lint`.
- [ ] Fresh whole-branch review via `review-package` with the Review Focus verbatim and the ledger's rulings; fix Critical and Important findings test-first in one pass.
- [ ] Two-dot diff against `origin/main`, push, PR with a "NOT verified" section, apply valid CodeRabbit comments, merge when green (the Android CI workflow runs on `android/**` PRs). No release to Play.

## Self-review

Spec coverage: Android client and Compose card/setup (Tasks 1-6), shared contract and the drift pin (Task 2), offline cache rules (Tasks 4, 5), wording parity (Task 4), stale-request safety now unit-tested (Task 5). Not in this plan: Play release (owner-gated), push reminders (out of scope in the spec). Type names (`GoalPlan`, `StoredGoal`, `LearningGoalState`, `LearningGoalError`, `GoalCopy`, `GoalCache`, `GoalCacheStore`, `GoalApi`, `GoalCardModel`, `LearningGoalClient`) are defined once in Tasks 2-5 and used unchanged in Task 6.
