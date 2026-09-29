# Android app: design

Written 2026-09-29. Status: approved design, awaiting implementation
plan (`docs/superpowers/plans/2026-09-29-android-app-plan.md`).

Companion to `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`
(the iOS app this one mirrors) and `docs/v2-kickoffs/08-android-groundwork.md`
(the kickoff that scoped this as its own initiative). Read
`ARCHITECTURE.md` first for the backend every client shares.

## 1. Goal and success criteria

Ship a native Android app of Learn with Alphonso with feature parity to
the iOS app and, where the web app has something iOS does not, to the
web app too. Same Supabase project, same Edge Functions, same `/api/*`
routes, same bundled content. One account, one backend, three clients.

Done means, in order:

1. A signed release AAB is produced by CI from the `android` branch.
2. Every feature in section 4 works against production on a real
   device, exercised with the demo account.
3. Shared logic in `core` passes the same test vectors the TypeScript,
   Deno and Swift suites use.
4. Play Console listing, data-safety answers and internal-testing
   upload are done once the owner provides the Play and RevenueCat
   secrets (section 11).

Decisions the owner made on 2026-09-29, recorded so nobody re-asks:

- Scope is full parity plus Play release.
- Stack is Kotlin, Jetpack Compose, supabase-kt.
- Remote push uses Firebase Cloud Messaging; the owner creates the
  Firebase project.
- Google sign-in uses Supabase's OAuth flow in a Custom Tab, reusing
  the existing Google OAuth client.
- All work lands on one long-lived `android` branch in the
  `LearnWithAlphonso-android` worktree, merged once at the end.
- The Android pipeline stays fully separate from the iOS one: its own
  export script, its own workflows. Shared files on `main` are touched
  only for the FCM backend change (section 8), which is additive.
- Local Android tooling is installed only under
  `D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds`.

## 2. Constraints

- No Android Studio, emulator or device in the development
  environment. The command-line SDK and Gradle are installed under the
  playground path above for compiling and running JVM unit tests.
  Anything that needs a device (audio, mic, purchases, push, widget)
  is verified in CI's emulator smoke test or by the owner on a real
  phone, and the spec says which.
- The repository is public. No secret, demo credential or signing
  material is committed; every one is a repo secret or a documented
  placeholder that release refuses to ship.
- Google Play requires targetSdk 36 for new apps from 2026-08-31.
  supabase-kt requires minSdk 26.
- Exact library versions are pinned in the first feasibility build
  (plan task 1) by real Gradle resolution, not copied from memory.
  Baselines verified 2026-09-29: Compose BOM 2026.09.00, AGP 9.4
  (Gradle 9.6, JDK 17+), supabase-kt 3.x, RevenueCat
  purchases-android 10.x stable.

## 3. Architecture

```
android/LearnWithAlphonso/
  settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml
  core/    pure JVM Kotlin, no Android dependency
  app/     Android application, Compose UI, clients, Room, Media3, FCM
```

**`core`** holds everything that can be unit-tested without Android:
content models and JSON decoding, SRS engine, hearts economy, progress
math, streak and league rules, spoken-answer normalisers (EN, FR, ES),
translation matching, placement logic, reinforcement picking, sync
drain, podcast cache rules and budget, notification scheduling rules,
widget snapshot builder, leaderboard overtake detection. Each is a
direct port of the TypeScript source of truth in `src/lib` and
`src/data`, with the Swift port in `ios/LearnWithAlphonsoKit` as the
second reference. Every port ships with the same test vectors.

`core` also holds the network clients as plain classes over an
injected HTTP engine (Ktor `HttpClientEngine`), so client tests run on
the JVM with a mock engine: `ProgressSyncClient` (PostgREST reads, RPCs,
Edge Functions), `AiClient` (`/api/chat`, `/api/tts`, `/api/stt`,
`/api/grade-translation`, `/api/analyze-weaknesses`,
`/api/generate-practice`), `TutorClient` (`/api/hector-respond`),
`AccountClient` (`/api/account-export`, `/api/account-delete`),
`PodcastClient`. supabase-kt is used for Auth and as the PostgREST
client; the Edge Functions and `/api/*` routes are called with Ktor
directly, sending the same headers iOS sends (`Authorization: Bearer`,
`apikey`), because their contracts are plain HTTP and iOS already
proved them.

