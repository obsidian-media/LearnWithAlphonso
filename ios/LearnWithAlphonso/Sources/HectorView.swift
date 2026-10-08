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

    var body: some View {
        NavigationStack {
            Group {
                if !entitlementStore.isPro {
                    PaywallView(entitlementStore: entitlementStore)
                } else {
                    HectorConversationView(
                        session: session,
                        entitlementStore: entitlementStore,
                        course: activeCourse.course,
                        conversationStore: conversationStore
                    )
                    // A course switch is a fresh Hector
                    // in the new language; each course keeps its own thread.
                    .id(activeCourse.course)
                }
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Hector")
        }
        .tint(AlphonsoColor.ember)
    }
}

private struct HectorConversationView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let course: Course
    let conversationStore: ConversationStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var conversation = ConversationSnapshot()
    @State private var voice = VoiceSessionController()
    @State private var notice: String?
    @State private var cefrLevel: String?
    /// V3 package 3b "tutor persona memory": open weaknesses, prepended to
    /// every respond() history but never shown as a bubble.
    @State private var memoryContext: TutorConversationMessage?
    /// The word the learner tapped in one of Hector's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var showPaywall = false
    /// @State, not `let`: a View struct is re-created on every render, and a
    /// `let UUID()` minted a new session id each time.
    @State private var sessionID = UUID().uuidString

    private var key: ConversationKey { .hector(course: course) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(conversation.turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn).id(index)
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

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            if conversation.turns.contains(where: { $0.role == "assistant" }) {
                Text("Tap any word in Hector's reply to save it.")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

            micButton.padding()
        }
        .background(AlphonsoColor.surface)
        .aiDisclosureGate()
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        // .notEntitled opens the paywall. The server's RevenueCat check
        // can disagree with the local isPro (lapsed, refunded, other device).
        .sheet(isPresented: $showPaywall) {
            PaywallView(entitlementStore: entitlementStore)
        }
        .onAppear {
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

    // MARK: - Context

    /// Best-effort: a failed fetch just means this session starts without
    /// level or memory, the same as a brand-new learner.
    private func loadLearnerContext() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let level = (try? await client.fetchCefrLevel(course: course.wireCode)) ?? nil
        let trend = (try? await client.fetchWeaknessTrend()) ?? []
        let openCategories = trend.filter { $0.openCount > 0 }.map(\.category)
        cefrLevel = level
        memoryContext = TutorMemoryContext.buildPrimingMessage(cefrLevel: level, openWeaknessCategories: openCategories)
    }

    // MARK: - Bubbles

    @ViewBuilder
    private func bubbleText(for turn: ChatMessage) -> some View {
        if turn.role == "assistant" {
            AssistantReply(
                turn: turn, isOpener: false, course: course, color: AlphonsoColor.ink, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(AlphonsoColor.onAccent)
        }
    }

    private func bubble(for turn: ChatMessage) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            if turn.role == "assistant" {
                Image("Hector")
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 26, height: 26)
                    .clipShape(Circle())
                    .accessibilityHidden(true)
            } else {
                Spacer(minLength: 40)
            }
            bubbleText(for: turn)
                .font(AlphonsoFont.sans(15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    turn.role == "user" ? AlphonsoColor.ember : AlphonsoColor.parchment,
                    in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                )
            if turn.role == "user" { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    // MARK: - Mic

    private var micButton: some View {
        VStack(spacing: 6) {
            if voice.isBusy {
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
                Text(voice.isRecording ? "Listening — release to send" : "Hold to talk")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                if voice.microphoneUnavailable {
                    Text("Microphone access is off. Turn it on in Settings > Privacy > Microphone.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.destructive)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity)
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
                notice = "Didn't catch that — try again."
                return
            }
            var snapshot = conversationStore.append(ChatMessage(role: "user", content: text), to: key)
            conversation = snapshot
            voice.transcribed(generation)

            // The current utterance goes only in `text`; the
            // history is every turn BEFORE it. The server appends `text` itself.
            let priorTurns = snapshot.turns.dropLast().map { TutorConversationMessage(role: $0.role, content: $0.content) }
            let reply = try await tutorClient.respond(
                sessionID: sessionID,
                text: text,
                course: courseCode,
                cefrLevel: cefrLevel,
                history: (memoryContext.map { [$0] } ?? []) + priorTurns
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
        let transcript = snapshot.turns
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
