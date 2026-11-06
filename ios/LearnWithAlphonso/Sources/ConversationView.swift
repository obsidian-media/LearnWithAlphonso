import SwiftUI
import LearnWithAlphonsoKit

/// Scenario picker. It lists the active course's variants
/// (ContentStore.scenarios(for:)) and rebuilds when the course changes.
struct ConversationView: View {
    let contentStore: ContentStore
    let session: Session
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore
    let entitlementStore: EntitlementStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Two tiles a row; one at accessibility text sizes, where two would wrap a title one word per line.
    private var scenarioColumns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 12), count: count)
    }

    @State private var showHectorPaywall = false

    var body: some View {
        let course = activeCourse.course
        let campaigns = contentStore.campaigns(for: course)
        NavigationStack {
            ScrollView {
                // The cafe shows through at the top, then everything sits on one glass sheet over it.
                Color.clear
                    .frame(height: 150)
                    .sceneScrollProbe()
                    .accessibilityHidden(true)
                LazyVStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                    // Pro's one feature is Hector, so this is the honest place to offer it: where a
                    // learner is already practising speaking. Hidden for Pro.
                    if !entitlementStore.isPro {
                        Button {
                            showHectorPaywall = true
                        } label: {
                            AlphonsoTile(
                                tone: .lilac,
                                emoji: "\u{2728}",
                                title: PaywallCopy.practiceCardTitle,
                                subtitle: PaywallCopy.practiceCardSubtitle
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("practiceHectorCard")
                    }
                    // V4 candidate #4: connected multi-scene campaigns, additive
                    // alongside the scenarios below. See CampaignView.swift.
                    if !campaigns.isEmpty {
                        CampaignPickerSection(
                            campaigns: campaigns, course: course, session: session, conversationStore: conversationStore)
                        practiceSectionLabel("Scenarios")
                    }
                    LazyVGrid(columns: scenarioColumns, spacing: 12) {
                        ForEach(Array(contentStore.scenarios(for: course).enumerated()), id: \.element.id) { index, scenario in
                            NavigationLink {
                                ConversationSessionView(
                                    scenario: scenario, course: course, session: session, conversationStore: conversationStore)
                            } label: {
                                AlphonsoTile(
                                    tone: AlphonsoTileTone(rawValue: TileTone.forIndex(index)) ?? .coral,
                                    emoji: scenario.emoji,
                                    title: scenario.title,
                                    subtitle: scenario.blurb
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("practiceScenarioRow")
                        }
                    }
                }
                .padding(AlphonsoSpacing.md)
                .alphonsoGlass()
                .padding(.horizontal, AlphonsoSpacing.sm)
                .padding(.bottom, AlphonsoSpacing.lg)
            }
            .screenScene(.practice)
            .navigationTitle("Practice speaking")
        }
        // A course switch rebuilds the
        // stack, so an open conversation is popped and the next one opens
        // in the new language. Conversations are stored per (scenario,
        // course), so nothing from the old language carries over.
        .id(course)
        .tint(AlphonsoColor.moss)
        .sheet(isPresented: $showHectorPaywall) {
            PaywallView(entitlementStore: entitlementStore, source: .practiceCard, onClose: { showHectorPaywall = false })
        }
    }
}

/// The heading above a group on the Practice screen.
func practiceSectionLabel(_ text: String) -> some View {
    Text(text)
        .font(AlphonsoFont.display(20, weight: .bold))
        .foregroundStyle(AlphonsoColor.ink)
        .padding(.top, AlphonsoSpacing.sm)
        .accessibilityAddTraits(.isHeader)
}

/// Hold the mic to record, release to send; one full turn at a time
/// (record, transcribe, chat reply, speak), matching /api/stt (pre-recorded,
/// not streaming).
private struct ConversationSessionView: View {
    let scenario: Scenario
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    @State private var conversation = ConversationSnapshot()
    /// The word the learner tapped in one of the partner's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var voice = VoiceSessionController()
    /// Bumped when the opening line should be spoken: the call appeared, or a new conversation or scene began.
    @State private var openerCue = 0
    /// Settings: "Show Alphonso while practising" (default on).
    @AppStorage(AvatarPreference.key) private var showAlphonso = AvatarPreference.defaultValue
    /// What the latest reply said about the learner's turn; the avatar reacts to it after the reply is spoken.
    @State private var replyVerdict = AvatarReplyVerdict()
    /// Notices that are not TutorErrors ("didn't catch that", playback).
    @State private var notice: String?
    // V3 package 3a: adaptive difficulty, per course.
    @State private var cefrLevel: String?

    private var key: ConversationKey { .scenario(scenario.id, course: course) }

    var body: some View {
        Group {
            if showAlphonso { callScreen } else { classicScreen }
        }
        // Alphonso says the scene's opening line out loud (build 59 only showed it). Inside the AI gate, so nothing is
        // fetched before consent; keyed by openerCue, which onAppear and each new conversation or scene bump after
        // the conversation and the voice session are ready. Repeats come from OpenerSpeechCache.
        .task(id: openerCue) {
            guard openerCue > 0 else { return }
            await voice.speakOpener(conversation.pendingOpener, session: session, course: course)
        }
        .aiDisclosureGate()
        .onAppear {
            // Load (or open) this scenario's conversation in this course.
            // A tab switch returns to the same conversation instead of wiping it.
            conversation = conversationStore.snapshot(for: key, seededWith: scenario.opener)
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
            openerCue += 1
        }
        .task(id: course) { cefrLevel = await loadCefrLevel() }
        .onDisappear {
            voice.disappeared()
            voice.onCapture = nil
            analyzeWeaknessesIfNew()
        }
    }

    /// The transcript: the whole screen in the classic layout, the body of the sheet in the call.
    private var transcript: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(conversation.turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, index: index, confidence: conversation.confidenceByTurnIndex[index]).id(index)
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
            Text("Tap any word in a reply to save it.")
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
    }

    /// The setting off: the screen as it was before the call.
    private var classicScreen: some View {
        VStack(spacing: 0) {
            transcript

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            saveWordHint

            micButton
                .padding()
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                // The conversation persists across tab switches until this.
                Button("New conversation") { startNewConversation() }
                    .disabled(voice.isBusy || conversation.turns.count <= 1)
            }
        }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    /// The setting on (the default): a full-screen call. The transcript, its hint and "New conversation" live in the
    /// sheet behind the speech-bubble button; the red button ends the call the way Back did.
    private var callScreen: some View {
        PracticeCallView(
            title: scenario.title, scenarioID: scenario.id, voice: voice, course: course,
            turns: conversation.turns, replyVerdict: replyVerdict,
            notice: notice,
            onPress: { if voice.pressBegan() { notice = nil } },
            onEnd: { dismiss() },
            sheet: {
            VStack(spacing: 0) {
                transcript
                saveWordHint
                Button("New conversation") { startNewConversation() }
                    .font(AlphonsoFont.sans(14, weight: .bold))
                    .disabled(voice.isBusy || conversation.turns.count <= 1)
                    .padding(.vertical, 10)
            }
            // The save-word sheet opens from inside the conversation sheet, so it is presented from here.
            .sheet(item: $savingWord) { request in
                SaveWordSheet(request: request, session: session)
            }
            }
        )
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }

    // MARK: - Bubbles

    /// The partner's replies have tappable words (tap to save); the learner's own
    /// turns are plain text.
    @ViewBuilder
    private func bubbleText(for turn: ChatMessage, index: Int) -> some View {
        if turn.role == "assistant" {
            // The scene's fixed opening line is ours, not the model's.
            AssistantReply(
                turn: turn, isOpener: conversation.openerIndices.contains(index), course: course, color: AlphonsoColor.ink,
                surface: .conversation, scenarioID: scenario.id, session: session, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(.white)
        }
    }

    private func bubble(for turn: ChatMessage, index: Int, confidence: Double?) -> some View {
        VStack(alignment: turn.role == "user" ? .trailing : .leading, spacing: 2) {
            HStack {
                if turn.role == "assistant" { Spacer(minLength: 40) }
                bubbleText(for: turn, index: index)
                    .font(AlphonsoFont.sans(15))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        turn.role == "user" ? AlphonsoColor.moss : AlphonsoColor.parchment,
                        in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                    )
                if turn.role == "user" { Spacer(minLength: 40) }
            }
            // V3 package 3a: pronunciation-clarity heuristic from Deepgram's
            // utterance-level confidence, not phoneme-level scoring.
            if let confidence {
                Text(clarityLabel(confidence))
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .padding(.trailing, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    private func clarityLabel(_ confidence: Double) -> String {
        if confidence >= 0.85 { return "🟢 Clear" }
        if confidence >= 0.6 { return "🟡 Okay" }
        return "🔴 Unclear"
    }

    // MARK: - Mic

    private var micButton: some View {
        VStack(spacing: 6) {
            if voice.isBusy {
                ProgressView(busyLabel).tint(AlphonsoColor.moss)
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoColor.moss,
                    recordingColor: AlphonsoColor.destructive,
                    accessibilityLabel: "Hold to talk",
                    onPress: { if voice.pressBegan() { notice = nil } },
                    onRelease: { voice.pressEnded() }
                )
                // TestFlight feedback (2026-09-29): presses under 0.3s were
                // taps; the screen must say the button is held.
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
    }

    private var busyLabel: String {
        if case .thinking = voice.phase { return "Thinking..." }
        return "Listening..."
    }

    // MARK: - Turn

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            notice = "Didn't catch that. Hold the button while you speak."
        case let .audio(audio, generation, debugTiming):
            await runTurn(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func runTurn(audio: Data, generation: Int, debugTiming: String) async {
        let key = self.key
        let courseCode = course.wireCode
        guard let accessToken = await session.freshAccessToken() else {
            // nil while still signed in means the refresh failed on the network.
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            // One-retry backstop for what freshAccessToken's proactive refresh misses.
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            let result = try await client.transcribe(
                audio: audio, mimeType: "audio/m4a", course: courseCode, debugTiming: debugTiming)
            guard !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                notice = "Didn't catch that — try again."
                return
            }
            var snapshot = conversationStore.append(
                ChatMessage(role: "user", content: result.text), confidence: result.confidence, to: key)
            conversation = snapshot
            voice.transcribed(generation)

            let chatReply = try await client.chatReply(
                messages: snapshot.recentTurns, systemPrompt: scenario.systemPrompt, cefrLevel: cefrLevel, course: courseCode)
            let reply = chatReply.content
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply), to: key)
            conversation = snapshot
            replyVerdict = AvatarReplyVerdict(serial: replyVerdict.serial + 1, verdict: chatReply.verdict)

            do {
                // Alphonso's chosen voice for this course (Settings > Voices); the server re-checks it.
                let speech = try await client.synthesizeSpeech(
                    text: reply, voice: VoicePrefsCache().voice(.alphonso, course: courseCode), course: courseCode)
                if !voice.play(speech, generation: generation) {
                    notice = "Got a reply, but couldn't play it back."
                }
            } catch {
                // The reply text already landed; missing audio is a notice, not a failed turn.
                voice.replyWithoutAudio(generation)
                notice = "Got a reply, but couldn't play it back."
            }
        } catch {
            voice.fail(generation, TutorError.from(error))
        }
    }

    // MARK: - Helpers

    /// Best-effort: without a level, /api/chat sends no difficulty hint.
    private func loadCefrLevel() async -> String? {
        guard let accessToken = session.accessToken else { return nil }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        return (try? await client.fetchCefrLevel(course: course.wireCode)) ?? nil
    }

    private func startNewConversation() {
        // Analyse what was said before it is cleared (same once-per-stretch rule as leaving the screen).
        analyzeWeaknessesIfNew()
        conversation = conversationStore.startNew(key, opener: scenario.opener)
        notice = nil
        openerCue += 1
    }

    /// Once per new stretch of conversation. The conversation now survives
    /// tab switches, so a call on every disappear would re-analyze the same
    /// transcript (and spend quota) each time.
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
