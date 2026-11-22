# iOS notes

Behaviour of the iOS app that no other living doc records. Every claim was checked against the code at d8350542 (2026-11-22); paths are under `ios/`, `LearnWithAlphonso/Sources` is the app target, `LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit` the Kit. The app target has no unit tests (CI's `ios-app-build` only proves it compiles), so only the pure rules in the Kit are test-pinned. Original design text: `docs/superpowers/specs/2026-09-19-ios-push-notifications-design.md`, `2026-09-24-podcast-phase1b-ios-design.md`.

## 1. Local notifications

All local notifications go through `NotificationScheduler` (`LearnWithAlphonso/Sources/NotificationScheduler.swift`). A notification has one stable identifier per kind, and `schedule()` removes any pending request with that identifier first (line 41), so rescheduling replaces and callers never cancel by hand. Triggers are one-shot `UNCalendarNotificationTrigger`s (`repeats: false`, line 51), in the device's calendar. Sound is the default; there is no badge or deep link (the foreground delegate shows only support replies, see "Foreground and taps").

| Kind (identifier) | Fires | Cancelled / skipped when | Rescheduled from |
|---|---|---|---|
| Streak reminder (`streak-reminder`) "Keep your streak alive" | Next 20:00 device time: today if before 20:00, tomorrow if at or past it (`nextStreakReminderDate`, `NotificationLogic.swift:47-64`) | `lastActiveDate` equals the learner's local date, so a lesson already done today cancels it (line 52; local day, not UTC, owner decision 2026-11-12) | Lesson finish, `LessonPlayerView.swift:882` (server progress) and `:940` (queued offline finish, with the optimistic local date); and on "Remind me", `:1014` |
| Due-review nudge (`due-review-nudge`) "Reviews are waiting" | 3 hours after the call (`NotificationScheduler.swift:102`), body "N items are due for review." (singular for 1) | Zero items due on or before the UTC date (`dueReviewCount`, `NotificationLogic.swift:69`; `dueOn` stays a UTC date) | Each time the Review screen fetches the due list, `ReviewQueueView.swift:297` (online fetch only; no second request) |
| Weekly recap (`weekly-recap`) "Your weekly recap is ready" | Next Monday 09:00 (`nextWeeklyRecapDate`, `LeaderboardEngagement.swift:48`); a Monday before 09:00 fires that day, otherwise next week | Never cancelled by a rule (a recap is always wanted) | Signed-in `.task` in `RootView.swift:211` (launch and sign-in) |
| Weakness nudge (`weakness-practice-nudge`) "A quick practice moment" | Next 10:00 (`nextWeaknessPracticeNudgeDate`, `NotificationLogic.swift:101`), body names only the first open category, hyphens as spaces | No open weakness category (`weaknessPracticeNudgeCopy` returns nil) | Achievements screen load, `AchievementsView.swift:147` (best effort: skipped if the trend fetch fails, which yields an empty list and so cancels it) |

Caveats that differ from the code comments:

- The `scheduleStreakReminder` doc comment says "call on every app launch"; no launch path calls it (grep: only `LessonPlayerView.swift:882,940,978,1014`). The reminder is only (re)armed by finishing a lesson or accepting the reminder card, so a learner who never finishes a lesson after install gets none, and one armed for 20:00 yesterday does not re-arm itself.
- The weekly recap comment says it is rescheduled "right after the recap fires"; nothing does that. It re-arms at the next launch or sign-in, which is the only reason it keeps arriving.

### Permission

- The system dialog appears in exactly one place: "Remind me" on the lesson-complete card (`LessonPlayerView.swift:1008-1016`, `requestAuthorization` options alert, sound, badge, `NotificationScheduler.swift:32`). Finishing a lesson never asks cold (`:974-978`). On grant it also calls `registerForRemoteNotifications()` and arms the streak reminder.
- Card rules (`ReminderPromptPolicy`, `ReminderPromptPolicy.swift:29-44`, store keys `lwa.reminder-prompt.dismissals` / `.lastDismissedAt`): shown from the 2nd completed lesson (`minCompletedLessons = 2`, counted from the server), only while permission is `notDetermined`, at most 2 "Not now" dismissals (`maxDismissals`), at least 3 days apart (`minDaysBetweenOffers`). `decideReminderCard` runs after the haptic, off the finish path (`LessonPlayerView.swift:886, 984-1003`). Pinned by `ReminderPromptPolicyTests`.
- Later launches: `RemotePushRegistrar.registerIfAuthorized()` (`RemotePushRegistrar.swift:67`) only registers for remote push when status is `.authorized`; it never prompts. It runs in the signed-in `.task` (`RootView.swift:212`).

### Cancel everything

Sign-out and account deletion call `NotificationScheduler.cancelAll()` (`:62-66`), wired as `clearLocalNotifications` in `LearnWithAlphonsoApp.swift:119`. It removes all pending and delivered notifications and zeroes the badge, so the previous account's reminders never fire for the next sign-in.

### Foreground and taps (remote push)

`AppDelegate` is the notification-centre delegate (`AppDelegate.swift:27`). In the foreground only a support reply is shown (`willPresent` returns `[.banner, .sound]` when `notificationTapDestination` is `.help`, otherwise `[]`, lines 32-39); local reminders are silent while the app is open. A tap only has a destination for `data.type == "support"` (opens the Help chat via `SupportPushTap`); every other tap, local or remote, just opens the app (`NotificationTap.swift:15-17`, `AppDelegate.swift:43-52`). Pinned by `NotificationTapTests`.

Tests: `NotificationLogicTests` (8pm and 10am boundaries incl. exactly-8pm rolls to tomorrow, local-day rule, due counts, nudge copy), `LeaderboardEngagementTests` (recap), `ReminderPromptPolicyTests`, `NotificationTapTests`. The scheduler itself and permission flow are untested (app target).

## 2. Listen (podcast) player

One `PodcastAudioPlayer` (`PodcastAudioPlayer.swift`) is owned by `RootView` above the view tree, so playback survives any screen change; do not move it into a view (`:15-19`). What the learner sees (playing, buffering, failed, finished) is the Kit's `PodcastPlayerMachine`, unit-tested; the player only maps `AVPlayer` signals to machine events and runs the returned effects. "Playing" shows only after `timeControlStatus == .playing` (`:21-24`, `timeControlChanged` `:359`).

### Background audio and the lock screen

- `UIBackgroundModes = audio` in `LearnWithAlphonso/Info.plist:43-46`; the session is `.playback` / `.spokenAudio` (`PodcastAudioPlayer.swift:414-424`), so audio continues with the screen locked.
- When the app moves to background, `RootView.swift:264-266` calls `applicationDidBackground()`, which saves the position immediately (`:240-243`); audio keeps playing.
- Now Playing (`updateNowPlaying`, `:502-517`): title, duration, elapsed time, rate 1.0 while audible else 0.0, "artist" = the episode description when present; cleared (nil) when idle, on `close()` and on account change. No artwork is set.
- Remote commands (`configureRemoteCommands`, `:467-491`): play (only when the machine's control is play), pause (only when active), skip forward 15 s and skip back 15 s (clamped to 0 and the stored duration, `:493-500`). No next/previous-track or scrub-bar (`changePlaybackPosition`) command is registered, so the lock-screen scrubber is not interactive.
- Interruptions are handled by type (`:436-454`): on `.began` the player pauses and records whether its own recording screens caused it (`RecordingState`); on `.ended` it resumes only if `.shouldResume` is set AND the pause was an interruption AND not our own mic (`PodcastPlayerMachine.swift:157-168`, tests `testInterruptionResumesOnlyWhatItPaused`, `testAVoicePauseNeverResumes`, `testTheSystemDeclinesToResume`). Headphones pulled (`.oldDeviceUnavailable`) pauses and never auto-resumes (`:456-462`). The sleep timer pauses the same non-resuming way (`:164-179`).
- Speaking screens call `pauseForVoice()` (`RootView.swift:191`), which pauses without auto-resume; the learner resumes from the mini bar.
- Failure handling: a 20 s load timeout and a 20 s stall timeout both fail as network (`PodcastPlayerMachine.swift:58-61, 128-140`); the failure is first classified at once, then refined by a HEAD probe of the URL (`:374-395`).
- Sign-out or account deletion calls `stopForAccountChange()` (`:216-238`, via `PodcastLifecycleHooks.stopPlayback`, `RootView.swift:195`, `LearnWithAlphonsoApp.swift:89-93`): stops, clears the queue, now-playing and sleep timer, deactivates the audio session, and bumps the save epoch so a save already in flight cannot reach the next account.

### Resume and cross-device position

- Position is saved to `podcast_playback` (RLS-scoped direct write, user from `auth.uid()`) roughly every 10 s of playback (`tick`, `:546-559`, `abs()` so backward skips also save), on pause, on a seek, on completion and on backgrounding. A finished episode saves position 0 with `completed_at`, and the player seeks back to the start (`PodcastPlayerMachine.swift:138-141`). Saves are chained so each reads the previous one's result (`:563-`). Each save also calls `saveListenProgress` for the Listen shelf (best effort).
- Optimistic concurrency, not magnitude: with a known `updated_at` the write is a `PATCH ... updated_at=eq.<last seen>` that returns an empty array when another device wrote since (`PodcastClient.swift:324-359`), which throws `staleWrite`; with no known row it upserts on `(user_id, episode_id)`. The guarded value is what the server stored last time, never the device clock (`PodcastSaveGate.swift:3-12`). A deliberate rewind is therefore accepted; a stale device's flush is not.
- After a stale or 401 result saving stops until the learner acts (play or resume), because that action is a fresh observation (`PodcastSaveGate.userStartedPlayback`, tests `PodcastSaveGateTests`). `PodcastSavedPositions` makes the device start from the newest position it knows, including one it stored itself that a stale list row predates, and lets another device's newer snapshot win even if its clock is behind (`PodcastSavedPositionsTests`).
- On start the stored position is clamped against the media's real duration, falling back to the row's `duration_seconds` (`PodcastAudioPlayer.swift:521-535`); a position within the last second of the media, or non-positive, becomes 0 (`PodcastPlayback.clampPosition`, `PodcastPlayback.swift:25-28`).
- Play events (seconds listened) are recorded through the `record_podcast_play_event` function, never a direct insert (`PodcastClient.swift:373-381`); the first play of an episode fires `podcastPlayed` analytics once, completion fires `podcastCompleted`.

Not testable in CI and unverified without a device: the lock-screen controls, real call and headphone behaviour (`PodcastAudioPlayer.swift:26-27` says the device checklist covers these).

## 3. Adding a question type (iOS maintenance note)

`Question` (`LearnWithAlphonsoKit/CurriculumModels.swift:8-14`) has six cases: `multipleChoice`, `fillInBlank`, `reorder`, `listening`, `speak`, `translate`. Swift refuses to compile a `switch` that omits a case unless it has a `default`, so the compiler finds the ones below; the ones with a `default` it does not.

The original "six switches, ReviewQueueView is a second player" note is out of date. `ReviewQueueView` no longer renders question types itself: it hosts the same `QuestionCard` as the lesson player (`ReviewQueueView.swift:180`, `surface: .review`), so there is one render switch. The count below is the current one, 11 compiler-enforced plus the hand-checked ones.

**Compiler-enforced (no `default`), touch all when adding a case:**

1. `LessonPlayerView.swift:1025` `questionID` (private; duplicates `Question.questionID`, below)
2. `LessonPlayerView.swift:1094` `QuestionCard.body`, the one render switch for lessons AND Review
3. `QuestionGrading.swift:16` `isAnswerCorrect` (the client grade shown instantly and offline; the server re-derives it)
4. `AnswerVerdict.swift:13` `correctAnswer(for:)`
5. `LessonFlow.swift:126` `typeKey` (key into lesson-timing.json)
6. `LessonFlow.swift:138` `explanationText`
7. `LessonFlow.swift:149` `prompt`
8. `ReviewQueueResolution.swift:6` `Question.questionID` (how a review item's key finds its question)
9. `CourseLanguageSpans.swift:41` `candidates(for:)` (French/Spanish save-a-word spans)
10. `VocabDerivation.swift:55` `answerOf`
11. `VocabDerivation.swift:102` `exampleOf`

**Has a `default` (the compiler will NOT tell you; decide by hand):**

- `LessonPlayerView.swift:1083` `bubbleLabel` (label above the prompt)
- `VocabDerivation.swift:80` `termOf` and `:129` `authored` (word-card term, meaning and example; `default` means "no card")
- `LessonPlayerView.swift:1148-1154` `QuestionCard.bubble` (which text the speaker button reads; `if case`)

**Type-specific side paths (`if case`, copy them if the new type needs the same):** server-graded types are special-cased at `LessonPlayerView.swift:514, 636, 646, 680` and `ReviewQueueView.swift:134, 230` (translate settles through `/api/grade-translation` in the lesson and `grade-review` in Review before the verdict). A type that needs a network grade must be added in both players' Check paths, not only in `QuestionCard`.

**Separate enum, not these:** the placement exam uses `PlacementQuestion` (three cases: multiple choice, listening, translate) with its own switches at `PlacementView.swift:217`, `PlacementLogic.swift:285`, `PlacementModels.swift:58, 66`. A new `Question` type does not need to be added there unless it should be in the exam.

Order that works: add the case, then build; the compiler lists switches 1-11 as errors. Then walk the default-bearing list, run the Kit tests (`AnswerVerdictTests`, `QuestionGradingTests`, `LessonFlowTests`, `ReviewQueueResolutionTests`, `VocabDerivationTests`, `CourseLanguageSpansTests`), and remember the app target is only compiled by CI. The other platforms have their own switches (web `lesson.$id.tsx` and `review.tsx` fall through to a blank card silently, Android has its own); this note covers iOS only. Also keep `src/data/curriculum.ts` and `CurriculumModels.swift` in step.
