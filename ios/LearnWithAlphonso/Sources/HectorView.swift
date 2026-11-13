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
        .tint(AlphonsoColor.ember)
    }
}

private struct HectorConversationView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let course: Course
    let conversationStore: ConversationStore
    /// Set when Hector is a sheet (from lesson complete): hanging up closes it, since the call hides its Done button.
    let onClose: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The safety note is shown once per device, before the first time hands-free is turned on.
    @AppStorage("handsFree.safetyNoteSeen.v1") private var handsFreeNoteSeen = false
    @State private var showHandsFreeNote = false

    @State private var conversation = ConversationSnapshot()
    @State private var voice = VoiceSessionController()
    /// Bumped when Hector's greeting should be spoken: once his learner context has loaded, and on "Call again".
    @State private var openerCue = 0
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
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .alphonsoGlass(radius: AlphonsoRadius.lg)
        }
    }

    /// The setting off: the screen as it was before the call.
    private var classicScreen: some View {
        VStack(spacing: 0) {
            hero
            transcript

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .alphonsoGlass(radius: AlphonsoRadius.lg)
                    .padding(.horizontal)
            }

            saveWordHint

            micButton.padding()
        }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
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
                        // The save-word sheet opens from inside the conversation sheet, so it is presented from here.
                        .sheet(item: $savingWord) { request in
                            SaveWordSheet(request: request, session: session)
                        }
                        // The hands-free switch is in this sheet, and a view under a presented sheet cannot present
                        // an alert: the first-use safety note is presented from here too.
                        .alert(HandsFreeCopy.firstUseTitle, isPresented: $showHandsFreeNote) {
                            Button(HandsFreeCopy.firstUseConfirm) {
                                handsFreeNoteSeen = true
                                voice.setHandsFree(true)
                            }
                            Button("Cancel", role: .cancel) {}
                        } message: {
                            Text(HandsFreeCopy.firstUseBody)
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

    private var callEndedView: some View {
        VStack(spacing: 14) {
            Text("Call ended")
                .font(AlphonsoFont.display(24, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
            Button("Call again") {
                callEnded = false
                voice.appeared()
                openerCue += 1
            }
            .buttonStyle(.alphonsoPrimary)
        }
        .padding(AlphonsoSpacing.lg)
        .alphonsoGlass(radius: AlphonsoRadius.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The hands-free switch, with its once-per-device safety note.
    private var handsFreeToggle: some View {
        Toggle(HandsFreeCopy.toggle, isOn: Binding(
            get: { voice.isHandsFreeOn },
            set: { on in
                if on, !handsFreeNoteSeen {
                    showHandsFreeNote = true
                } else {
                    voice.setHandsFree(on)
                }
            }
        ))
        .font(AlphonsoFont.sans(14, weight: .medium))
        .tint(AlphonsoColor.moss)
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

    /// Hector's 3D art across the top: tall before the first turn, shorter once the conversation needs the room.
    private var hero: some View {
        let art = MascotArt.assetName(for: HectorStatus.moment(for: status))
        return ZStack(alignment: .bottomLeading) {
            Image(art)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .mascotBreathe()
                .id(art)
                .transition(.opacity)
                .frame(maxWidth: .infinity)
                .frame(height: conversation.turns.isEmpty ? 300 : 180, alignment: .top)
                .clipped()
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: art)
                .accessibilityHidden(true)

            // Over the library the title sits on glass, never straight on the picture.
            VStack(alignment: .leading, spacing: 2) {
                Text("Hector")
                    .font(AlphonsoFont.display(30, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(voice.isHandsFreeOn ? "Your tutor · hands-free on" : "Your tutor")
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .alphonsoGlass(radius: AlphonsoRadius.xl)
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.bottom, AlphonsoSpacing.sm)
        }
        .overlay(alignment: .top) {
            HStack {
                heroPill { Text(languageName) }
                Spacer()
                if let status {
                    heroPill {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(status == .listening ? AlphonsoColor.moss : AlphonsoColor.ember)
                                .frame(width: 8, height: 8)
                                .pulsingGlow()
                            Text(status.label)
                        }
                    }
                    .accessibilityLabel("Hector is \(status.label.lowercased())")
                }
            }
            .padding(AlphonsoSpacing.md)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: conversation.turns.isEmpty)
    }

    private func heroPill<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(AlphonsoFont.sans(12, weight: .semiBold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(.black.opacity(0.4), in: Capsule())
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
        if await client.fetchHectorAllowanceUsedUp() {
            notice = HectorAllowance.outForToday
            return
        }
        // Hector speaks first: a conversation with no turns yet opens with his greeting (built locally, no LLM call).
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
                turn: turn, isOpener: isOpener, course: course, color: AlphonsoColor.ink,
                surface: .hector, session: session, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(AlphonsoColor.onAccent)
        }
    }

    private func bubble(for turn: ChatMessage, isOpener: Bool) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            if turn.role == "user" { Spacer(minLength: 40) }
            bubbleText(for: turn, isOpener: isOpener)
                .font(AlphonsoFont.sans(15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    turn.role == "user" ? AlphonsoColor.ember : AlphonsoColor.surface,
                    in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl + 4, style: .continuous)
                )
                .alphonsoLift(turn.role == "assistant")
            if turn.role == "assistant" { Spacer(minLength: 40) }
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
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Button(paused ? HandsFreeCopy.resume : HandsFreeCopy.pause) {
                voice.toggleHandsFreePause()
            }
            .buttonStyle(.alphonsoSecondary)
            .accessibilityIdentifier("hectorHandsFreePause")
            if voice.microphoneUnavailable || voice.recorderStartFailed {
                Text(voice.microphoneUnavailable ? VoiceCopy.microphoneOff : VoiceCopy.microphoneCouldNotStart)
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.destructive)
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

    private var micButton: some View {
        VStack(spacing: 6) {
            Toggle(HandsFreeCopy.toggle, isOn: Binding(
                get: { voice.isHandsFreeOn },
                set: { on in
                    if on, !handsFreeNoteSeen {
                        showHandsFreeNote = true
                    } else {
                        voice.setHandsFree(on)
                    }
                }
            ))
            .font(AlphonsoFont.sans(14, weight: .medium))
            .tint(AlphonsoColor.moss)
            .padding(.horizontal, AlphonsoSpacing.md)
            .accessibilityIdentifier("hectorHandsFreeToggle")

            if voice.isHandsFreeOn {
                handsFreeControls
            } else if voice.isBusy {
                ProgressView().tint(AlphonsoColor.ember).frame(maxWidth: .infinity)
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoColor.ember,
                    recordingColor: AlphonsoColor.destructive,
                    accessibilityLabel: "Hold to talk to Hector",
                    onPress: { if voice.pressBegan() { notice = nil } },
                    onRelease: { voice.pressEnded() }
                )
                .background {
                    // A soft glow ring while Hector is listening.
                    Circle()
                        .fill(AlphonsoColor.ember.opacity(voice.isRecording ? 0.25 : 0.12))
                        .frame(width: 96, height: 96)
                        .pulsingGlow(scale: voice.isRecording ? 1.15 : 1.05)
                }
                .padding(.vertical, 10)
                Text(voice.isRecording ? "Listening — release to send" : "Hold to talk")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                if voice.microphoneUnavailable || voice.recorderStartFailed {
                    Text(voice.microphoneUnavailable ? VoiceCopy.microphoneOff : VoiceCopy.microphoneCouldNotStart)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.destructive)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .alert(HandsFreeCopy.firstUseTitle, isPresented: $showHandsFreeNote) {
            Button(HandsFreeCopy.firstUseConfirm) {
                handsFreeNoteSeen = true
                voice.setHandsFree(true)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(HandsFreeCopy.firstUseBody)
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
        let key = self.key
        let courseCode = course.wireCode
        guard let accessToken = await session.freshAccessToken() else {
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let refresh: @Sendable () async -> String? = { await session.freshAccessToken(forceRefresh: true) }
        let sttClient = AIConversationClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { accessToken }, refreshAccessToken: refresh)
        let tutorClient = TutorConversationClient(
            endpoint: AppConfig.hectorRespondEndpoint, accessToken: { accessToken }, refreshAccessToken: refresh)
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
            var snapshot = conversationStore.append(ChatMessage(role: "user", content: text), to: key)
            conversation = snapshot
            voice.transcribed(generation)

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
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply.reply), to: key)
            conversation = snapshot

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
