# Android Plan 4: Podcasts, Notifications, Push and Widget

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Listen tab (folder tree, search, resume, transcripts, offline downloads with a budget, background playback with lock-screen controls and a next-episode control), the four local notifications, Firebase Cloud Messaging for nudges and overtakes (one additive backend change shipped to `main` as its own PR), and a home-screen streak widget.

**Architecture:** `core` gains the podcast ports (`PodcastModels`, `PodcastTree`, `PodcastSearch`, `PodcastTranscript`, `PodcastPlayback`, `PodcastCache`, `PodcastCacheBudget`), a `PodcastClient` over `SupabaseHttp`, a pure `PodcastSessionTracker` (the save-every-10-seconds and listened-seconds rules that iOS keeps untested in `PodcastAudioPlayer`), `NotificationLogic` (the four fire-time rules), `ReminderPlan` (kind, title, body, fire time; the scheduler is a thin port), `StreakWidgetSnapshot`, and `ProgressSyncClient.registerDeviceToken(token, "android")`. `app` gains a Media3 `MediaSessionService` with one `ExoPlayer`, a `PodcastPlayer` controller that owns queue and saves, `PodcastDownloadManager` over OkHttp with a `.partial` staging file, Room v2 with `podcast_downloads`, `LocalNotificationScheduler` over WorkManager unique work, `NotificationPermission`, `PushRegistrar` plus `AlphonsoMessagingService`, a Glance `StreakWidget`, and the `ListenScreen` with `PodcastMiniBar`. Backend: `supabase/functions/_shared/fcm.ts` and a migration widening `device_tokens.platform`.

**Tech Stack:** Plans 1 to 3 plus `androidx.media3:media3-exoplayer` and `media3-session` 1.11.1, `androidx.glance:glance-appwidget` and `glance-material3` 1.2.0, `com.google.firebase:firebase-messaging` 25.1.3 (BOM 34.19.0), `com.google.gms:google-services` 4.5.0 applied only when `app/google-services.json` exists, `androidx.core:core-ktx` 1.19.1, `com.squareup.okhttp3:okhttp` 5.5.0 (already transitive through Ktor; declared for the download client), WorkManager 2.12.0 (already in the catalog). All versions verified on Google's Maven index on 2026-09-30.

**Spec:** `docs/superpowers/specs/2026-09-29-android-app-design.md` sections 6 (Room `PodcastDownload`), 7 (playback), 8 (push), and the feature map rows Podcasts, Notifications, Widget.

**Depends on:** Plans 1 to 3 on `android`.

## Global Constraints

