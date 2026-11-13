import SwiftUI
import LearnWithAlphonsoKit

struct ConversationView: View {
    let contentStore: ContentStore
    let session: Session
    let activeCourse: ActiveCourseModel
    let conversationStore: ConversationStore
    let entitlementStore: EntitlementStore
    var body: some View {
        PracticeHubView(contentStore: contentStore, session: session, course: activeCourse.course,
                        conversationStore: conversationStore, entitlementStore: entitlementStore).id(activeCourse.course)
    }
}
func practiceSectionLabel(_ text: String) -> some View {
    Text(text).dsText(.title).foregroundStyle(AlphonsoDS.current.ink).accessibilityAddTraits(.isHeader)
}

/// Hold the mic to record, release to send; one full turn at a time
/// (record, transcribe, chat reply, speak), matching /api/stt (pre-recorded,
/// not streaming).
struct ConversationSessionView: View {
    let scenario: Scenario
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    var chatMode: Bool = false
    @State private var callId = UUID().uuidString
    @State private var startedAt = Date()
    @State private var result: PracticeResult?
    @State private var slip: (said: String, reply: String)?
    @State private var ending = false
    @State private var pendingTurns = 0
    @State private var input = ""
    @State private var elapsed = 0
    @State private var initialized = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    @State private var conversation = ConversationSnapshot()
    /// The word the learner tapped in one of the partner's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var voice = VoiceSessionController()
    /// Bumped when the opening line should be spoken: the call appeared, or a new conversation or scene began.
    @State private var openerCue = 0
    /// What the latest reply said about the learner's turn; the avatar reacts to it after the reply is spoken.
    @State private var replyVerdict = AvatarReplyVerdict()
    /// Notices that are not TutorErrors ("didn't catch that", playback).
    @State private var notice: String?
    // V3 package 3a: adaptive difficulty, per course.
    @State private var cefrLevel: String?

    private var key: ConversationKey { .scenario(scenario.id, course: course) }

