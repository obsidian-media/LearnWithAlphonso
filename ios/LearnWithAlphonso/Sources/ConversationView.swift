import SwiftUI
import LearnWithAlphonsoKit

/// Scenario picker. It lists the active course's variants
/// (ContentStore.scenarios(for:)) and rebuilds when the course changes.
struct ConversationView: View {
    let contentStore: ContentStore
    let session: Session
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore

    var body: some View {
        let course = activeCourse.course
        let campaigns = contentStore.campaigns(for: course)
        NavigationStack {
            List {
                // V4 candidate #4: connected multi-scene campaigns, additive
                // alongside the scenarios below. See CampaignView.swift.
                if !campaigns.isEmpty {
                    CampaignPickerSection(
                        campaigns: campaigns, course: course, session: session, conversationStore: conversationStore)
                }
                Section {
                    ForEach(contentStore.scenarios(for: course)) { scenario in
                        NavigationLink {
                            ConversationSessionView(
                                scenario: scenario, course: course, session: session, conversationStore: conversationStore)
                        } label: {
                            AlphonsoRowCard(title: scenario.title, subtitle: scenario.blurb, leadingEmoji: scenario.emoji)
                        }
                        .accessibilityIdentifier("practiceScenarioRow")
                    }
                } header: {
                    if !campaigns.isEmpty {
                        Text("Scenarios")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Practice speaking")
        }
        // A course switch rebuilds the
        // stack, so an open conversation is popped and the next one opens
        // in the new language. Conversations are stored per (scenario,
        // course), so nothing from the old language carries over.
        .id(course)
        .tint(AlphonsoColor.moss)
    }
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

    @State private var conversation = ConversationSnapshot()
    /// The word the learner tapped in one of the partner's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var voice = VoiceSessionController()
    /// Notices that are not TutorErrors ("didn't catch that", playback).
    @State private var notice: String?
    // V3 package 3a: adaptive difficulty, per course.
    @State private var cefrLevel: String?

    private var key: ConversationKey { .scenario(scenario.id, course: course) }

    var body: some View {
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

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            if conversation.turns.contains(where: { $0.role == "assistant" }) {
                Text("Tap any word in a reply to save it.")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

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
        .aiDisclosureGate()
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        .onAppear {
            // Load (or open) this scenario's conversation in this course.
            // A tab switch returns to the same conversation instead of wiping it.
            conversation = conversationStore.snapshot(for: key, seededWith: scenario.opener)
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
        }
        .task(id: course) { cefrLevel = await loadCefrLevel() }
        .onDisappear {
            voice.disappeared()
            voice.onCapture = nil
            analyzeWeaknessesIfNew()
        }
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

            let reply = try await client.chat(
                messages: snapshot.recentTurns, systemPrompt: scenario.systemPrompt, cefrLevel: cefrLevel, course: courseCode)
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply), to: key)
            conversation = snapshot

            do {
                let speech = try await client.synthesizeSpeech(text: reply, course: courseCode)
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