**`app`** is Compose UI on Material 3 with the four Alphonso themes,
plus the Android-only pieces: session persistence, Custom Tab OAuth,
Room offline store, MediaRecorder capture, Media3 playback, WorkManager
notifications, FCM registration, RevenueCat, the Glance streak widget.
`app` decides nothing that `core` can decide; the rule from the iOS
app ("a rule decided in the app target is a rule no test can reach")
carries over.

Dependency injection is manual through one `AppContainer` built in
`Application.onCreate`; no Hilt, for the same reason iOS chose plain
SwiftUI over a framework: fewer moving parts to validate without a
local IDE, and nothing here needs scoped graphs. Navigation is `navigation-compose`
with five bottom tabs matching iOS: Learn, Listen, Practice, Hector,
Profile.

## 4. Feature map

Every row names its iOS or web source so the port has one reference.

| Area | Android behaviour | Source |
| --- | --- | --- |
| Sign-in | Email OTP code; email + password with reset link; Google via Supabase OAuth in a Custom Tab with redirect `com.obsidianmedia.learnwithalphonso://login-callback`; Terms/Privacy line on the screen | `AuthView.swift`, `src/routes/auth.tsx` |
| Session | Stored in EncryptedSharedPreferences; proactive refresh 60 s before expiry; one retry on 401 | `Session.swift`, `KeychainSessionStore.swift` |
| Placement | Presented once after sign-in when `placement_taken_at` is null; mc, listening, translate; adaptive bands; `save_placement_result` | `PlacementView.swift`, `PlacementLogic.swift` |
| Learn tab | Course picker, CEFR band grouping, completion dots, scroll to last completed, review row with due badge | `LessonBrowserView.swift` |
| Lesson player | Overview, vocab (derived), quiz with all six types, in-lesson reinforcement, hearts loss on wrong answer via `lose_heart`, `start-lesson-session` then `complete-lesson`, finish screen with achievements, league promotion, continue to next lesson, generated practice | `LessonPlayerView.swift`, `lesson.$id.tsx` |
| Review queue | `fetchDueReviews`, `grade-review`, translate graded on Check, clear bonus RPC, offline cached queue and optimistic grade | `ReviewQueueView.swift` |
| Offline | Room store for pending completions, pending grades, cached due list, last-known progress; drain on connectivity and foreground; completions independent, grades strictly ordered | `SyncQueueStore.swift`, `SyncEngine.swift` |
| Hearts, XP, streak, league | Status header from cached progress; `restore_hearts_if_due` when a refill elapsed; buy heart and streak freeze with XP | `StatusHeaderView.swift`, `HeartsEconomy.swift` |
| Leaderboard | Global, friends, country; weekly, all-time; overtake toast; weekly recap | `LeaderboardView.swift` |
| Friends | Invite link share, friends list, nudge with 24 h cooldown, activity feed, remove, block, report | `FriendsView.swift` |
| Duels | Pending, active, past; challenge friend; open queue with level match; block and report | `DuelsView.swift` |
| Teams | Create (name, visibility), join by code, auto-join, share code, member list, owner kick, leave, weekly leaderboard | `TeamsView.swift` |
| Season, challenges, quests, achievements, weakness trend | Same RPCs and Edge Function as iOS | `SeasonView.swift`, `ProgressSyncClient+Challenges.swift`, `AchievementsView.swift` |
| Practice | Scenarios and Campaigns, hold-to-talk, stt, chat with CEFR hint, tts playback, weakness analysis on leave, AI disclosure gate | `ConversationView.swift`, `CampaignView.swift` |
| Hector | Pro-gated tutor via `/api/hector-respond`, memory priming, same recorder | `HectorView.swift` |
| Speak questions | Same recorder; typing fallback when offline or mic denied; `course` sent to stt | `SpeakQuestionCard.swift` |
| Podcasts | Folder tree, search, episodes with resume, transcripts, play events RPC, offline download with budget and reconcile, Media3 background playback with notification and lock-screen controls, next episode | `ListenView.swift`, `PodcastAudioPlayer.swift`, `PodcastDownloadManager.swift` |
| Subscription | RevenueCat paywall: price and period from the Play product, subscribe, restore, manage (Play subscriptions deep link), Terms and Privacy links; server gate unchanged | `PaywallView.swift`, `EntitlementStore.swift` |
| Settings | Display name and avatar shuffle, theme picker synced to `profiles.theme`, export data (save via `ACTION_CREATE_DOCUMENT`), delete account with typed DELETE, Privacy and Terms links, sign out | `SettingsView.swift` |
| Notifications | Local: streak reminder 8 pm, due-review nudge, weekly recap Monday 9 am, weakness nudge 10 am. Remote: nudges and overtakes via FCM | `NotificationScheduler.swift`, `RemotePushRegistrar.swift` |
| Widget | Glance home-screen streak widget reading a snapshot the app writes | `StreakWidget.swift`, `WidgetSharing.swift` |
| Accessibility | Content descriptions on every control, dynamic font scaling, reduced-motion respected, TalkBack labels on mic buttons and answer choices | iOS accessibility PRs #179-182 |