    var body: some View {
        Group {
            if let result {
                PracticeResultView(result: result, room: scenario.id, course: course.wireCode, seconds: elapsed, slip: slip,
                    retry: { self.result = nil; startNewConversation() }, nextLabel: "Done", done: { dismiss() })
            } else if !chatMode { callScreen } else { classicScreen }
        }
        // Alphonso says the scene's opening line out loud (build 59 only showed it). Inside the AI gate, so nothing is
        // fetched before consent; keyed by openerCue, which onAppear and each new conversation or scene bump after
        // the conversation and the voice session are ready. Repeats come from OpenerSpeechCache.
        .task(id: openerCue) {
            guard openerCue > 0, !chatMode, result == nil else { return }
            await voice.speakOpener(conversation.pendingOpener, session: session, course: course)
        }
        .navigationBarBackButtonHidden(true)
        .aiDisclosureGate()
        .onAppear {
            if !initialized {
                initialized = true
                // A chosen practice attempt starts fresh; tab switches retain this initialized snapshot.
                conversation = conversationStore.startNew(key, opener: scenario.opener)
            }
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
        VStack(spacing: CGFloat.zero) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        ForEach(Array(conversation.turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, index: index, confidence: conversation.confidenceByTurnIndex[index]).id(index)
                        }
                    }
                    .padding(AlphonsoDS.Space.gutter)
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
                .dsText(.caption)
                .foregroundStyle(AlphonsoDS.current.inkSoft)
        }
    }

    /// Chat mode: the same transcript, with a typed reply composer.
    private var classicScreen: some View {
        VStack(spacing: CGFloat.zero) {
            transcript

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .dsText(.footnote)
                    .foregroundStyle(AlphonsoDS.current.wrongInk)
                    .padding(.horizontal)
            }

            saveWordHint

            if chatMode { typedControls } else { micButton.padding(AlphonsoDS.Space.gutter) }
        }
        .background(AlphonsoDS.current.surface)
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("End") { Task { await finishCall() } }.disabled(ending) } }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                // The conversation persists across tab switches until this.
                Button("New conversation") { startNewConversation() }
                    .disabled(ending || pendingTurns > 0 || voice.isBusy || conversation.turns.count <= 1)
            }
        }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    /// Call mode: a full-screen call. The transcript, its hint and "New conversation" live in the
    /// sheet behind the speech-bubble button; the red button ends the call the way Back did.
    private var callScreen: some View {
        PracticeCallView(
            title: scenario.title, scenarioID: scenario.id, voice: voice, course: course,
            turns: conversation.turns, replyVerdict: replyVerdict,
            notice: notice,
            onPress: { if ending { return }; if voice.pressBegan() { notice = nil } },
            onEnd: { Task { await finishCall() } },
            sheet: {
            VStack(spacing: CGFloat.zero) {
                transcript
                saveWordHint
                Button("New conversation") { startNewConversation() }
                    .dsText(.footnote)
                    .disabled(ending || pendingTurns > 0 || voice.isBusy || conversation.turns.count <= 1)
                    .padding(.vertical, AlphonsoDS.Space.s3)
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
                turn: turn, isOpener: conversation.openerIndices.contains(index), course: course, color: AlphonsoDS.current.ink,
                surface: .conversation, scenarioID: scenario.id, session: session, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(AlphonsoDS.current.onHero)
        }
    }

    private func bubble(for turn: ChatMessage, index: Int, confidence: Double?) -> some View {
        VStack(alignment: turn.role == "user" ? .trailing : .leading, spacing: AlphonsoDS.Space.s1) {
            HStack {
                if turn.role == "user" { Spacer(minLength: AlphonsoDS.Space.minTouch) }
                bubbleText(for: turn, index: index)
                    .dsText(.body)
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                    .padding(.vertical, AlphonsoDS.Space.s3)
                    .background(
                        turn.role == "user" ? AlphonsoDS.current.choice : AlphonsoDS.current.card,
                        in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    )
                if turn.role == "assistant" { Spacer(minLength: AlphonsoDS.Space.minTouch) }
            }
            // V3 package 3a: pronunciation-clarity heuristic from Deepgram's
            // utterance-level confidence, not phoneme-level scoring.
            if let confidence {
                Text(clarityLabel(confidence))
                    .dsText(.caption)
                    .foregroundStyle(AlphonsoDS.current.inkSoft)
                    .padding(.trailing, AlphonsoDS.Space.s2)
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
        VStack(spacing: AlphonsoDS.Space.s2) {
            if voice.isBusy {
                ProgressView(busyLabel).tint(AlphonsoDS.current.choice)
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoDS.current.choice,
                    recordingColor: AlphonsoDS.current.wrongInk,
                    accessibilityLabel: "Hold to talk",
                    onPress: { if ending { return }; if voice.pressBegan() { notice = nil } },
                    onRelease: { voice.pressEnded() }
                )
                // TestFlight feedback (2026-09-29): presses under 0.3s were
                // taps; the screen must say the button is held.
                Text(voice.isRecording ? "Listening — release to send" : "Hold to talk")
                    .dsText(.caption)
                    .foregroundStyle(AlphonsoDS.current.inkSoft)
                if voice.microphoneUnavailable || voice.recorderStartFailed {
                    Text(voice.microphoneUnavailable ? VoiceCopy.microphoneOff : VoiceCopy.microphoneCouldNotStart)
                        .dsText(.caption)
                        .foregroundStyle(AlphonsoDS.current.wrongInk)
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
        guard !ending else { return }
        pendingTurns += 1
        defer { pendingTurns -= 1 }
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
            await sendReply(result.text, confidence: result.confidence, generation: generation)

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
        resetCall()
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
    private func sendReply(_ text: String, confidence: Double? = nil, generation: Int) async {
        let key = self.key
        let courseCode = course.wireCode
        let prompt = scenario.systemPrompt
        guard let accessToken = await session.freshAccessToken() else { return }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken }, refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            var snapshot = conversationStore.append(
                ChatMessage(role: "user", content: text), confidence: confidence, to: key)
            conversation = snapshot
            voice.transcribed(generation)

            let chatReply = try await client.chatReply(
                messages: snapshot.recentTurns, systemPrompt: scenario.systemPrompt, cefrLevel: cefrLevel, course: courseCode, callId: callId)
            let reply = chatReply.content
            if slip == nil, chatReply.verdict == .corrected, let said = snapshot.turns.last(where: { $0.role == "user" })?.content {
                slip = (said, reply)
            }
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply), to: key)
            conversation = snapshot
            replyVerdict = AvatarReplyVerdict(serial: replyVerdict.serial + 1, verdict: chatReply.verdict)

            if chatMode { voice.replyWithoutAudio(generation); return }
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
        } catch { voice.fail(generation, TutorError.from(error)); notice = TutorError.from(error).userMessage() }
    }
    private var typedControls: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            TextField("Your reply", text: $input, axis: .vertical).dsText(.body).textFieldStyle(.roundedBorder)
            PracticeButton("Send") {
                let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty, pendingTurns == 0, !ending else { return }
                input = ""
                pendingTurns += 1
                Task { await sendReply(text, generation: 0); pendingTurns -= 1 }
            }.disabled(pendingTurns > 0 || ending)
        }.padding(AlphonsoDS.Space.gutter)
    }
    private func resetCall() {
        callId = UUID().uuidString; startedAt = Date(); slip = nil; ending = false
        voice.appeared()
    }
    private func finishCall() async {
        guard !ending else { return }
        ending = true
        voice.disappeared()
        while pendingTurns > 0 { try? await Task.sleep(for: .milliseconds(50)) }
        elapsed = Int(Date().timeIntervalSince(startedAt))
        do {
            let finished = try await practiceClient(session).finishPractice(callId: callId)
            Analytics.track(.practiceCallCompleted, ["scenario_id": scenario.id, "stars": finished.stars])
            result = finished
        }
        catch { dismiss() } // Same as web when no reply was judged or finish is unavailable.
    }

}