- Every podcast read goes through PostgREST with the same shapes `PodcastClient.swift` sends: folders `select=id,parent_id,slug,title,description,sort_order&order=sort_order.asc`; episodes `select=id,folder_id,slug,title,description,audio_path,duration_seconds&folder_id=eq.{id}&order=sort_order.asc` merged client-side with `podcast_playback` `select=episode_id,position_seconds,updated_at`; search `or=({filter})&order=title.asc&limit=50` with the filter from `PodcastSearch.ilikeOrFilter` over `title,description`; transcript `select=text&episode_id=eq.{id}&limit=1`.
- Play events only through the RPC `record_podcast_play_event(_episode_id, _seconds_listened)`; never a direct insert (`authenticated` has no INSERT grant).
- Position saves are optimistic-concurrency writes: PATCH `podcast_playback?episode_id=eq.{id}&updated_at=eq.{lastSeen}` with `Prefer: return=representation`; an empty array is a stale write. No row yet means POST. A 401 disables further saves for the session.
- Audio URL: `{SUPABASE_URL}/storage/v1/object/public/podcast-audio/{audio_path}` with each path segment percent-encoded separately; an empty path skips the episode.
- `clampPosition`: non-finite or non-positive is 0; at or past `duration - 1` is 0.
- Cache budget default 500,000,000 bytes, injectable everywhere; refusal names deletion candidates (never-played first, then least recently played) and never deletes on its own. Files go to `filesDir/podcast-audio/{sanitised id}.mp3`, staged as `.partial`; reconcile on start drops rows without files, files without rows, and every `.partial`.
- Playback is one `ExoPlayer` inside a `MediaSessionService` with `foregroundServiceType="mediaPlayback"`, audio focus handled by the player, becoming-noisy pauses, and a pause when `RecordingState.isRecording` turns true (never auto-resumed by the recorder ending).
- Notification copy and times are `NotificationScheduler.swift`'s verbatim: streak reminder 20:00 local ("Keep your streak alive" / "You haven't studied today yet -- a quick lesson keeps it going."), due-review nudge 3 hours after the queue loads ("Reviews are waiting" / "N items are due for review." or "1 item is due for review."), weekly recap next Monday 09:00 local ("Your weekly recap is ready" / "See how you did on the leaderboard last week."), weakness nudge next 10:00 local ("A quick practice moment" / "You've got a {category} question waiting in your review queue."). Identifiers `streak-reminder`, `due-review-nudge`, `weekly-recap`, `weakness-practice-nudge`; scheduling a kind replaces its pending one.
- `POST_NOTIFICATIONS` (API 33+) is requested at the first lesson completion only while undetermined, never at launch. The FCM token is uploaded only after that grant and while signed in.
- Backend change is additive and no-ops without `FCM_SERVICE_ACCOUNT_JSON` and `FCM_PROJECT_ID`; the APNs path is untouched. It lands on `main` as its own PR from a branch off `origin/main`, never through `android`.
- The widget reads only a JSON snapshot in `SharedPreferences` `alphonso.widget` under key `streakWidgetSnapshot`, written on every `updateLastKnownProgress`; it never touches the network or Room.

## Review Focus

1. Deleting a downloaded episode while it plays must stop playback first and never leave the player pointing at a missing file (Task 6 test on `PodcastPlayer.deleteRespectingPlayback`).
2. A stale position write from a second device must be dropped, not retried, and a rewind must be accepted (Task 1 client tests: `staleWrite` on an empty representation, PATCH body carries the smaller position).
3. A recorder starting while a podcast plays must pause it and the podcast must not resume when the recorder stops (Task 5 test on `PodcastPlayer` with a fake `RecordingState` flow).
4. The streak reminder must be cancelled, not rescheduled, when the user already studied today, and the due-review nudge must be cancelled when nothing is due (Task 2 tests on `ReminderPlan`).
5. An FCM `UNREGISTERED` or 404 response must prune that token row while an APNs row stays untouched (Task 3 Deno test with an injected fetch).

---

### Task 1: Podcast ports and client in core

**Files:**
- Create: `core/src/main/kotlin/.../core/podcast/PodcastModels.kt`, `PodcastTree.kt`, `PodcastSearch.kt`, `PodcastTranscript.kt`, `PodcastPlayback.kt`, `PodcastCache.kt`, `PodcastSessionTracker.kt`, `core/src/main/kotlin/.../core/net/PodcastClient.kt`
- Test: `core/src/test/kotlin/.../core/podcast/PodcastTreeTest.kt`, `PodcastSearchTest.kt`, `PodcastTranscriptTest.kt`, `PodcastPlaybackTest.kt`, `PodcastCacheTest.kt`, `PodcastSessionTrackerTest.kt`, `core/src/test/kotlin/.../core/net/PodcastClientTest.kt`

