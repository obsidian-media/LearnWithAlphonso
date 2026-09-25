# AGENTS.md — Learn with Alphonso

## Project Overview

Learn with Alphonso (repo internal name `english-buddy-app-33`, now at
`github.com/obsidian-media/LearnWithAlphonso`) is a mobile-first English
learning app with 5 CEFR levels (A1-C1), spaced repetition review, AI
conversation practice, and gamification. Also ships French and Spanish
courses, structurally complete but no longer at parity with English (see
Content Structure below). A
native iOS app (`ios/`) shares the same Supabase backend/account and
has grown a substantial V2 feature set of its own — see the Key Files
table and `ARCHITECTURE.md`'s "Native iOS app" section.

## Key Files

| File                                                                                             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/curriculum.ts`                                                                         | Lesson content types + foundation units (A1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/data/levels.ts`                                                                             | Level definitions + advanced units (A2-C1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/data/lesson-bank.ts`                                                                        | Generated lesson packs (see Content Structure below for actual counts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/progress.ts`                                                                            | Zustand progress store (client-side state)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/sync.functions.ts`                                                                      | Server functions (progress sync, lesson completion, SRS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/routes/_authenticated/learn.tsx`                                                            | Learning path UI (units, lessons, progress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/routes/_authenticated/lesson.$id.tsx`                                                       | Lesson player (MC + fill-in-blank)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/routes/_authenticated/review.tsx`                                                           | Spaced repetition review queue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/routes/api/chat.ts`                                                                         | AI chat endpoint (NVIDIA NIM)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/api/tts.ts`                                                                          | Text-to-speech endpoint (Deepgram)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/routes/api/stt.ts`                                                                          | Speech-to-text endpoint (Deepgram)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/hearts.ts`                                                                              | Hearts-economy pure math (regen, bonuses, XP purchase) — also ported to Deno (`supabase/functions/complete-lesson/hearts.ts`) and Swift                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/lib/theme.ts`                                                                               | Theme Zustand store (`meadow` / `studio-ink` / `manuscript`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `supabase/functions/complete-lesson/`                                                            | Deno Edge Function: 1:1 port of `completeLessonRemote` for the native iOS client (no TanStack server layer on iOS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `supabase/functions/start-lesson-session/`                                                       | Deno Edge Function: issues the HMAC session token `complete-lesson` requires — the iOS equivalent of `startLessonSession` (a web-only TanStack server function iOS can't call)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`                                           | SwiftUI lesson player: overview → vocab (via `deriveVocab`) → quiz → finish; calls `start-lesson-session` then `complete-lesson` on finish                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/VocabDerivation.swift`                    | Port of `deriveVocab` (`src/lib/vocab.ts`) — vocabulary is derived from a lesson's own questions, not separate content; stock-photo lookup (`VOCAB_IMAGES`) not ported yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.github/workflows/ios-release.yml`                                                              | Manual (`workflow_dispatch`) signed archive + `.ipa` export + optional TestFlight upload. Uses **manual signing with a persisted, CI-owned Distribution certificate** imported into a temporary keychain every run (the App Store Connect API key is now only used for the TestFlight upload step, not signing) — see that file's header comment for the required repo secrets and why this replaced `-allowProvisioningUpdates` (it was exhausting the account's certificate cap)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `scripts/generate-ios-distribution-signing.ts`, `.github/workflows/setup-ios-manual-signing.yml` | One-time setup that generated the persisted Distribution certificate + provisioning profile `ios-release.yml` now imports every run — re-run only if that certificate/profile ever needs to be rotated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scripts/manage-ios-certificates.ts`, `.github/workflows/manage-ios-certificates.yml`            | Diagnostic/admin tool: lists this account's certificates and which real app each one's provisioning profile belongs to (a certificate alone isn't app-specific), and can revoke one by ID — built to safely resolve the certificate-cap issue above without guessing which cert was safe to revoke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConversationClient.swift`               | Calls this repo's own `/api/chat`, `/api/tts`, `/api/stt` (same backend the web app uses, same Supabase access token) — not AlphonsoEcosystem's Cloud Voice backend; see the type's doc comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ios/LearnWithAlphonso/Sources/ConversationView.swift`                                           | Scenario picker + hold-to-talk conversation screen (record → `/api/stt` → `/api/chat` → `/api/tts` → play)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `supabase/functions/grade-review/`                                                               | Deno Edge Function: 1:1 port of `gradeReview` (re-derives review-answer correctness server-side) for iOS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ios/LearnWithAlphonso/Sources/ReviewQueueView.swift`                                            | SM-2 review queue screen — due items one at a time, grading via `grade-review`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ios/LearnWithAlphonso/Sources/HectorView.swift`                                                 | **Pro-only** ($9.99/mo): AlphonsoCompanion's Hector tutor persona via Cloud Voice — a genuinely separate account/sign-in (different Supabase project). Additional mode alongside, not a replacement for, `ConversationView`'s free standalone scenarios. Gated by `EntitlementStore.isPro` (RevenueCat SDK, currently a Test Store key — see the "RevenueCat" note below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ios/LearnWithAlphonso/Sources/EntitlementStore.swift`                                           | Wraps the RevenueCat SDK — sole source of truth for `isPro`, purchase, and restore. See the "RevenueCat" note below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ios/LearnWithAlphonso/Sources/PaywallView.swift`                                                | Subscribe/restore UI for any Pro-gated feature (currently just Hector)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ios/LearnWithAlphonso/Sources/HectorSession.swift`                                              | Cloud Voice sign-in (email OTP) + device enrollment state, mirrors `Session.swift`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/DeviceEnrollmentClient.swift`             | Registers this device with Cloud Voice (`POST /v1/voice/devices/enroll`) — required once per `HectorSession` before `TutorConversationClient` will accept requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `scripts/seed-curriculum-db.ts`                                                                  | Upserts curriculum tables (`levels`/`units`/`lessons`/`questions`/etc.) from `curriculum.ts` — idempotent, safe to re-run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scripts/podcast-tool.ts`                                                                        | Publishes podcast episodes: `--file` uploads a recorded MP3, `--script` has Deepgram speak one; both then upload to the `podcast-audio` bucket and insert a row. Human-gated like `pack-tool.ts` — nothing writes without `--confirm`. Logic lives in `src/lib/podcast-authoring.ts`/`podcast-tree.ts`/`podcast-tts.ts` (tested); the script is a thin wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ios/LearnWithAlphonsoKit/`                                                                      | Swift package: content models, SRS/progress-math/hearts ports, network clients — builds without Xcode (`swift-test.ps1` on Windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ios/LearnWithAlphonso/Sources/SyncQueueStore.swift`                                             | SwiftData models + store for offline-first: queued lesson completions, queued review grades, cached due-review list, last-known account progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/SyncEngine.swift`                         | Pure drain logic for the offline queue (Kit-level, not app-target, specifically so it stays Windows-testable) — lesson completions drain independently, review grades drain strictly oldest-first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/routes/api/analyze-weaknesses.ts`                                                           | TanStack Start route (not an Edge Function — see `ARCHITECTURE.md`): NVIDIA NIM weakness detection after a Hector/free conversation, taxonomy-constrained, inserts synthetic `review_items` rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/QuestionGrading.swift`                    | `isAnswerCorrect` (client-side optimistic grading) + `question(fromWeaknessItem:)` — builds a `Question` from a weakness-sourced `ReviewItem`'s embedded content instead of a bundled-lesson lookup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ios/LearnWithAlphonso/Sources/ToastBanner.swift`                                                | Shared in-app toast (overtake detection, nudge banner) — extracted after the two call sites were near-identical                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ios/LearnWithAlphonso/Sources/NotificationScheduler.swift`                                      | Local (not push) notification scheduling: streak reminder, due-review nudge, weekly leaderboard recap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `supabase/functions/_shared/apns.ts`, `supabase/functions/send-push/`                            | V4 candidate #2: real (remote APNs) push infrastructure. Live in production as of 2026-09-22 — a real APNs Auth Key was created and `APNS_KEY_P8`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID` are all set as repo secrets, no longer a no-op — see `docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ios/LearnWithAlphonso/Sources/RemotePushRegistrar.swift`, `AppDelegate.swift`                   | iOS half of real push: remote-notification registration + APNs device token capture, materially separate from the local `NotificationScheduler` above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ios/LearnWithAlphonso/Sources/DesignSystem/`                                                    | Full 4-theme design system: Meadow/Studio Ink/Manuscript match the web's `THEME_NAMES` exactly; `canopy` (2026-09-23) is deliberately iOS-only and absent from `THEME_NAMES` (see ARCHITECTURE.md's Themes section) — `AlphonsoThemeManager` (`@Observable` singleton) resolves colors/fonts per active theme, computed from `src/styles.css`'s oklch values (Canopy has no CSS counterpart, its oklch values live only in the spec); seven bundled variable fonts (Canopy reuses Meadow's already-bundled Geist rather than adding an eighth file) resolved via CoreText variation axes; button styles incl. the `.hard-shadow` press effect; `SpringEntrance`; `alphonsoInputBackground()`. `RootView` pins `.preferredColorScheme` to the active theme so system chrome stays legible regardless of the device's own Dark Mode setting (see ARCHITECTURE.md's "Known rough edges" for the real bug this fixes). Applied across every screen — see `ios/LearnWithAlphonso/Sources/Fonts/` for the bundled `.ttf` files and `Info.plist`'s `UIAppFonts` for registration |
| `ios/LearnWithAlphonso/Sources/SettingsView.swift`                                               | In-app theme picker + Sign out (the app's first settings screen), reachable from a gear button on the Learn tab. Applies a theme instantly via `AlphonsoThemeManager` and syncs the choice to `profiles.theme` in the background                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ios/LearnWithAlphonso/Sources/RootView.swift`                                                   | The five-tab bar: Learn · Listen · Practice · Hector · Profile. It was seven, and iPhone renders five before collapsing the rest into "More", so Achievements was buried. Learn carries the due-review badge (`ReviewBadge`, in the Kit so it is tested)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ios/LearnWithAlphonso/Sources/ProfileHubView.swift`                                             | Hub for League, Friends, Achievements and Settings after Phase 0. Presents each rather than pushing: all of them own a `NavigationStack`, so pushing would nest two and give a double navigation bar on a real screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ios/LearnWithAlphonso/Sources/ListenView.swift`                                                 | Podcast browser: owns the NavigationStack; the folder listing it pushes deliberately does not, so stacks never nest. Online-only until Phase 3 adds download                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ios/LearnWithAlphonso/Sources/PodcastAudioPlayer.swift`                                         | The one AVPlayer, owned by RootView above the view tree. Background audio, Now Playing, interruptions by type (honours `.shouldResume` for calls, suppresses it for the app's own mic screens via `RecordingState`). No unit tests exist for it — device-verified only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ios/LearnWithAlphonso/Sources/RecordingState.swift`                                             | Counter the four recorder types mark while recording. Read at interruption-_began_, because a recorder's `stop()` is what makes iOS send `.shouldResume` — reading at -ended would race it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastClient.swift`                      | PostgREST client for the podcast library. Play events go through `record_podcast_play_event` (no client INSERT grant); resume saves use optimistic concurrency on `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Profile.swift`         | `fetchProfileTheme`/`updateProfileTheme` — plain PostgREST GET/PATCH on `profiles` (never had its direct-write grant revoked, unlike the gamification tables), same RLS (`profiles_update_own`) the web's `updateProfile` server function relies on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ios/LearnWithAlphonso/Sources/StatusHeaderView.swift`                                           | Streak/hearts/XP/league-tier summary at the top of the Learn tab — reads `SyncQueueStore`'s cached last-known progress, no new network call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ios/LearnWithAlphonso/Sources/Assets.xcassets/Alphonso.imageset`, `Hector.imageset`             | Real character portraits for the app's two named personas (user-generated, provided directly — see ARCHITECTURE.md's "Native iOS app" section). Referenced via `Image("Alphonso")`/`Image("Hector")` in `AuthView`, `HectorView`, and `DesignSystem/AlphonsoComponents.swift`'s `AlphonsoTipCard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `vitest.setup.ts`                                                                                | React Testing Library cleanup + DOM matchers for the Vitest suite (added with PR #46's coverage expansion — see Testing below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/data/vocab-images.ts`                                                                       | Stock-photo lookup keyed by vocab term (`VOCAB_IMAGES`), used by `deriveVocab`'s web path. Covers English/French/Spanish terms — Spanish images added 2026-09-21 (two batches, searched by English-concept query since the image provider's index isn't Spanish-aware). Not yet ported to iOS (`VocabDerivation.swift`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Content Structure

Counted directly from `curriculum` / `curriculumFr` / `curriculumEs`,
re-verified 2026-09-24 — unchanged by PR #84's English content
overhaul, which rewrote question _quality_ (distractors) rather than
adding or removing lessons (do not trust a stale number here — re-run the
count if this drifts; ARCHITECTURE.md's "Content model" section and
README.md's Content table carry the same numbers plus a question-count
column, kept in sync):

| Course  | A1  | A2  | B1  | B2  | C1  | Total lessons |
| ------- | --- | --- | --- | --- | --- | ------------- |
| English | 137 | 119 | 119 | 117 | 117 | **609**       |
| French  | 115 | 115 | 115 | 115 | 115 | **575**       |
| Spanish | 105 | 106 | 109 | 107 | 106 | **533**       |

French and Spanish reached structural parity with English on 2026-09-21
(both grew from a 25-pack/125-lesson starting point, reusing the same
bank-engine pack pipeline). English pulled ahead on 2026-09-24 by adding
`listening`, `speak` and `translate`, and French closed that gap —
**phase 2** (`docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md`),
done, four PRs, one per generator change / question type:

- **PR 1** (merged): taught `bank-engine.ts` — the shared generator French
  and Spanish use — the `listening`/`speak`/`translate` kinds. Spanish
  inherits this for free; its own content is a separate, later job.
  Deliberately did not port English's part-of-speech distractor ranking
  (blocked on the morphology decision, phase 1.5) — only its
  language-neutral confusability ordering for `listening`.
- **PR 2** (merged): French `translate` content, 5 packs (one per CEFR
  level), 125 questions.
- **PR 3** (merged): French `listening` content, 5 packs, 125
  questions — French minimal pairs (dessus/dessous, poisson/poison,
  ces/ses, mer/mère, pain/pin, cou/coup, vert/verre), verified at 96%
  confusability the same way the English audit measured its own listening
  content (a distractor sharing ≥50% of the answer's content words).
- **PR 4** (this work): French `speak` — a new `spoken-answer-fr.ts`
  module (elision, a French number map) landed across all three ports
  (TS/Deno/Swift) with mirrored test vectors, then 5 speak packs, 125
  questions, each authored against and round-tripped through the real
  normaliser (`matchesSpokenAnswerFr`) rather than assumed correct — one
  line (`aujourd'hui`) was cut during that check because it isn't one of
  the normaliser's elidable clitics, so an STT rendering that
  space-separates it would never rejoin. The normaliser itself is
  UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS (no French speak content
  existed before this PR to build one from) — see `spoken-answer-fr.ts`'s
  header comment.

**Spanish's own phase 2** (`docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md`
§7 step 7), in progress, four PRs mirroring French's exactly:

- **PR 1** (merged): verified `bank-engine.ts` needs zero Spanish-specific
  changes — checked against real Spanish content (a `pesa`/`besa`
  minimal-pair fixture testing Spanish's own accent range, `ñ`/`¿`/`¡`,
  none of which appear in French), not inferred from French's passing
  tests.
- **PR 2** (this work): Spanish `translate` content, 5 packs (one per
  CEFR level), 125 questions, Latin American variety (`tú`/`usted`/
  `ustedes`, no `vosotros`/`vos` — measured against the existing bank,
  which already used that variety exclusively).
- **PR 3, PR 4**: not started (`listening`, then `speak` +
  `spoken-answer-es.ts` across three ports).

**Question types, current**: English and French both have all six
(`mc`, `fill`, `reorder`, `listening`, `speak`, `translate`) — full
type parity; Spanish now has four (`mc`, `fill`, `reorder`,
`translate`) — `listening`/`speak` are its own phase 2's remaining PRs.

Content correctness (grammar, natural phrasing) for French and Spanish
still needs native-speaker review — not done for either, just
structurally complete, and phase 2's new content adds to that same
unreviewed surface rather than reducing it.

French's phase 1 structural audit
(`docs/superpowers/french-content-audit-log.md`, 2026-09-24) covers only
the mechanical axis — malformed content, duplicate and self-referential
prompts, encoding integrity. It is **not** a substitute for the
native-speaker review above.

- **SM-2 spaced repetition** for missed items (all levels, both courses)

## Code Conventions

- **TypeScript** strict mode
- **React 19** functional components
- **Tailwind CSS v4** utility classes
- **Zustand** for client state
- **TanStack Router** file-based routing
- **Zod** for server-side validation
- **Framer Motion** for animations

## Testing

Vitest covers pure logic (SRS grading, XP/streak/league math, hearts
economy, lesson-completion trust-boundary checks) **and**, since PR #46
(2026-09-20), a real behavioral suite for components, hooks, routes, and
Supabase integration — React Testing Library + `jsdom`
(`vitest.setup.ts`). Playwright covers E2E + accessibility (axe-core)
smoke tests in `e2e/*.spec.ts`, scoped to unauthenticated routes (no
seeded test account exists for CI to sign in with). `ios/LearnWithAlphonsoKit`
has its own XCTest suite (SRS/progress-math/hearts/SyncEngine/weakness-
detection-helper ports, network client tests via an injected requester
closure — no real network in tests), 146 tests as of 2026-09-20. Lint,
typecheck, Vitest, Playwright, and the Swift package's tests are all
wired into CI (`.github/workflows/ci.yml`) on every PR and push to
`main` (both Swift jobs run on a macOS runner; Vitest runs as a step
inside the `lint-and-typecheck` job, not its own named check — easy to
miss when reading `gh pr checks` output) — `ios-app-build` additionally
runs a real `xcodebuild` of the `LearnWithAlphonso` app target itself,
the only compile verification that exists for it (no local Xcode/macOS
in this development environment):

```sh
bun run lint         # ESLint
bunx tsc --noEmit    # TypeScript
bun run test         # Vitest. 137 files / 1,189 tests as of 2026-09-25,
                      # taken from a CI run on main, NOT from this machine --
                      # see the verification-hygiene note below. Treat the CI
                      # number as the baseline: a local run reporting FEWER
                      # files has not found a regression, it has been starved.
                      # maxWorkers is pinned in vitest.config.ts since #116,
                      # so do NOT pass --maxWorkers by hand.
bun run test:coverage # Vitest with v8 coverage report
bun run test:e2e     # Playwright (e2e/*.spec.ts)
swift test --package-path ios/LearnWithAlphonsoKit   # or, on Windows, ios/LearnWithAlphonsoKit/swift-test.ps1
```

**Coverage as of 2026-09-24** (`bun run test:coverage`, re-run rather
than assuming it holds after further changes): 93.95% statements /
82.13% branches / 90.36% functions / 95.30% lines overall.

Both long-standing thin spots were closed the same day and are no longer
thin: `src/routes/__root.tsx` went 18.36% -> **97.95%** statements (100%
lines, 100% functions) and `HeartsModal.tsx` 68.62% -> **96.07%** (100%
lines, 100% functions). What had been untested in each was real logic
rather than boilerplate — `AuthSync`'s session/auth-event handling and
the first-paint theme script in one, the focus trap and the
refill-due transition in the other.

The two worst remaining branch-coverage files were also done the same
day: `campaign_.$campaignId.tsx` 41.53% -> 64.61% branches and
`duels.tsx` 66% -> 74%, both by covering user-facing failure paths
(mic permission, transcription failure, queue matching) rather than
happy paths.

`challenges`/`season`/`teams.functions.ts` also got their first tests
the same day. They had been the **only** `*.functions.ts` modules
without a test file — all three arrived in the gamification batch
(PRs #65–67) without the tests every sibling has.

**Corrected 2026-09-24**: `src/routes/api/analyze-weaknesses.ts` was
listed here for a long time as "~8%, because server routes adjacent to
Edge Functions aren't unit-tested here as a matter of established
pattern". It is at **91.17%**, as are its siblings (`chat.ts` 96.29%,
`stt.ts` 95.65%, `tts.ts` 95.23%). That stated pattern no longer
describes the codebase — don't cite it to justify skipping tests on a
new server route.

### Traps that have each cost a session real time

**`user.type` on a controlled input can leave only the last character in
state.** The symptom is not "the typing failed" — it is that whatever consumes
the value behaves as though the feature under test is broken. It cost three
wrong hypotheses about placement's band-scoring rules before the test was made
to print the real payload rather than be reasoned about. Use
`fireEvent.change(el, { target: { value: "..." } })` for controlled inputs and
textareas; reserve `user.type` for cases where the per-keystroke path is itself
what you are testing. And when a test disagrees with your model of the code,
print the actual value early rather than guessing at the model a third time.

**A passing mutation test can still be proving the wrong thing.** The check is
not "I broke something and the test went red" — it is "I broke _the property
the test claims to guard_ and the test went red". A placement assertion
comparing two derivations of the same array was verified by deleting an item
from the dump, which went red because the deletion perturbed the mapping, not
because the assertion pinned any content. The assertion still could not catch
the thing its own comment claimed. When a mutation passes, check which axis it
actually attacked.

**A check that finds a defect and does not surface it is worse than no check,
because the silence gets read as zero.** `curriculum-consistency.test.ts`'s
cross-pack duplicate check was report-only for English and Spanish and printed
its findings with `console.log` -- which vitest intercepts. A normal run showed
46/46 passed and said nothing while holding 7 English and 57 Spanish findings;
they were only visible with `--disableConsoleIntercept`. Two independent
sessions then recorded "already clean" for that check on the strength of a quiet
run. A sibling case landed the same week: `podcast-tool validate` printed
`[ERROR] folder tree contains a cycle` and exited 0, so every `&&` chain and CI
step read success.

The rule: a finding must travel on a channel that fails the build -- an assertion
message, a non-zero exit -- never on stdout alone. If a check is not ready to
gate, gate it at its current count (a ratchet) rather than printing. And when a
check IS report-only, treat its silence as unknown, not as zero: run it the way
that shows output before believing it.

**Check which direction a missing value pushes you before calling it safe.**
"Leave it out rather than guess" is usually the cautious choice, and in distractor
ranking it is the opposite. `rank()` resolves an untagged candidate to the
ANSWER's word class, so a candidate with no tag sorts as a perfect distractor:
removing a tag PROMOTES that word. A change that dropped 12 tags degraded 43
questions across 11 packs while its own bank-wide metric improved — because that
metric skipped untagged candidates, so the same deletion removed the mismatch
from the numerator and promoted the word in the product. Three files of this
branch's prose asserted "no tag merely declines to express a preference" without
anyone reading the six-line function that decides it. When a design rests on what
a default does, open the default.

**A measurement can be a fact about your instrument rather than your data.**
Pair-pack answers had no part-of-speech tag, and the obvious fix was to drop the
answer into a synthetic sentence so the tagger has context -- the same move that
made cloze tagging work. Measured against a hand-labelled sample, `It is X.`
scores 93% and `They X.` scores 64%, and the reason is not that one frame is
better: `It is X.` puts the word in a nominal slot so every verb comes back a
noun, and `They X.` puts it in a verbal slot so sixteen nouns come back verbs. A
frame does not read a word's class, it imposes one, and its accuracy is a fact
about the frame's syntax and the sample's composition. The same shape shows up
whenever a metric shares a mechanism with the thing it measures -- the existing
part-of-speech _ratio_ check has the identical flaw and says so. Before trusting
a number, ask what it would say if the data were wrong.

**Nothing else may touch the tree while a verification command runs.** A second
`vitest` racing a backgrounded first silently drops test files — 126 files
became 115, and earlier 117 became 113 and then 107 — with everything
"passing", so the count just quietly shrinks. Worse, it does not always shrink
quietly: a starved run also produces 5,000ms **timeouts** in unrelated files,
which read as real failures. On 2026-09-24 the same machine reported "2 failed"
and then "82 of 129 files" within an hour, both spurious, while 41 stray
node/bun processes from earlier sessions were still alive. Three separate
sessions hit this independently that day and two quoted a wrong number onward
before catching it.

When a local result disagrees with CI, **CI is right** — it runs on a clean
runner. Check `Get-Process node,bun` before trusting a local full-suite number. Two concurrent `bun run build`s
report a spurious failure. It is not only same-tool collisions: a run started
immediately after `lint --fix` dropped 11 files too, because the formatter was
still writing while vitest was discovering. Run verification sequentially with
nothing in the background, and treat any unexplained DROP in the file count as
a racing process rather than a regression — re-run before investigating. If a
command gets backgrounded mid-pass, wait for it rather than re-running.

**And "nothing in the background" means nothing on the MACHINE, not nothing in
your session.** Parallel worktrees are parallel Claude sessions sharing one
worker budget. Seen 2026-09-24: 128 files became 114 with 17 errors, then 105
with 26, and every one was `[vitest-pool]: Failed to start forks worker ...
Timeout waiting for worker to respond` rather than a single test failure — which
reads exactly like a regression in whatever you just changed. The cause was
another session running `vitest run --maxWorkers=4` in a sibling worktree, and
re-running made it worse because both sessions were then competing. The same
run came back 131 files / 1096 tests / 0 errors once that finished.

**#116 pinned `maxWorkers` in `vitest.config.ts`, which fixed the CPU half
and cannot fix the memory half.** Do not advise passing `--maxWorkers=4`
by hand; it is the default now, and advice that reads as manual outlives
the fix.

**Memory starvation can fake a NAMED TEST FAILURE, not just spawn errors
(2026-09-25).** A run reported 1 failed test in `ai-quota.server.test.ts`
beside six worker-spawn errors, with eight competing vitest processes and
806 MB free; it passes 15/15 alone. That is materially harder to spot than
a short file count, because a red test in a file you just touched is the
most convincing possible evidence that you broke something. **Re-run an
unexpected single failure on its own before believing it.** Measured cause:
the machine has 7.86 GB of RAM and runs several `claude` processes at
~2 GB combined -- it is not disk (190 GB free) and not the stray node/bun
processes (26 of them, 732 MB combined). Running the suite in chunks and
reconciling against the collected file count is the correct method here,
not a workaround.

**`swift.exe` is blocked by an Application Control policy (2026-09-25).**
For app-target code under `ios/LearnWithAlphonso/Sources/` there is no
local RED/GREEN at all: `ios-app-build` compiles without running tests,
and `ios-swift-tests` covers only `LearnWithAlphonsoKit`. Put as much
logic as possible in the Kit, where CI still runs real tests, and leave
only wiring and UI in the app target.

A worker-spawn timeout is not a test failure. Diagnose it before believing a
suite result, and check by worktree so you do not kill another session's run:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*vitest*' } |
  Select-Object ProcessId, CreationDate,
    @{n='wt';e={ if($_.CommandLine -match 'worktrees.([^\\]+)'){$Matches[1]}else{'main'} }}
```

**Update:** `vitest.config.ts` now pins `maxWorkers: 4` (#116, f570221, "cap vitest workers so a starved run cannot look green"), so the cap is automatic and you no longer pass the flag by hand. The diagnosis above still applies -- a cap bounds one run's appetite, it does not stop two sessions competing.

Wait for the other run, then re-verify. Never kill a process belonging to
another worktree.

### Content guards, and what each one ratchets

Content defects in this repo are not caught by reading the content. Five
guards now hold a number that must not rise. **If you change content and
one of these fails, the guard is almost certainly right.** If you fix
something, lower the number in the same commit -- never separately.

| Guard                                                               | Holds                                    | Notes                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curriculum-consistency.test.ts` -- `CROSS_PACK_DUPLICATE_BASELINE` | `{ en: 0, fr: 0, es: 0 }`                | Same prompt in two packs. Was report-only and **vitest swallowed its `console.log`**, so it found 57 Spanish and 7 English duplicates and discarded them for weeks. Never write a report-only content check.                                                                        |
| `placement-lesson-overlap.test.ts`                                  | 0, all courses                           | Placement questions must not duplicate course content. 25 of the exam's 60 English questions did -- the exam was scoring recall of specific lesson items. Also gates the pool repeating _itself_, which matters because it is sampled three-per-band.                               |
| `migration-order.test.ts`                                           | no violations                            | A migration must not reference a table created by a later-versioned one. A real timestamp guarantees uniqueness, **not dependency order** -- `20260926030000` was itself renumbered forward out of a collision, so "now" can sort below it.                                         |
| `id-parity.test.ts`                                                 | exact id sets + pack-length distribution | Question ids are **index-derived**. Inserting or deleting a line repoints every later id in the pack, which silently reassigns real learners' SRS history. Fix content by **1:1 in-place replacement**; append, never insert.                                                       |
| `spanish-distractor-quality.test.ts`                                | 95.0% cross-verb                         | Measurement, not a gate. **This is not a ranking defect** -- a Spanish conjugation pack holds one form each of several different verbs, so the pool has almost no same-verb alternatives to rank, and porting `orderDistractorCandidates` would look like a fix and change nothing. |

Two habits these encode:

- **Count "unresolved" separately from either bucket.** English once lost
  12 part-of-speech tags; 43 questions degraded while its own ratio metric
  _improved_, because untagged candidates were silently dropped from the
  denominator. An absent tag is a promotion, not an abstention.
- **Mutation-test on the axis the guard claims to hold.** The
  migration-order guard was mutation-tested against a `REVOKE` case and
  shipped with a hole the same size as the one it closed: it matched
  `ALTER`/`REVOKE`/`GRANT`/`CREATE INDEX`/`CREATE POLICY` and missed a
  foreign key inside `CREATE TABLE`. A mutation test proves the axis you
  broke, not the ones you did not.

## Assets

See `LESSON_ASSETS.md` for the asset list (audio, images, icons,
animations) — but read that file's own status banner first: it was
written against a 300-lesson premise that is long stale. The real total
is **1,542 lessons** across the three courses (see Content Structure
above), and its image-assets section is superseded.

## Deployment

`LESSON_SESSION_SECRET` (server-only, see `src/lib/lesson-session.server.ts`)
and `ai_rate_limits`/`ai_usage` quota tables must exist in the linked
Supabase project _and_ `LESSON_SESSION_SECRET` must be set in **both** the
deployment host's env vars _and_ as a `supabase secrets set` value for
`complete-lesson` and `start-lesson-session` (same value on both sides;
`grade-review` does not need `LESSON_SESSION_SECRET`), or lesson
completion fails closed for web and/or iOS respectively. See
`.env.example` for the full required-env list. Migrations and Edge
Function deploys are now automated by `.github/workflows/ci.yml`'s
`deploy-supabase` job on every push to `main` (added 2026-09-20 — see
ARCHITECTURE.md's "Known rough edges" section for the required repo
secrets and the manual fallback if that job's credentials ever lapse).
**Current state (2026-09-22, verify before trusting): all migrations
applied, all five Edge Functions deployed and current (`complete-lesson`,
`start-lesson-session`, `grade-review`, `send-push`, `get-season-status`
— the last two added by V4). Caught a real deploy-pipeline gap adding
`get-season-status`: `deno check`/`deno test` don't catch a missing
per-function `deno.json` import map, only the Supabase CLI's own
bundler does — see that function's directory for the fix.**

**Web app (Vercel) — reconnected and fully confirmed 2026-09-20,
re-verify anyway before assuming it stayed that way.** Vercel's GitHub
integration lost this repo in the org transfer (personal account →
`obsidian-media`), went undeployed for every merge since PR #49, and
was reconnected the same day. Confirmed three ways, not just that the
link's metadata updated: (1)
`mcp__plugin_vercel_vercel__get_git_deployment_context` shows the
`learnwithalphonso` project linked to `org: "obsidian-media", repo:
"LearnWithAlphonso"`; (2) a manually-triggered git-sourced deployment
built successfully; (3) — the real test — a plain `git push` to `main`
with no manual trigger produced a new deployment (`source: "git"`) on
its own within ~90 seconds. Auto-deploy-on-push is genuinely restored.
If a future check shows it's stopped working again: install the Vercel
CLI globally (`bun add -g vercel` — `bunx vercel` has hung unreliably
in this environment, root cause not identified), then `vercel deploy
--prod --token=<token>` from a clean `main` checkout as a fallback.
`.vercelignore` keeps the upload scoped to the actual app.

**RevenueCat (Pro/"Hector" gating):** `EntitlementStore` (`ios/LearnWithAlphonso/Sources/EntitlementStore.swift`)
wraps the RevenueCat SDK (`Purchases.configure` in `LearnWithAlphonsoApp.init`);
every Pro-gated view reads only `EntitlementStore.isPro`/`.packages`, never
touches `Purchases` directly. Currently configured with a **Test Store**
API key (`AppConfig.revenueCatAPIKey`) and no offering created yet in the
RevenueCat dashboard, so `PaywallView` shows a "not available yet" state
rather than a real purchase button — expected, not a bug. Before a real
launch: create the App Store Connect subscription product ("Alphonso
Pro", $9.99/month), connect it in RevenueCat, create an Offering there
with a Package, and swap `AppConfig.revenueCatAPIKey` for the production
(non-`test_`-prefixed) public key. The entitlement identifier gating
Hector is `AppConfig.proEntitlementID` ("pro").

## Audit

A full codebase audit (security, architecture, accessibility, content,
performance, UX, testing) is kept locally, not committed to this repo —
see README.md's Documentation section for why.

## Backlog

**`docs/BACKLOG.md`** (local-only, gitignored, added 2026-09-21) is the
master list of every deferred/postponed/not-yet-tackled item across
this project — launch-blockers, scoped-but-unbuilt V3 features, older
carried-over deferrals, and known rough edges. Check it before assuming
something hasn't been thought about yet, and add to it (rather than
letting something drop) whenever new work gets raised and postponed.
It consolidates `DEFERRED-WORDS.md`, `docs/v2-kickoffs/`,
`docs/v3-kickoffs/`, and this file's own Testing section's coverage
gaps — those still exist with more detail, `docs/BACKLOG.md` is the
index layer on top.
