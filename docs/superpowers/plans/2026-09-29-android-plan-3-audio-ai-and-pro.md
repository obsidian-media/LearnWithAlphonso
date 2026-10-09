# Android Plan 3: Audio, AI Conversation and Pro

> Status (2026-10-09): implemented and merged to `main` in #200. Its per-device AI disclosure gate has not been replaced by the account-level AI consent (#254 to #257) on Android yet.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything that listens or talks: the press-and-hold recorder, speak questions graded from real speech, the Practice tab (scenarios and campaigns) with spoken AI replies, Hector the AI tutor behind the Pro paywall (RevenueCat over Google Play Billing), "Generate more practice" after a lesson, the AI disclosure gate before any audio or written answer reaches an AI provider, and weakness analysis after conversations.

**Architecture:** `core` gains the `/api/*` AI clients (`AiConversationClient` for chat, tts, stt, analyze-weaknesses, generate-practice; `TutorConversationClient` for hector-respond), `TutorMemoryContext`, `BillingPeriodFormatting`, and a `ConversationTurnEngine` that holds the transcribe-think-speak state machine so every screen shares one tested implementation instead of three copies. `app` gains `TurnRecorder` (MediaRecorder, AAC in an MPEG-4 container, 44.1 kHz mono, 0.4 s minimum, 4096-byte minimum), `RecordingState` (a counter, so the Plan 4 podcast player can pause while any recorder is live), `HoldToTalkButton`, `AiDisclosureGate`, `EntitlementStore` over the RevenueCat SDK, and the screens.

**Tech Stack:** Plan 1 stack plus `com.revenuecat.purchases:purchases:10.23.4` (verified 2026-09-30 on Maven Central). `android.media.MediaRecorder` and `MediaPlayer` from the platform. Permission `RECORD_AUDIO`.

**Spec:** `docs/superpowers/specs/2026-09-29-android-app-design.md` (sections 8 audio and 9 subscription; section 4 rows: speak questions, Practice, Campaigns, Hector, AI disclosure, generated practice, weakness analysis).

**Depends on:** Plans 1 and 2 on `android`.

## Global Constraints

- Audio upload contract: `POST {API_BASE_URL}/api/stt` multipart with field `file` (filename `recording.m4a`, `Content-Type: audio/m4a`), optional `course` (`en`, `fr`, `es`) and optional `debugTiming`; response `{text, confidence?}`. Chat: `POST api/chat` `{messages:[{role,content}], systemPrompt?, cefrLevel?}` returns `{content}`. TTS: `POST api/tts` `{text, voice?}` returns audio bytes. Weakness: `POST api/analyze-weaknesses` `{messages}` returns `{weaknessesDetected}`. Practice: `POST api/generate-practice` `{lessonId, course}` returns `{questions:[{prompt,choices,answerIndex,explanation}]}` with a 45 s timeout. Hector: `POST api/hector-respond` with header `X-Alphonso-Device-Id`, body `{session_id, text, language, agent_id:"tutor", tts_model:"magpie", piper_voice:"mana", history:[{role,content}]}`, response `{request_id, session_id, agent, reply, audio_base64, tts_model, tts_provider, language, state, timings_ms:{llm,tts,total}}`, errors carry `detail`.
- Every one of these calls goes through `ApiHttp` (Plan 1) so the one-retry-on-401 refresh applies.
- The AI disclosure copy is `AIDisclosureSheet.swift`'s, verbatim, stored under the key `aiDisclosureAcknowledged`, and gates: speak question capture, Practice scenarios, Campaigns, Hector, and written translation grading in the lesson player and review queue (the gap carried from Plan 1).
- Recorder constants match iOS: minimum duration 0.4 s, minimum 4096 bytes, AAC 44.1 kHz mono. A press that ends while the microphone permission dialog is still up must stop the recording as soon as it starts (`wantsToStop`), never leave it running.
- `RECORD_AUDIO` is requested on the first press, never at launch. A denial falls back to typing, with the exact iOS copy.
- RevenueCat key comes from `BuildConfig.REVENUECAT_PUBLIC_KEY`; an empty value means the store reports "Subscriptions aren't available in this build yet." and Hector stays behind the paywall. Release builds refuse an empty or `test_` key (spec section 9).
- Entitlement id is `pro`. Play Billing subscription products are the owner's to create in Play Console and RevenueCat (release phase).