**Interfaces:**
- `data class PodcastFolder(id, parentId: String?, slug, title, description: String?, sortOrder: Int)`; `data class PodcastEpisode(id, folderId, slug, title, description: String?, audioUrl: String, durationSeconds: Int, positionSeconds: Int, playbackUpdatedAt: String?)`.
- `object PodcastTree { isValidSlug(slug); children(parentId: String?, folders); resolve(path: List<String>, folders): PodcastFolder?; findCycle(folders): List<String>? }`.
- `object PodcastSearch { normalizeQuery(raw): String?; escapeLikeValue(v); ilikeOrFilter(query, columns): String? }` (the URL encoding is Ktor's job; the client test asserts the encoded query).
- `object PodcastTranscript { paragraphs(text): List<String> }`.
- `object PodcastPlayback { clampPosition(position: Double, durationSeconds: Double): Double; audioUrl(supabaseUrl, audioPath): String? }`.
- `sealed class PodcastDownloadState { NotDownloaded; Downloading(progress); Downloaded(bytes); Failed(reason) }`; `data class PodcastCacheEntry(episodeId, bytes: Long, etag: String?, storedDurationSeconds: Int, lastPlayedMillis: Long?)`; `object PodcastCache { fileName(id); temporaryFileName(id); isStale(entry, servedEtag, servedBytes); durationDisagrees(cachedSeconds, storedSeconds); offlineListing(entries, episodes) }`; `object PodcastCacheBudget { DEFAULT_BYTES = 500_000_000L; usedBytes(entries); canAdd(bytes, entries, budget); deletionCandidates(entries, needing, budget) }`.
- `class PodcastSessionTracker { fun tick(seconds: Double): TickDecision; fun flushListened(): Int; fun reset() }` with `data class TickDecision(val savePosition: Boolean)`: listened accumulates deltas in (0, 2); a save fires when `abs(seconds - lastSaved) >= 10`.
- `sealed class PodcastClientError : Exception { Unauthorized; StaleWrite; Server(status); InvalidPayload }`; `class PodcastClient(http: SupabaseHttp)`: `fetchFolders()`, `fetchEpisodes(folderId)`, `searchEpisodes(query)`, `fetchTranscript(episodeId): String?`, `savePlaybackPosition(episodeId, positionSeconds, completed, lastSeenUpdatedAt)`, `recordPlayEvent(episodeId, secondsListened)`.

- [ ] **Step 1: Failing tests.** Port every case from `PodcastTreeTests.swift`, `PodcastSearchTests.swift`, `PodcastTranscriptTests.swift`, `PodcastPlaybackTests.swift`, `PodcastCacheTests.swift` and `PodcastClientTests.swift` with the same values. Add `PodcastSessionTrackerTest`: ticks 0,1,2 accumulate 2 listened seconds; a seek from 2 to 40 adds nothing; a save fires at 10 and again after a backward skip to 0 (abs); `flushListened` returns the rounded total and resets. Client tests use `FakeSupabase` and assert the `or=` query is present and percent-encoded (`%22` present, no raw `"`), the RPC path, the PATCH filter `updated_at=eq.`, POST when `lastSeenUpdatedAt` is null, `completed_at` present when completed, and `StaleWrite` on `[]`.
- [ ] **Step 2: Run** `.\gradlew.bat :core:test --tests "*Podcast*"`. Expected: compilation failure.
- [ ] **Step 3: Implement** the files above. `PodcastClient` decodes rows with `rowsOf` from `ProgressSyncClient` (it is `internal`, same module). `SupabaseHttp.rest` builds the URL; pass `queryList = listOf("or" to "(${filter})")` and let Ktor encode.
- [ ] **Step 4: Run** the same command. Expected: all green.
- [ ] **Step 5: Commit** `feat(android-core): podcast ports, client and session tracker`.

---

### Task 2: Notification logic, widget snapshot and device tokens in core

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/NotificationLogic.kt`, `core/src/main/kotlin/.../core/logic/WidgetSnapshot.kt`
- Modify: `core/src/main/kotlin/.../core/net/ProgressSyncClient.kt` (add `registerDeviceToken`, `unregisterDeviceToken`)
- Test: `core/src/test/kotlin/.../core/logic/NotificationLogicTest.kt`, `WidgetSnapshotTest.kt`, `core/src/test/kotlin/.../core/net/DeviceTokenTest.kt`

**Interfaces:**
- `fun nextStreakReminderMillis(lastActiveDate: String?, nowMillis: Long, zone: ZoneId): Long?`; `fun dueReviewCount(items: List<ReviewItem>, today: String): Int`; `fun weaknessPracticeNudgeCopy(openCategories: List<String>): Pair<String, String>?`; `fun nextWeaknessPracticeNudgeMillis(nowMillis, zone): Long`; `fun nextWeeklyRecapMillis(nowMillis, hour = 9, zone): Long`.
- `enum class ReminderKind(val id: String) { STREAK("streak-reminder"), DUE_REVIEW("due-review-nudge"), WEEKLY_RECAP("weekly-recap"), WEAKNESS("weakness-practice-nudge") }`; `data class ReminderPlan(kind, title, body, fireAtMillis)`; `object ReminderPlans { streak(lastActiveDate, now, zone): ReminderPlan?; dueReview(items, now, zone): ReminderPlan?; weeklyRecap(now, zone): ReminderPlan; weakness(openCategories, now, zone): ReminderPlan? }` (null means cancel that kind).
- `@Serializable data class StreakWidgetSnapshot(streak, longestStreak, studiedToday, updatedAtMillis)`; `fun makeStreakWidgetSnapshot(streak, longestStreak, lastActiveDate, nowMillis)`.
- `ProgressSyncClient.registerDeviceToken(token, platform = "android")`: POST `device_tokens?on_conflict=user_id,token` with `Prefer: resolution=merge-duplicates,return=minimal`, body `{token, platform, updated_at}`; `unregisterDeviceToken(token)`: DELETE `device_tokens?token=eq.{token}`.

- [ ] **Step 1: Failing tests.** Port `NotificationLogicTests.swift` (UTC zone; exactly 20:00 schedules tomorrow) and the `nextWeeklyRecapDate` cases from `LeaderboardEngagementTests.swift` (Monday before 09:00 is today, Monday after is next week, Wednesday and Sunday resolve to the upcoming Monday). `ReminderPlans.streak` returns null when `lastActiveDate` is today; `dueReview` null when nothing due, body singular for 1; `weakness` null with no categories. Widget snapshot: `studiedToday` true only when `lastActiveDate` equals today's UTC date; JSON round-trips. Device token: request shape above, platform `android`.
- [ ] **Step 2: Run** `:core:test --tests "*Notification*" --tests "*Widget*" --tests "*DeviceToken*"`. Expected: compile failure.
- [ ] **Step 3: Implement** with `java.time` (`ZonedDateTime.withHour(20).withMinute(0).withSecond(0).withNano(0)`, `DayOfWeek.MONDAY`).
- [ ] **Step 4: Run.** Expected green.
- [ ] **Step 5: Commit** `feat(android-core): notification plans, widget snapshot, device token registration`.

---

### Task 3: FCM backend (own PR to main)

**Files (in a second worktree on branch `fcm-android-push` off `origin/main`):**
- Create: `supabase/migrations/20260930090000_device_tokens_android.sql`, `supabase/functions/_shared/fcm.ts`, `supabase/functions/_shared/fcm.test.ts`
- Modify: `supabase/functions/_shared/apns.ts` (`sendPushToUser` fans out by platform), `.github/workflows/ci.yml` (deno test step for `fcm.test.ts`), `ARCHITECTURE.md` (push section), `CHANGELOG.md`

**Interfaces:**
- Migration: `ALTER TABLE public.device_tokens DROP CONSTRAINT device_tokens_platform_check; ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK (platform IN ('ios', 'android'));`
- `fcm.ts`: `fcmConfigured(): boolean`; `buildFcmAccessToken(serviceAccount, now, fetchImpl): Promise<string>` (RS256 JWT with `scope https://www.googleapis.com/auth/firebase.messaging`, exchanged at `token_uri`); `sendFcmToTokens(rows, title, body, data, deps: {fetch, now}): Promise<{sent: number; stale: string[]}>` posting to `https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send` with `{message: {token, notification: {title, body}, data}}`; 404 or an error body containing `UNREGISTERED` marks the row stale.
- `apns.ts` `sendPushToUser`: selects `id, token, platform`; iOS rows go to APNs (existing code, only if configured), Android rows go to `sendFcmToTokens` (only if configured); the union of stale ids is deleted; returns `{sent, skipped}` where `skipped` is `"not_configured"` only when neither sender is configured.

- [ ] **Step 1: Failing test** `fcm.test.ts`: (a) `buildFcmAccessToken` with a test RSA key (generated in the test via WebCrypto, exported PKCS8 PEM) produces a JWT whose header is `RS256` and whose claims carry `iss`, `scope`, `aud = token_uri`, `iat`, `exp = iat + 3600`, and the injected fetch receives `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`; (b) `sendFcmToTokens` with an injected fetch returning 200, 404 and 400 `UNREGISTERED` reports `sent 1` and both other ids stale; (c) a thrown fetch counts as neither.
- [ ] **Step 2: Run** `deno test supabase/functions/_shared/fcm.test.ts`. Expected: module not found.
- [ ] **Step 3: Implement** `fcm.ts` and the `apns.ts` fan-out; write the migration; add the CI step; update docs.
- [ ] **Step 4: Run** the Deno test plus `deno check supabase/functions/_shared/apns.ts supabase/functions/send-push/index.ts supabase/functions/complete-lesson/index.ts`. Expected green.
- [ ] **Step 5: Commit, push, open the PR** titled `feat(push): Android device tokens and FCM fan-out`, body explains the no-op contract and the two secrets. Do not merge without the owner; the branch `android` does not depend on it at build time.

---

### Task 4: Room v2, download manager and the playback service

**Files:**
- Create: `app/src/main/java/.../podcast/PodcastDownloadRecord.kt` (entity + DAO), `PodcastDownloadManager.kt`, `PodcastPlaybackService.kt`, `PodcastPlayer.kt`
- Modify: `data/SyncDao.kt` (`AlphonsoDatabase` version 2, entity list, `MIGRATION_1_2`), `AppContainer.kt`, `AndroidManifest.xml`, `gradle/libs.versions.toml`, `app/build.gradle.kts`
- Test: `app/src/test/java/.../podcast/PodcastPlayerTest.kt` (with a `FakeExoPlayer` behind the small `PlayerPort` interface), `app/src/androidTest/java/.../podcast/PodcastDownloadStoreTest.kt` (Room v2 migration creates the table; insert and reconcile)

**Interfaces:**
- `@Entity(tableName = "podcast_downloads") data class PodcastDownloadRecord(@PrimaryKey episodeId, bytes: Long, etag: String?, storedDurationSeconds: Int, lastPlayed: Long?, downloadedAt: Long)`; `PodcastDownloadDao { all(); byId(id); upsert(r); delete(id); markPlayed(id, at) }`.
- `MIGRATION_1_2 = object : Migration(1, 2) { override fun migrate(db) { db.execSQL("CREATE TABLE IF NOT EXISTS `podcast_downloads` (`episodeId` TEXT NOT NULL, `bytes` INTEGER NOT NULL, `etag` TEXT, `storedDurationSeconds` INTEGER NOT NULL, `lastPlayed` INTEGER, `downloadedAt` INTEGER NOT NULL, PRIMARY KEY(`episodeId`))") } }`.
- `sealed class PodcastDownloadRefusal : Exception { BudgetExceeded(candidates, neededBytes); NoUrl; TransferFailed(reason) }`; `class PodcastDownloadManager(context, dao, http: OkHttpClient, budgetBytes = DEFAULT_BYTES)`: `states: StateFlow<Map<String, PodcastDownloadState>>`, `localFile(episodeId): File?`, `entries()`, `usedBytes()`, `download(episode)`, `delete(episodeId)`, `markPlayed(episodeId)`, `reconcile()` (called from `init`).
- `interface PlayerPort { fun prepare(uri, startMillis); play(); pause(); seekTo(millis); currentMillis(); durationMillis(); release(); var onEnded: () -> Unit; var onTick: (Double) -> Unit }`; the real implementation is a `MediaController` bound to `PodcastPlaybackService`.
- `class PodcastPlayer(port: PlayerPort, client: () -> PodcastClient?, recording: StateFlow<Boolean>, scope)`: `state: StateFlow<PodcastPlayerState(episode, isPlaying, elapsedSeconds, failed, queue, savesDisabled)>`, `nextEpisode`, `play(episode, localUri: String?, queue)`, `toggle()`, `next(localUriFor)`, `close()`, `onBackground()`, `skip(seconds)`; saves through `PodcastSessionTracker`; `StaleWrite` clears `lastSeenUpdatedAt`; `Unauthorized` sets `savesDisabled`; on `recording` true it pauses and sets `pausedByRecording`, never resuming on false.
- `PodcastPlaybackService : MediaSessionService` builds one `ExoPlayer` with `AudioAttributes(CONTENT_TYPE_SPEECH, USAGE_MEDIA)` and `handleAudioFocus = true`, `setHandleAudioBecomingNoisy(true)`, a `MediaSession` whose activity intent opens `MainActivity`.

- [ ] **Step 1: Failing tests.** `PodcastPlayerTest`: play sets episode and prepares at the stored position; ticks every second save at 10 s and again after a backward skip; finishing saves `completed = true` at position 0 and records a play event with the listened seconds through the RPC; a stale write clears `lastSeenUpdatedAt` so the next save POSTs; a 401 disables saves; `recording` turning true pauses and turning false does not resume; `close()` saves and releases; `nextEpisode` is null at the end of the queue. `PodcastDownloadStoreTest` (androidTest): opening version 2 over a version 1 database runs the migration; a row with no file is dropped by `reconcile`.
- [ ] **Step 2: Run** `:app:testDebugUnitTest --tests "*PodcastPlayer*"`. Expected compile failure.
- [ ] **Step 3: Implement** the files, manifest additions (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, the service with `foregroundServiceType="mediaPlayback"` and the `androidx.media3.session.MediaSessionService` intent filter), dependencies.
- [ ] **Step 4: Run** the unit tests and `:app:assembleDebug`. Expected green.
- [ ] **Step 5: Commit** `feat(android): podcast downloads, Media3 playback service and player controller`.

---

### Task 5: Listen tab and the mini bar

**Files:**
- Create: `app/src/main/java/.../ui/listen/ListenViewModel.kt`, `ListenScreen.kt`, `PodcastMiniBar.kt`
- Modify: `ui/RootScreen.kt` (Listen route, mini bar docked above the navigation bar inside the `Scaffold` `bottomBar` column), `ui/nav/Routes.kt` (`listen/folder/{id}`)
- Test: `app/src/test/java/.../ui/listen/ListenViewModelTest.kt`

**Interfaces:**
- `class ListenViewModel(client, downloads, connectivity)`: `state` with `folders`, `knownEpisodes`, `isLoading`, `error`, `searchQuery`, `searchResults`, `isSearching`; `load()`, `loadEpisodes(folderId)`, `setQuery(q)` (debounced on the normalized query; no request below the minimum length), `offlineListing()`.
- Screens: root listing (children folders as `AlphonsoRowCard`, episodes with a download button and a resume accent), folder screen, search results with the three distinct empty states, offline flat listing with the "Offline — showing your downloads" header, refusal dialog naming candidates, transcript bottom sheet with paragraphs or "No transcript".

- [ ] **Step 1: Failing test** `ListenViewModelTest`: `load` maps folders; a one-character query never hits the server; `"  coffee  "` and `"coffee"` produce one request; offline with two downloads lists exactly those two by title; offline with none is the empty state, not an error.
- [ ] **Step 2 to 5:** compile failure, implement, green, commit `feat(android): Listen tab, search, downloads UI and mini bar`.

---

### Task 6: Local notifications

**Files:**
- Create: `app/src/main/java/.../notifications/NotificationChannels.kt`, `LocalNotificationScheduler.kt` (interface `ReminderScheduler { schedule(plan); cancel(kind) }` + WorkManager implementation `ReminderWorker`), `NotificationPermission.kt`
- Modify: `AppContainer.kt`, `MainActivity.kt` (register the permission launcher), `ui/RootScreen.kt` (on signed-in launch: streak from cached progress, weekly recap), `ui/lesson/LessonViewModel.kt` and `LessonScreen.kt` (after `Finished`: request permission if undetermined, then `streak(lastActiveDate)`), `ui/review/ReviewViewModel.kt` (after a fetched queue: `dueReview`), `ui/achievements/AchievementsScreen.kt` VM (after the trend: `weakness`)
- Test: `app/src/test/java/.../notifications/ReminderHooksTest.kt` with a recording `ReminderScheduler` fake

- [ ] **Step 1: Failing test:** a lesson finish with `lastActiveDate` of today cancels `STREAK`; yesterday schedules it at 20:00 local; a queue with 3 due schedules `DUE_REVIEW` with body "3 items are due for review."; an empty trend cancels `WEAKNESS`.
- [ ] **Step 2 to 5:** implement (`OneTimeWorkRequest` with `setInitialDelay`, `enqueueUniqueWork(kind.id, REPLACE)`, `NotificationCompat` on channel `reminders`, deep link to `MainActivity`), green, commit `feat(android): local streak, review, recap and weakness reminders`.

---

### Task 7: FCM registration in the app

**Files:**
- Create: `app/src/main/java/.../push/PushRegistrar.kt`, `AlphonsoMessagingService.kt`
- Modify: `app/build.gradle.kts` (conditional `com.google.gms.google-services`), `build.gradle.kts` (plugin alias), `gradle/libs.versions.toml`, `AndroidManifest.xml` (service with `com.google.firebase.MESSAGING_EVENT`), `AppContainer.kt`, `ui/RootScreen.kt` (`registerIfAuthorized` on signed-in launch), `core/auth/SessionManager.kt` callers (unregister on sign-out through `PushRegistrar.onSignOut`), `.github/workflows/android-ci.yml` (write `google-services.json` from the secret when present)
- Test: `app/src/test/java/.../push/PushRegistrarTest.kt`

**Interfaces:**
- `class PushRegistrar(tokenSource: suspend () -> String?, permissionGranted: () -> Boolean, isSignedIn: () -> Boolean, client: () -> ProgressSyncClient?, prefs)`: `registerIfAuthorized()`, `onNewToken(token)`, `onSignOut()`; remembers the last uploaded token in prefs and skips a re-upload of the same token.
- `AlphonsoMessagingService : FirebaseMessagingService`: `onNewToken` → registrar; `onMessageReceived` → notification on channel `social` with `title`/`body` from `notification` or `data`.
- `FirebaseMessaging.getInstance().token` is wrapped in `runCatching`; when Firebase is not configured (no `google-services.json`) the token source returns null and nothing is uploaded.

- [ ] **Step 1: Failing test:** no permission → no upload; permission but signed out → none; both → one POST with platform `android`; same token twice → one POST; `onSignOut` → DELETE with the token and the pref cleared.
- [ ] **Step 2 to 5:** implement, green, commit `feat(android): FCM token registration and message service`.

---

### Task 8: Streak widget

**Files:**
- Create: `app/src/main/java/.../widget/StreakWidget.kt` (`GlanceAppWidget` + `GlanceAppWidgetReceiver`), `WidgetPublisher.kt`, `app/src/main/res/xml/streak_widget_info.xml`
- Modify: `AppContainer.kt` (`RoomSyncQueueStore(dao, onProgressUpdated = { WidgetPublisher.publish(app, it) })`), `data/SyncQueueStore.kt` (the callback), `AndroidManifest.xml` (receiver with `APPWIDGET_UPDATE`)
- Test: `app/src/test/java/.../widget/WidgetPublisherTest.kt` (the JSON written to `MemoryPrefs` decodes to the snapshot)

- [ ] **Step 1 to 5:** failing test, implement (Glance `Column` with the fire glyph, streak number, "day streak", "Studied today" or "Not studied yet", empty state "Open Learn with Alphonso to start your streak"; `updateAll` after each publish), green, commit `feat(android): Glance streak widget`.

---

### Task 9: One build, docs and CI

- [ ] Run `.\gradlew.bat :core:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug --continue`; fix; verify counts from the JUnit XML.
- [ ] Update `android/LearnWithAlphonso/README.md` (Plan 4 row, secrets section, owner actions), `ARCHITECTURE.md` (Android section: podcasts, notifications, push, widget; push section: FCM fan-out), `CHANGELOG.md`, `AGENTS.md` if a new top-level file appears, `android-ci.yml` (google-services secret step).
- [ ] Commit, merge `origin/main`, push `android`, watch `android-ci.yml` to green including the emulator job.
