import SwiftUI
import LearnWithAlphonsoKit

/// Pro-only "Hector": an AI voice tutor persona alongside the free
/// scenarios in ConversationView. Runs entirely on the main account (the
/// 2026-09-27 decouple): /api/stt for speech and /api/hector-respond for the
/// reply and its audio. It speaks the learner's active course at
/// their CEFR level with that course's native voice.
struct HectorView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore
    /// Set when Hector is shown as a sheet (from lesson complete): adds a Done button.
    var onClose: (() -> Void)? = nil
    /// The learner's streak as the Learn tab shows it, for the suggestion chips ("Keep my 12-day streak").
    var streakDays: Int = 0
    /// Lets the call-ended screen open the placement test. Nil (the lesson sheet) means no placement offer.
    var contentStore: ContentStore? = nil

    /// Pro just landed: the paywall stays up for Hector's welcome before the conversation replaces it.
    @State private var showingWelcome = false

    var body: some View {
        NavigationStack {
            Group {
                if !entitlementStore.isPro || showingWelcome {
                    PaywallView(entitlementStore: entitlementStore, source: .hectorTab, onWelcome: { showingWelcome = $0 })
                } else {
                    HectorConversationView(
                        session: session,
                        entitlementStore: entitlementStore,
                        course: activeCourse.course,
                        conversationStore: conversationStore,
                        streakDays: streakDays,
                        contentStore: contentStore,
                        onClose: onClose
                    )
                    // A course switch is a fresh Hector
                    // in the new language; each course keeps its own thread.
                    .id(activeCourse.course)
                    // The still library stays behind the conversation. The free state is the paywall, which paints
                    // Hector's living clip itself.
                    .screenScene(.hector)
                }
            }
            .navigationTitle("Hector")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onClose {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onClose)
                    }
                }
            }
        }
        .tint(AlphonsoDS.current.choice)
    }
}