## Review Focus

1. A press released before the permission callback returns must stop the recording immediately after it starts; a recording must never outlive the press (Task 3 test on the engine's `wantsToStop` path).
2. An empty transcript (silence) is "didn't catch that", never a wrong answer and never a spent heart (Task 4 test: `picked` stays null).
3. Leaving a conversation mid-recording cancels the recorder and decrements `RecordingState`, so a later podcast never stays paused forever (Task 2 and 3 tests).
4. Hector's priming message is a `user` role turn prepended once per session, never re-added per turn (Task 7 test).
5. `generate-practice` must time out at 45 s with a visible message, never spin forever (Task 8 test with a hanging engine).

---

### Task 1: AI clients in core

**Files:**
- Create: `core/src/main/kotlin/.../core/net/AiConversationClient.kt`, `TutorConversationClient.kt`, `TutorMemoryContext.kt`, `BillingPeriodFormatting.kt`
- Test: matching tests under `core/src/test/.../net/` and `logic/`

**Interfaces:**
- `data class ChatMessage(role, content)`; `data class SttResult(text, confidence: Double?)`; `data class GeneratedPracticeQuestion(prompt, choices, answerIndex, explanation)`; `sealed class AiConversationError { Server(status, message), InvalidPayload, Timeout }`.
- `class AiConversationClient(http: ApiHttp)`: `chat(messages, systemPrompt?, cefrLevel?): String`, `synthesizeSpeech(text, voice?): ByteArray`, `transcribe(audio: ByteArray, mimeType, course?, debugTiming?): SttResult`, `analyzeWeaknesses(transcript): Int`, `generatePractice(lessonId, course): List<GeneratedPracticeQuestion>` (45 s timeout via `withTimeout`).
- `ApiHttp` gains `postMultipart(path, parts: List<MultipartPart>)` and `postRaw(path, body)` returning bytes.
- `data class TutorReply(requestId, sessionId, agent, reply, audioBase64, ttsModel, ttsProvider, language, state, timingsMs)`; `class TutorConversationClient(http: ApiHttp, deviceId)`: `respond(sessionId, text, language, history, agentId = "tutor", ttsModel = "magpie", piperVoice = "mana"): TutorReply`; `TutorReply.audioBytes(): ByteArray?` decodes base64, null when empty.
- `object TutorMemoryContext { fun buildPrimingMessage(cefrLevel: String?, openWeaknessCategories: List<String>): ChatMessage? }` (exact copy of the Swift wording, first three categories, hyphens to spaces).
- `enum class BillingPeriodUnit { DAY, WEEK, MONTH, YEAR }`; `fun billingPeriodDescription(unit, value): String` ("Billed daily/weekly/monthly/yearly" for 1, "Billed every N days/weeks/months/years" otherwise).

- [ ] **Step 1: Failing tests** — multipart body contains `name="file"; filename="recording.m4a"`, `Content-Type: audio/m4a`, the raw bytes, and the `course` part when given; chat posts messages and optional fields and decodes `content`; tts returns the raw bytes; analyze decodes `weaknessesDetected`; generatePractice decodes questions and maps a hanging engine to `Timeout` (use a `MockEngine` that `delay`s past the timeout under `runTest`'s virtual clock); tutor client sends the device header and body fields and decodes the snake_case reply; priming message vectors (level only, categories only, both, neither → null); billing period vectors.
- [ ] **Step 2 to 5:** compile failure, implement, pass, commit `feat(android-core): AI conversation, tutor and practice clients`.

---

### Task 2: Recorder and recording state

**Files:**
- Create: `app/src/main/java/.../audio/RecordingState.kt`, `TurnRecorder.kt`, `MicPermission.kt`
- Modify: `AndroidManifest.xml` (`RECORD_AUDIO`)
- Test: `app/src/test/java/.../audio/RecordingStateTest.kt`; `app/src/androidTest/java/.../audio/TurnRecorderTest.kt` (starts and stops a recording on the emulator and asserts the file is an MPEG-4 container above 4096 bytes after 0.5 s)

**Interfaces:**
- `object RecordingState { val isRecording: StateFlow<Boolean>; fun began(); fun ended() }` (counter, never below zero).
- `class TurnRecorder(context)`: `fun start()` (throws on failure, calls `RecordingState.began()` first and `ended()` on failure), `fun remainingMillisToMinimumDuration(): Long?`, `fun elapsedMillis(): Long?`, `suspend fun stop(): ByteArray?` (returns the file bytes, deletes the temp file, `RecordingState.ended()`), `fun cancelIfRecording()`. Constants `MINIMUM_AUDIO_BYTES = 4096`, `MINIMUM_DURATION_MS = 400`. MediaRecorder: `AudioSource.MIC`, `OutputFormat.MPEG_4`, `AudioEncoder.AAC`, 44100 Hz, 1 channel, 96 kbps.
- `MicPermission.request(activity, onResult: (Boolean) -> Unit)` via `ActivityResultContracts.RequestPermission` registered in `MainActivity` and exposed through the container.

- [ ] **Step 1: Failing tests** — counter semantics; the instrumentation recording round trip.
- [ ] **Step 2 to 5:** implement, test (`:app:testDebugUnitTest` locally, instrumentation on CI), commit `feat(android): press-and-hold turn recorder and recording state`.

---

### Task 3: Conversation turn engine and hold-to-talk button

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/ConversationTurnEngine.kt` (pure state machine over injected suspend functions)
- Create: `app/src/main/java/.../audio/HoldToTalkButton.kt`, `AudioPlayback.kt` (MediaPlayer over a temp file), `ui/ai/AiDisclosureGate.kt`
- Test: `core/src/test/.../logic/ConversationTurnEngineTest.kt`

**Interfaces:**
- `class ConversationTurnEngine(recorder: RecorderPort, requestMic: suspend () -> Boolean, transcribe: suspend (ByteArray) -> SttResult, nowMillis)`, where `interface RecorderPort { fun start(); fun remainingMillisToMinimumDuration(): Long?; fun elapsedMillis(): Long?; suspend fun stop(): ByteArray?; fun cancelIfRecording() }`. State: `Idle, RequestingMic, Recording, Transcribing`; events `pressBegan()`, `pressEnded()`, `tearDown()`; results as a `Flow<TurnEvent>` (`Transcribed(text, confidence)`, `Empty`, `MicDenied`, `Failed(message)`). Implements the iOS generation counter, `wantsToStop`, the minimum-duration wait and the byte floor.
- `@Composable fun HoldToTalkButton(engine state, tint, label, onPressBegan, onPressEnded)` using `pointerInput` `detectTapGestures(onPress = { ...; tryAwaitRelease(); ... })`, 72 dp circle, ember/destructive while recording, accessibility label "Hold to talk".
- `class AudioPlayback(context)`: `suspend fun play(bytes: ByteArray)` and `stop()`.
- `object AiDisclosure { fun isAcknowledged(prefs); fun acknowledge(prefs) }` and `@Composable fun AiDisclosureGate(prefs, content)` showing a non-dismissable dialog with the iOS copy, "Read our Privacy Policy" link and "Got it".

- [ ] **Step 1: Failing engine tests** — press then release after grant records and transcribes; release during the permission wait stops right after start (Review Focus 1); denial emits `MicDenied` and returns to idle; a transcript below the byte floor emits `Empty`; `tearDown` mid-recording cancels and never emits; a second press after teardown is ignored; generation guard drops a stale stop.
- [ ] **Step 2 to 5:** implement, test, `assembleDebug`, commit `feat(android): conversation turn engine, hold-to-talk button, AI disclosure gate`.

---

### Task 4: Speak questions from real speech

**Files:**
- Modify: `ui/lesson/QuestionCard.kt` (Speak branch → `SpeakQuestionCard`), create `ui/lesson/SpeakQuestionCard.kt`
- Modify: `LessonScreen.kt` and `ReviewScreen.kt` to wrap in `AiDisclosureGate`
- Test: `app/src/test/java/.../ui/lesson/SpeakQuestionViewModelTest.kt`

**Interfaces:**
- `SpeakQuestionViewModel(engine factory, client: AiConversationClient, course, isConnected)` exposing `phase`, `heard`, `error`, `micUnavailable`; on `Transcribed` sets `picked` through the card's `onPick` when `SpokenAnswer.normalise(text)` is non-empty, else "Didn't catch that. Try again." (Review Focus 2). Offline or mic-unavailable shows the typing fallback with the iOS copy. "Hear it first" speaks the phrase with `Speech`.

- [ ] **Step 1: Failing tests** — silence leaves `picked` null and shows the message; a transcript becomes `picked`; offline uses the fallback; denial flips `micUnavailable` with the Settings copy.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): speak questions graded from speech, AI disclosure on grading screens`.

---

### Task 5: Practice tab, scenarios

**Files:**
- Create: `ui/practice/PracticeScreen.kt`, `ConversationSessionViewModel.kt`, `ConversationScreen.kt`
- Modify: `RootScreen.kt` (Practice tab and `practice/scenario/{id}`, `practice/campaign/{id}` routes)
- Test: `app/src/test/java/.../ui/practice/ConversationSessionViewModelTest.kt`

**Interfaces:**
- `ConversationSessionViewModel(scenario, client: AiConversationClient, progressClient, engine, playback, isConnected)`: `turns`, `phase` (idle/transcribing/thinking/speaking), `error`, `confidenceByTurn`; opener as the first assistant turn; `cefrLevel` from `fetchCefrLevel("en")`; on transcript: append user turn, `chat(turns, scenario.systemPrompt, cefrLevel)`, append reply, `synthesizeSpeech(reply)` and play; `onLeave()` cancels the recorder and, when at least four turns exist, fires `analyzeWeaknesses` best effort. Clarity label thresholds 0.85 and 0.6.

- [ ] **Step 1: Failing tests** — the turn pipeline posts the right bodies in order; a server error message surfaces verbatim; leaving with four turns analyses, with three does not.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): Practice tab with spoken scenarios`.

---

### Task 6: Campaigns

**Files:**
- Create: `ui/practice/CampaignSessionViewModel.kt`, `CampaignScreen.kt`
- Test: `app/src/test/java/.../ui/practice/CampaignSessionViewModelTest.kt`

**Interfaces:**
- Extends the scenario pipeline with `sceneIndex`, `sceneAnchor`, `finished`, `canContinue = userTurnsInScene >= scene.minTurns`, `continueToNextScene()` (appends the next opener, moves the anchor), `restartScene()` (truncates to the anchor), system prompt `"${premise}\n\n${scene.systemPrompt}"`.

- [ ] **Step 1: Failing tests** — continue is gated on `minTurns` user turns within the current scene only; restart keeps the opener; the last scene finishes.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): campaigns`.

---

### Task 7: Entitlements, paywall and Hector

**Files:**
- Create: `app/src/main/java/.../billing/EntitlementStore.kt`, `ui/hector/PaywallScreen.kt`, `ui/hector/HectorScreen.kt`, `HectorViewModel.kt`
- Modify: `app/build.gradle.kts` (RevenueCat dependency; release `buildConfigField` check that refuses empty or `test_` keys), `AlphonsoApplication.kt` (configure `Purchases` when the key is non-empty), `RootScreen.kt` (Hector tab: paywall unless Pro), `SettingsScreen.kt` ("Manage subscription" link to `https://play.google.com/store/account/subscriptions`)
- Test: `app/src/test/java/.../ui/hector/HectorViewModelTest.kt`, `billing/EntitlementStoreTest.kt` (over a `BillingPort` interface so RevenueCat is not needed on the JVM)

**Interfaces:**
- `interface BillingPort { suspend fun logIn(userId): Boolean; suspend fun isPro(): Boolean; suspend fun packages(): List<BillingPackage>; suspend fun purchase(pkg): Boolean; suspend fun restore(): Boolean }` with `RevenueCatBilling` implementing it; `data class BillingPackage(id, priceString, periodUnit: BillingPeriodUnit?, periodValue: Int)`.
- `EntitlementStore(port?)`: `isPro`, `packages`, `isLoading`, `error`, `login(userId)`, `refresh()`, `loadOffering()`, `purchase(pkg)`, `restorePurchases()`; a null port yields the "not available in this build" copy.
- `HectorViewModel(tutor: TutorConversationClient, ai: AiConversationClient, progressClient, engine, playback)`: builds `memoryContext` once from `fetchCefrLevel("en")` and open weakness categories, sends `history = listOfNotNull(memoryContext) + turns` (Review Focus 4), plays `reply.audioBytes()`, analyses on leave after four turns. Tint is ember; the assistant bubble carries Hector's portrait.

- [ ] **Step 1: Failing tests** — store with a null port; store over a fake port (login sets `isPro`, purchase failure message, restore); Hector: priming message present exactly once across three turns, device header sent, `detail` error surfaced, reply audio decoded.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): RevenueCat entitlements, paywall and Hector`.

---

### Task 8: Generated practice after a lesson

**Files:**
- Modify: `ui/lesson/LessonScreen.kt` (finish screen section), create `ui/lesson/GeneratedPracticeViewModel.kt`
- Test: `app/src/test/java/.../ui/lesson/GeneratedPracticeViewModelTest.kt`

**Interfaces:**
- `GeneratedPracticeViewModel(client, lessonId, course)`: `status` (idle/loading/ready/empty/error/timeout), `questions`, `idx`, `picked`, `checked`, `generate()`, `pick()`, `check()`, `next()`; copy from `GeneratedPracticeSection` in `LessonPlayerView.swift` ("This can take up to 30 seconds.", "Couldn't generate practice for this lesson right now.", "Something went wrong. Try again.").

- [ ] **Step 1: Failing tests** — ready flow through three questions; empty list → empty; timeout → error copy (Review Focus 5).
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): generated practice on the lesson finish screen`.

---

### Task 9: Docs and CI

- [ ] Update `android/LearnWithAlphonso/README.md` (Plan 3 row "in"; the RECORD_AUDIO permission rationale; RevenueCat key and Play products as owner actions), `ARCHITECTURE.md` Android section, `CHANGELOG.md`; remove the "known gap" paragraph.
- [ ] Push and watch `android-ci.yml` to green, including the emulator recorder test.

## Self-review

- Spec coverage: section 8 audio → Tasks 2 to 4; section 9 subscription → Task 7; Practice, Campaigns, Hector, generated practice, weakness analysis, disclosure → Tasks 3 to 8.
- Placeholders: none; every request and response shape is spelled out in Global Constraints from the Swift clients and `src/routes/api/*`.
- Type consistency: `ChatMessage`, `SttResult`, `TutorReply`, `BillingPackage`, `BillingPeriodUnit`, `RecorderPort`, `TurnEvent` are defined once (Tasks 1 to 3) and consumed by name later.
- Review Focus: 1 and 3 in Tasks 2 and 3, 2 in Task 4, 4 in Task 7, 5 in Task 8.