Not in scope: Sign in with Apple (not required on Android), Wear OS,
tablet-specific layouts, Kotlin Multiplatform, anything on the admin
app.

## 5. Content pipeline

`scripts/export-android-content.ts` imports the same builders as
`export-ios-content.ts` (`src/lib/ios-content-export.ts`) and writes the
ten JSON files to `android/LearnWithAlphonso/app/src/main/assets/content/`.
`core`'s test source set adds that directory as a test resource root, so
`core` tests decode the real bundle without a second committed copy.
The iOS script is not modified.
`android-ci.yml` regenerates and fails on a diff, the same guard the
iOS pipeline has. `core`'s content models decode the JSON with
kotlinx.serialization and fail loudly on an unknown question type, for
the reason `ContentStore.swift` documents.

## 6. Data and offline

Room database `alphonso.db` with entities `PendingLessonCompletion`,
`PendingReviewGrade`, `CachedDueReview`, `AppSyncState`,
`PodcastDownload`. The drain algorithm lives in `core.SyncEngine` and
takes plain lists in and returns plain results out; `app` owns
persistence. Offline lesson completion queues the raw answers and shows
the estimated-XP screen; offline review grading computes the optimistic
SM-2 outcome with `core.SrsEngine` and updates the cached queue. Both
known iOS edge cases (concurrent-device grading, offline streak date)
are inherited deliberately and documented, not solved.

## 7. Audio

Recording: `MediaRecorder` with `MPEG_4` container and `AAC` encoder at
44.1 kHz mono into a temp file; explicit `RECORD_AUDIO` permission
request before the first start; minimum 0.4 s capture; a
`RecordingState` counter shared with the podcast player so
`AudioManager` focus loss caused by the app's own recorder does not
resume playback. The hold-to-talk control is a stable outer
`Box` with `pointerInput` press detection and a purely visual inner
circle, and it cancels the recorder if the composable leaves
composition mid-press. The permission callback checks that the press
is still down before starting, closing the race the iOS audit found.

Playback: one Media3 `ExoPlayer` in a `MediaSessionService` declared
with `foregroundServiceType="mediaPlayback"` (required on Android 14+),
`MediaPlayer` for short TTS replies, `TextToSpeech` for listening
prompts and "hear it first".

## 8. Push (the one shared backend change)

- Migration: `device_tokens.platform` CHECK widened to `('ios',
  'android')`.
- `supabase/functions/_shared/fcm.ts`: signs a service-account JWT,
  exchanges it for an OAuth token, posts to the FCM HTTP v1 endpoint.
  Configured by `FCM_SERVICE_ACCOUNT_JSON` and `FCM_PROJECT_ID` Edge
  Function secrets; no-ops when unset, exactly like `apns.ts`.
- `sendPushToUser` selects tokens by platform and fans out to both
  senders; a 404 or `UNREGISTERED` prunes the FCM row the way 400/410
  prunes APNs rows.