private struct HectorConversationView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let course: Course
    let conversationStore: ConversationStore
    let streakDays: Int
    let contentStore: ContentStore?
    /// Set when Hector is a sheet (from lesson complete): hanging up closes it, since the call hides its Done button.
    let onClose: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.alphonsoDS) private var ds
    /// The safety note is shown once per device, before the first time hands-free is turned on.
    @AppStorage(HandsFreeCopy.noteSeenKey) private var handsFreeNoteSeen = false
    @State private var showHandsFreeNote = false
    /// The composer's text, and the open weak spot the suggestion chips are built from.
    @State private var draft = ""
    @State private var weakSpot: String?
    /// Hector's corrections, by the index of the learner's turn each answers (shown as a card under that bubble).
    @State private var corrections: [Int: HectorCorrection] = [:]
    /// Bumped by "Try again" where there is no microphone, to put the cursor in the composer.
    @State private var composerFocusCue = 0

    @State private var conversation = ConversationSnapshot()
    @State private var voice = VoiceSessionController()
    /// Bumped when Hector's greeting should be spoken: once his learner context has loaded, and on "Call again".
    @State private var openerCue = 0
    /// Stops a tapped recording that was never stopped (HectorRecordingCap).
    @State private var recordingCap: Task<Void, Never>?
    @State private var notice: String?
    @State private var cefrLevel: String?
    /// V3 package 3b "tutor persona memory": open weaknesses, prepended to
    /// every respond() history but never shown as a bubble.
    @State private var memoryContext: TutorConversationMessage?
    /// The word the learner tapped in one of Hector's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var showPaywall = false
    /// Settings: "Show Alphonso while practicing" (default on) covers Hector's call too: one switch decides.
    @AppStorage(AvatarPreference.key) private var showCall = AvatarPreference.defaultValue
    /// Hector's endpoint returns no verdict on the learner's turn, so this never changes and he does not react to
    /// right or wrong answers.
    private let replyVerdict = AvatarReplyVerdict()
    /// Hanging up stops the session; "Call again" starts it again. Hector is a tab, so there is no screen to leave.
    @State private var callEnded = false
    /// The placement offer after a call: for "some" and "confident" learners who have not taken it (PlacementOffer).
    @State private var firstRunLevel: String?
    @State private var placementTaken = true
    @State private var offerDismissed = false
    @State private var showingPlacement = false
    /// @State, not `let`: a View struct is re-created on every render, and a
    /// `let UUID()` minted a new session id each time.
    @State private var sessionID = UUID().uuidString

    private var key: ConversationKey { .hector(course: course) }

    /// The status pill and Hector's pose come from the voice state the screen already has.
    private var status: HectorStatus? { HectorStatus.from(phase: voice.phase, handsFree: voice.handsFreeStatus) }

    var body: some View {
        Group {
            if showCall { callScreen } else { classicScreen }
        }
        // Hector speaks first (BACKLOG 0.0-bp): his greeting, in his own chosen voice, through the reply player like
        // Alphonso's opener. Inside the AI gate, so nothing is fetched before consent; repeats come from
        // OpenerSpeechCache. pendingOpener is nil once the learner has answered.
        .task(id: openerCue) {
            guard openerCue > 0 else { return }
            await voice.speakOpener(conversation.pendingOpener, session: session, course: course, speaker: .hector)
            voice.applyStoredHandsFreePreference(sceneActive: scenePhase == .active)
        }
        .aiDisclosureGate()
        // .notEntitled opens the paywall. The server's RevenueCat check
        // can disagree with the local isPro (lapsed, refunded, other device).
        .sheet(isPresented: $showPaywall) {
            PaywallView(entitlementStore: entitlementStore, source: .hectorRefused, onClose: { showPaywall = false })
        }
        .onAppear {
            Analytics.track(.hectorOpened)
            conversation = conversationStore.snapshot(for: key, seededWith: nil)
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
        }
        .task(id: course) { await loadLearnerContext() }
        .onDisappear {
            HectorFixSpeaker.shared.stop()
            recordingCap?.cancel()
            voice.disappeared()
            voice.onCapture = nil
            analyzeWeaknessesIfNew()
        }
    }

    private var transcript: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(conversation.turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, isOpener: conversation.openerIndices.contains(index)).id(index)
                            if turn.role == "user", let correction = corrections[index] {
                                correctionCard(correction)
                            }
                        }
                        if !suggestionChips.isEmpty {
                            HectorChipsRow(chips: suggestionChips, onTap: { sendTyped($0.message) })
                        }
                    }
                    .padding()
                }
                .onChange(of: conversation.turns.count) {
                    if reduceMotion {
                        proxy.scrollTo(conversation.turns.count - 1, anchor: .bottom)
                    } else {
                        withAnimation { proxy.scrollTo(conversation.turns.count - 1, anchor: .bottom) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var saveWordHint: some View {
        if conversation.turns.contains(where: { $0.role == "assistant" }) {
            Text("Tap any word in Hector's reply to save it.")
                .dsText(.caption)
                .foregroundStyle(AlphonsoDS.current.inkSoft)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .alphonsoGlass(radius: AlphonsoRadius.lg)
        }
    }

    /// The setting off: the converged tutor screen (header, transcript with the greeting and chips, composer).
    private var classicScreen: some View {
        VStack(spacing: 0) {
            HectorHeader(
                art: MascotArt.assetName(for: HectorStatus.moment(for: status)),
                status: status, courseName: languageName, handsFreeOn: voice.isHandsFreeOn,
                onClose: onClose, menu: { overflowMenu })
            transcript

            if let message = voice.failure?.userMessage() ?? notice ?? microphoneMessage {
                Text(message)
                    .dsText(.footnote)
                    .foregroundStyle(AlphonsoDS.current.wrongInk)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .alphonsoGlass(radius: AlphonsoRadius.lg)
                    .padding(.horizontal)
            }

            saveWordHint

            if voice.isHandsFreeOn { handsFreeControls.padding(.top, 6) }
            composer
        }
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: status) { _, new in
            // The header's status is announced, not only drawn.
            if let new { AccessibilityNotification.Announcement("Hector is \(new.label.lowercased())").post() }
        }
        .alert(HandsFreeCopy.firstUseTitle, isPresented: $showHandsFreeNote) {
            Button(HandsFreeCopy.firstUseConfirm) {
                handsFreeNoteSeen = true
                voice.learnerSetHandsFree(true)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(HandsFreeCopy.firstUseBody(partner: "Hector"))
        }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    /// Under the composer's mic: why it did not start (access off, or the recorder would not open).
    private var microphoneMessage: String? {
        if voice.isHandsFreeOn { return nil }
        if voice.microphoneUnavailable { return VoiceCopy.microphoneOff }
        if voice.recorderStartFailed { return VoiceCopy.microphoneCouldNotStart }
        return nil
    }

    /// What the old header bar held: the hands-free switch (with its first-use note) and Pause/Resume.
    @ViewBuilder
    private var overflowMenu: some View {
        Button {
            if voice.isHandsFreeOn {
                voice.learnerSetHandsFree(false)
            } else if !handsFreeNoteSeen {
                showHandsFreeNote = true
            } else {
                voice.learnerSetHandsFree(true)
            }
        } label: {
            Label(voice.isHandsFreeOn ? "Turn hands-free off" : HandsFreeCopy.toggle,
                  systemImage: voice.isHandsFreeOn ? "mic.slash" : "mic.badge.plus")
        }
        .accessibilityIdentifier("hectorHandsFreeToggle")
        if voice.isHandsFreeOn {
            Button {
                voice.toggleHandsFreePause()
            } label: {
                Label(handsFreePaused ? HandsFreeCopy.resume : HandsFreeCopy.pause,
                      systemImage: handsFreePaused ? "play.fill" : "pause.fill")
            }
        }
    }

    private var handsFreePaused: Bool {
        if case .paused = voice.handsFreeStatus { return true }
        return false
    }

    // MARK: - Composer and chips

    private var composer: some View {
        HectorComposer(
            text: $draft, isListening: voice.isRecording, isBusy: voice.isBusy,
            handsFreeOn: voice.isHandsFreeOn,
            level: { voice.inputLevelDBFS() }, reduceMotion: reduceMotion,
            onSend: { sendTyped(draft) },
            onMic: { startTappedRecording() },
            onStop: { stopTappedRecording() },
            focusCue: composerFocusCue)
    }

    /// The correction under the learner's bubble. "Hear it" is the device's own voice; "Try again" re-arms the mic.
    private func correctionCard(_ correction: HectorCorrection) -> some View {
        HectorCorrectionCard(
            correction: correction,
            canHear: HectorFixSpeaker.canSpeak(course),
            tryAgainDisabled: voice.isBusy || voice.isRecording,
            hearDisabled: voice.isRecording || voice.handsFreeStatus == .listening || voice.handsFreeStatus == .hearing,
            onHear: {
                voice.stopReplyPlayback()
                HectorFixSpeaker.shared.speak(correction.fix, course: course)
            },
            onTryAgain: { tryAgain() })
    }

    /// "Try again": the phrase, said once more. The tap-to-talk path (so its cap applies); in hands-free the loop opens
    /// the mic itself once nothing is playing; with no microphone it puts the cursor in the composer.
    private func tryAgain() {
        HectorFixSpeaker.shared.stop()
        if voice.isHandsFreeOn { return }
        if voice.microphoneUnavailable || voice.recorderStartFailed {
            composerFocusCue += 1
        } else {
            startTappedRecording()
        }
    }

    /// Chips show under the greeting until the learner has said something.
    private var suggestionChips: [HectorChip] {
        let hasLearnerTurn = conversation.turns.contains { $0.role == "user" }
        guard !conversation.turns.isEmpty, !hasLearnerTurn else { return [] }
        return HectorChips.build(course: course, weakSpot: weakSpot, streakDays: streakDays)
    }

    /// A typed message (or a tapped chip) is a learner turn like a spoken one, minus the speech-to-text step.
    /// `beginOpener` claims the voice session the way a press does: it refuses while a turn is in flight.
    private func sendTyped(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let generation = voice.beginOpener() else { return }
        draft = ""
        notice = nil
        conversation = conversationStore.append(ChatMessage(role: "user", content: text), to: key)
        Task {
            await respond(to: text, generation: generation)
            // The spoken path always ends its turn (a defer in VoiceSessionController); so does this one, so a future
            // early return in respond can never leave the phase stuck in .thinking.
            voice.turnFinished(generation)
        }
    }

    /// The mic button taps to start, and stops and sends after HectorRecordingCap.seconds if nothing else did (a held
    /// button was bounded by the finger; a tapped one is not).
    private func startTappedRecording() {
        guard voice.pressBegan() else { return }
        notice = nil
        recordingCap?.cancel()
        recordingCap = Task {
            try? await Task.sleep(for: .seconds(HectorRecordingCap.seconds))
            if !Task.isCancelled, voice.isRecording { voice.pressEnded() }
        }
    }

    private func stopTappedRecording() {
        recordingCap?.cancel()
        voice.pressEnded()
    }

    /// The setting on (the default): the full-screen call. Hands-free keeps its Pause/Resume button and status line on
    /// the call; its on/off switch, the transcript with its save-word hint and report buttons are in the sheet.
    private var callScreen: some View {
        Group {
            if callEnded {
                callEndedView
            } else {
                PracticeCallView(
                    title: "Your AI tutor", kit: .hector, talkLabel: "Hold to talk to Hector",
                    scenarioID: "hector", voice: voice, course: course,
                    turns: conversation.turns, replyVerdict: replyVerdict,
                    notice: notice,
                    onPress: { if voice.pressBegan() { notice = nil } },
                    onEnd: { endCall() },
                    sheet: {
                        VStack(spacing: 0) {
                            handsFreeToggle
                            transcript
                            saveWordHint
                        }
                        // The same composer as the classic screen (one send path): type and send, or tap the mic. Pinned
                        // to the bottom safe area, so the field rides above the keyboard and the transcript scrolls.
                        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
                        // The save-word sheet opens from inside the conversation sheet, so it is presented from here.
                        .sheet(item: $savingWord) { request in
                            SaveWordSheet(request: request, session: session)
                        }
                        // The hands-free switch is in this sheet, and a view under a presented sheet cannot present
                        // an alert: the first-use safety note is presented from here too.
                        .alert(HandsFreeCopy.firstUseTitle, isPresented: $showHandsFreeNote) {
                            Button(HandsFreeCopy.firstUseConfirm) {
                                handsFreeNoteSeen = true
                                voice.learnerSetHandsFree(true)
                            }
                            Button("Cancel", role: .cancel) {}
                        } message: {
                            Text(HandsFreeCopy.firstUseBody(partner: "Hector"))
                        }
                    }
                )
            }
        }
        // Full screen during the call; once it has ended the bars come back, so the learner can leave the tab.
        .toolbar(callEnded ? .visible : .hidden, for: .navigationBar)
        .toolbar(callEnded ? .visible : .hidden, for: .tabBar)
        .onChange(of: voice.handsFreeStatus) { _, new in
            // As on the classic screen: a fresh hands-free turn clears the last notice.
            if new == .listening { notice = nil }
        }
    }

    private func endCall() {
        voice.setHandsFree(false)
        voice.disappeared()
        // As a sheet the call hid its Done button, so hanging up closes it; on the tab it shows "Call ended".
        if let onClose { onClose() } else { callEnded = true }
    }

    private var offersPlacement: Bool {
        contentStore != nil && PlacementOffer.style(
            level: firstRunLevel, placementTaken: placementTaken, dismissed: offerDismissed, surface: .hectorEnd) == .prominent
    }

    private var callEndedView: some View {
        VStack(spacing: AlphonsoDS.Space.s4) {
            DSEmptyState(
                art: "Hector-happy", title: "Call ended",
                actionTitle: "Call again",
                action: {
                    callEnded = false
                    voice.appeared()
                    openerCue += 1
                })
            if offersPlacement {
                PlacementOfferCard(
                    onStart: { showingPlacement = true },
                    onNotNow: {
                        PlacementOfferLoader.dismiss(courseCode: course.translationCourseCode)
                        offerDismissed = true
                    })
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: course.translationCourseCode) {
            let code = course.translationCourseCode
            offerDismissed = PlacementOfferLoader.isDismissed(courseCode: code)
            firstRunLevel = await PlacementOfferLoader.firstRunLevel(session: session)
            let taken = await PlacementOfferLoader.placementTaken(session: session, courseCode: code)
            guard !Task.isCancelled else { return }
            placementTaken = taken
        }
        .fullScreenCover(isPresented: $showingPlacement) {
            if let contentStore {
                PlacementView(contentStore: contentStore, session: session, course: course) {
                    showingPlacement = false
                    placementTaken = true
                }
            }
        }
    }

    /// The hands-free switch, with its once-per-device safety note.
    private var handsFreeToggle: some View {
        Toggle(HandsFreeCopy.toggle, isOn: Binding(
            get: { voice.isHandsFreeOn },
            set: { on in
                if on, !handsFreeNoteSeen {
                    showHandsFreeNote = true
                } else {
                    voice.learnerSetHandsFree(on)
                }
            }
        ))
        .dsText(.footnote)
        .tint(ds.choice)
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.bottom, 6)
        .accessibilityIdentifier("hectorHandsFreeToggle")
    }

    // MARK: - Hero

    private var languageName: String {
        switch course {
        case .english: return "English"
        case .french: return "French"
        case .spanish: return "Spanish"
        }
    }

    // MARK: - Context

    /// Best-effort: a failed fetch just means this session starts without
    /// level or memory, the same as a brand-new learner.
    private func loadLearnerContext() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let level = (try? await client.fetchCefrLevel(course: course.wireCode)) ?? nil
        let trend = (try? await client.fetchWeaknessTrend()) ?? []
        // A name the learner chose; an unconfirmed one is a generated handle.
        let nameStatus = (try? await client.fetchNameStatus()) ?? nil
        let openCategories = trend.filter { $0.openCount > 0 }.map(\.category)
        cefrLevel = level
        memoryContext = TutorMemoryContext.buildPrimingMessage(cefrLevel: level, openWeaknessCategories: openCategories)
        // Today's allowance is used up (BACKLOG 0.0-bq #5): the "out for today" message and no greeting, so no speech.
        // The limit is the server's to say (GET /api/app-config); with none known Hector greets and the server still guards.
        let limit = await HectorAllowance.fetchLimit(baseURL: AppConfig.apiBaseURL)
        if await client.fetchHectorAllowanceUsedUp(limit: limit) {
            notice = HectorAllowance.outForToday
            return
        }
        // Hector speaks first: a conversation with no turns yet opens with his greeting (built locally, no LLM call).
        weakSpot = HectorGreeting.recentWeakSpot(trend)
        conversation = conversationStore.openWithGreeting(key, greeting: HectorGreeting.build(
            course: course, cefrLevel: level,
            name: nameStatus?.nameConfirmed == true ? nameStatus?.displayName : nil,
            weakSpot: HectorGreeting.recentWeakSpot(trend)))
        openerCue += 1
    }

    // MARK: - Bubbles

    @ViewBuilder
    private func bubbleText(for turn: ChatMessage, isOpener: Bool) -> some View {
        if turn.role == "assistant" {
            // The greeting is our own fixed text, not the model's: nothing to report.
            AssistantReply(
                turn: turn, isOpener: isOpener, course: course, color: AlphonsoDS.current.ink,
                surface: .hector, session: session, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(AlphonsoDS.current.onChoice)
        }
    }

    /// Hector's small round face beside each of his bubbles.
    private var miniAvatar: some View {
        Image(MascotArt.assetName(for: .hectorIdle))
            .resizable()
            .scaledToFill()
            .frame(width: 30, height: 30, alignment: .top)
            .background(AlphonsoDS.current.heroA)
            .clipShape(Circle())
            .accessibilityHidden(true)
    }

    private func bubble(for turn: ChatMessage, isOpener: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom, spacing: 6) {
                if turn.role == "user" { Spacer(minLength: 40) }
                if turn.role == "assistant" { miniAvatar }
                bubbleText(for: turn, isOpener: isOpener)
                    .dsText(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        turn.role == "user" ? AlphonsoDS.current.choice : AlphonsoDS.current.card,
                        in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    )
                    .alphonsoLift(turn.role == "assistant")
                if turn.role == "assistant" { Spacer(minLength: 40) }
            }
            // "Say that in <language>": Hector's own calls spend his Pro allowance (surface "hector").
            AssistantExplainRow(turn: turn, isOpener: isOpener, course: course, surface: .hector, session: session)
                .padding(.leading, 4)
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    // MARK: - Mic

    /// While hands-free is on there is no hold button: a status line, and one Pause or Resume button.
    private var handsFreeControls: some View {
        let status = voice.handsFreeStatus
        let paused: Bool = { if case .paused = status { return true } else { return false } }()
        return VStack(spacing: 8) {
            if let line = HandsFreeCopy.statusLine(status) {
                Text(line)
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Button(paused ? HandsFreeCopy.resume : HandsFreeCopy.pause) {
                voice.toggleHandsFreePause()
            }
            .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            .accessibilityIdentifier("hectorHandsFreePause")
            if voice.microphoneUnavailable || voice.recorderStartFailed {
                Text(voice.microphoneUnavailable ? VoiceCopy.microphoneOff : VoiceCopy.microphoneCouldNotStart)
                    .dsText(.caption)
                    .foregroundStyle(ds.wrongInk)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, AlphonsoSpacing.md)
        .onChange(of: status) { _, new in
            // A pause is a safety stop the learner must hear about; updatesFrequently does not announce it.
            if case .paused = new, let line = HandsFreeCopy.statusLine(new) {
                AccessibilityNotification.Announcement(line).post()
            }
            if new == .listening { notice = nil }
        }
    }

    // MARK: - Turn

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            // Hands-free has no button to hold; its own status line says what happens next.
            notice = voice.isHandsFreeOn ? nil : "Didn't catch that. Hold the button while you speak."
        case let .audio(audio, generation, debugTiming):
            await runTurn(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func runTurn(audio: Data, generation: Int, debugTiming: String) async {
        let courseCode = course.wireCode
        guard let accessToken = await session.freshAccessToken() else {
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let refresh: @Sendable () async -> String? = { await session.freshAccessToken(forceRefresh: true) }
        let sttClient = AIConversationClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { accessToken }, refreshAccessToken: refresh)
        do {
            let stt = try await sttClient.transcribe(
                audio: audio, mimeType: "audio/m4a", course: courseCode, debugTiming: debugTiming)
            let text = stt.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                if voice.isHandsFreeOn {
                    // Background noise, not speech: pause rather than keep sending what the room sounds like.
                    voice.handsFreeHeardNoWords()
                } else {
                    notice = "Didn't catch that — try again."
                }
                return
            }
            conversation = conversationStore.append(ChatMessage(role: "user", content: text), to: key)
            voice.transcribed(generation)
            await respond(to: text, generation: generation)
        } catch {
            let tutorError = TutorError.from(error)
            voice.fail(generation, tutorError)
            if tutorError == .notEntitled { showPaywall = true }
        }
    }

    /// The reply to a learner turn already appended to the conversation, spoken or typed, under `generation`.
    private func respond(to text: String, generation: Int) async {
        let key = self.key
        let courseCode = course.wireCode
        guard let accessToken = await session.freshAccessToken() else {
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let refresh: @Sendable () async -> String? = { await session.freshAccessToken(forceRefresh: true) }
        let tutorClient = TutorConversationClient(
            endpoint: AppConfig.hectorRespondEndpoint, accessToken: { accessToken }, refreshAccessToken: refresh)
        do {
            var snapshot = conversationStore.snapshot(for: key) ?? conversation

            // The current utterance goes only in `text`; the
            // history is every turn BEFORE it. The server appends `text` itself.
            let priorTurns = snapshot.recentTurns.dropLast().map { TutorConversationMessage(role: $0.role, content: $0.content) }
            let reply = try await tutorClient.respond(
                sessionID: sessionID,
                text: text,
                course: courseCode,
                cefrLevel: cefrLevel,
                history: (memoryContext.map { [$0] } ?? []) + priorTurns,
                // Hector's own voice for this course (Settings > Voices), never Alphonso's.
                voice: VoicePrefsCache().voice(.hector, course: courseCode)
            )
            // The server already took the block out; parsing the reply here too means a tag can never be shown.
            let parsed = HectorCorrections.extract(reply.reply)
            snapshot = conversationStore.append(
                ChatMessage(role: "assistant", content: parsed.text.isEmpty ? "…" : parsed.text), to: key)
            conversation = snapshot
            // The card belongs under the learner's turn this reply answers: the one just before it.
            if let correction = reply.correction ?? parsed.correction, snapshot.turns.count >= 2 {
                corrections[snapshot.turns.count - 2] = correction
            }

            if let audioData = reply.audioData {
                if !voice.play(audioData, generation: generation) {
                    notice = "Got a reply, but couldn't play it back."
                }
            } else {
                voice.replyWithoutAudio(generation)
            }
        } catch {
            let tutorError = TutorError.from(error)
            voice.fail(generation, tutorError)
            if tutorError == .notEntitled { showPaywall = true }
        }
    }

    private func analyzeWeaknessesIfNew() {
        let snapshot = conversationStore.snapshot(for: key) ?? conversation
        guard snapshot.turns.count >= 4, snapshot.turns.count > snapshot.analyzedTurnCount,
              let accessToken = session.accessToken else { return }
        conversationStore.update(key) { $0.analyzedTurnCount = snapshot.turns.count }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
        let transcript = snapshot.recentTurns
        let courseCode = course.wireCode
        Task { _ = try? await client.analyzeWeaknesses(transcript: transcript, course: courseCode) }
    }
}

private extension TutorReply {
    var audioData: Data? {
        guard !audioBase64.isEmpty else { return nil }
        return Data(base64Encoded: audioBase64)
    }
}