- This change is additive and no-ops without its secrets, and push
  cannot be device-verified until it is live, so it lands as its own
  small PR to `main` early in the plan (the one exception to the
  long-lived-branch rule), deployed by the existing `deploy-supabase`
  job. The Android app requests `POST_NOTIFICATIONS` (Android 13+) at
  the same first-lesson-completion moment iOS asks, and registers the
  FCM token only after that grant.

## 9. Subscription

`EntitlementStore` wraps `Purchases`. Configure with the public Android
SDK key read from `BuildConfig.REVENUECAT_PUBLIC_KEY`, injected from the
`REVENUECAT_ANDROID_PUBLIC_KEY` secret at build time; the checked-in
default is empty and the release workflow refuses an empty or `test_`
key. `logIn(supabaseUserId)` after sign-in so `isProSubscriber` on the
server finds the same subscriber. The paywall shows nothing priced
until `offerings()` returns a package. "Manage subscription" opens
`https://play.google.com/store/account/subscriptions?sku=...&package=...`.

## 10. Testing and CI

`core` tests: one test class per port, vectors copied from the TS
tests (`srs.test.ts`, `hearts.test.ts`, `progress-math.test.ts`,
`spoken-answer*.test.ts`, `translation-answer.test.ts`,
`placement.test.ts`, `podcast-*.test.ts`), plus client tests against a
Ktor `MockEngine` asserting the exact request shape the server expects
(multipart field named `file`, `course` field, RPC parameter names).

`app` tests: Compose UI tests for the lesson player's six question
types, the paywall states, and the report/block sheets, run in the CI
emulator. One emulator smoke test launches the app with the demo
session injected through an instrumentation argument (debug builds
only, the same pattern as `Session.uiTestBootstrapSession`) and walks
the five tabs.

`.github/workflows/android-ci.yml` on push to `android` and pull
requests touching `android/**`: content freshness, `core` unit tests,
Android lint, `assembleDebug`, emulator smoke on `ubuntu-latest` with
KVM. `.github/workflows/android-release.yml` on manual dispatch:
signed `bundleRelease`, artifact checks, optional Play upload.

## 11. Release

Secrets the owner provides when ready, each documented in the release
workflow header: `ANDROID_UPLOAD_KEYSTORE_BASE64`,
`ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`,
`ANDROID_UPLOAD_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`,
`REVENUECAT_ANDROID_PUBLIC_KEY`, `FIREBASE_GOOGLE_SERVICES_JSON`,
`FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`. The workflow generates the
upload keystore on first run if asked, so the owner never handles
`keytool` by hand. Play App Signing is enabled at first upload.

Listing material lives in `android/LearnWithAlphonso/play/`: short and
full description adapted from the App Store copy, data-safety answers
derived from `PrivacyInfo.xcprivacy` and `privacy.tsx`, review notes
adapted from `update-app-review-info.ts` with the demo-account wording
corrected to what Play actually needs, screenshot shot list. Screenshots
are captured by the emulator smoke test into an artifact. Play requires
a public account-deletion URL in the listing: the web profile page
(`https://learn.alphonsoecosystem.app/profile`) already offers deletion
and is used as-is.

## 12. Risks and how they are handled

- No device access: audio, purchases, push and widget are the four
  areas where CI cannot prove behaviour. Each ships with a checklist in
  `android/LearnWithAlphonso/DEVICE-CHECKLIST.md` for the owner, and
  the release workflow never runs until that checklist is signed off
  in the plan.
- Library drift: pins live in `libs.versions.toml`; Dependabot is not
  enabled on this branch to keep the surface stable until merge.
- Backend divergence: the TS tests hold their vectors inline, so a
  mechanical diff is not possible. Instead each ported module gets a
  JSON vector file under `android/LearnWithAlphonso/core/src/test/vectors/`
  generated once by a Bun script from the TS implementation; the Kotlin
  test consumes it, and a Vitest test in `src/lib` re-runs the same
  file against the TS implementation. A TS behaviour change that is not
  re-exported fails the web suite, which is the loud channel this repo
  trusts.
- The shared-file rule: only section 8 touches files outside
  `android/`, `scripts/export-android-content.ts` and the two Android
  workflows. Anything else that seems to need a shared change is raised
  in the plan, not made.
