import SwiftUI
import LearnWithAlphonsoKit

struct CampaignSessionView: View {
    let campaign: Campaign
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    var startScene: Int = 0
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
    @State private var advancing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    /// What the latest reply said about the learner's turn; the avatar reacts to it after the reply is spoken.
    @State private var replyVerdict = AvatarReplyVerdict()

    @State private var conversation = ConversationSnapshot()
    /// The word the learner tapped in one of the partner's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var voice = VoiceSessionController()
    /// Bumped when the opening line should be spoken: the call appeared, or a new conversation or scene began.
    @State private var openerCue = 0
    @State private var notice: String?
    @State private var cefrLevel: String?

    private var key: ConversationKey { .campaign(campaign.id, course: course) }
    private var turns: [ChatMessage] { conversation.turns }
    private var sceneIndex: Int { conversation.sceneIndex }
    private var scene: CampaignScene { campaign.scenes[sceneIndex] }
    private var isLastScene: Bool { sceneIndex == campaign.scenes.count - 1 }
    private var userTurnsInScene: Int {
        guard conversation.sceneAnchor < turns.count else { return 0 }
        return turns[conversation.sceneAnchor...].filter { $0.role == "user" }.count
    }
    private var canContinue: Bool { userTurnsInScene >= scene.minTurns }

    /// Full campaign transcript plus the current scene's persona, composed
    /// exactly as the /api/chat whitelist expects (premise + "\n\n" + scene).
    private func systemPrompt(for scene: CampaignScene) -> String {
        "\(campaign.premise)\n\n\(scene.systemPrompt)"
    }

    var body: some View {
        Group {
            if let result {
                PracticeResultView(result: result, room: PracticeHub.room(campaignID: campaign.id, sceneID: scene.id), course: course.wireCode, seconds: elapsed, slip: slip,
                    retry: { self.result = nil; restartScene() }, nextLabel: isLastScene || (result.stars == 0 && !advancing) ? "Done" : "Continue", done: { if isLastScene || (result.stars == 0 && !advancing) { dismiss() } else { self.result = nil; continueToNextScene() } })
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
        .tint(AlphonsoDS.current.choice)
        .onAppear {
            if !initialized {
                initialized = true
                conversation = conversationStore.update(key) { $0 = PracticeHub.start(campaign, sceneIndex: startScene) }
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

    /// The transcript with the scene's Continue button or completion card at its end.
    private var transcript: some View {
        VStack(spacing: CGFloat.zero) {
            if !conversation.finished {
                Text("Scene \(sceneIndex + 1) of \(campaign.scenes.count) — \(scene.title)")
                    .dsText(.caption)
                    .foregroundStyle(AlphonsoDS.current.inkSoft)
                    .padding(.top, AlphonsoDS.Space.s2)
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        ForEach(Array(turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, index: index).id(index)
                        }
                        if canContinue && !conversation.finished {
                            continueButton
                        }
                        if conversation.finished {
                            completionCard
                        }
                    }
                    .padding(AlphonsoDS.Space.gutter)
                }
                .onChange(of: turns.count) {
                    if reduceMotion {
                        proxy.scrollTo(turns.count - 1, anchor: .bottom)
                    } else {
                        withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                    }
                }
            }
        }
    }

    private var saveWordHint: some View {
        Group {
            if turns.contains(where: { $0.role == "assistant" }) {
                Text("Tap any word in a reply to save it.")
                    .dsText(.caption)
                    .foregroundStyle(AlphonsoDS.current.inkSoft)
            }
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

            if !conversation.finished {
                saveWordHint
                if chatMode { typedControls } else { micButton.padding(AlphonsoDS.Space.gutter) }
            }
        }
        .background(AlphonsoDS.current.surface)
        .navigationTitle(campaign.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("End") { Task { await finishCall() } }.disabled(ending) } }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        .toolbar {
            if !conversation.finished {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restart scene", systemImage: "arrow.counterclockwise") {
                        restartScene()
                    }
                    .disabled(ending || pendingTurns > 0 || voice.isBusy)
                }
            }
        }
    }

    /// The setting on (the default): the full-screen call, in the default study room. Continue sits on the call;
    /// the transcript, its hint and "Restart scene" are in the sheet.
    private var callScreen: some View {
        PracticeCallView(
            title: conversation.finished
                ? campaign.title : "\(campaign.title): scene \(sceneIndex + 1) of \(campaign.scenes.count)",
            scenarioID: PracticeHub.room(campaignID: campaign.id, sceneID: scene.id), voice: voice, course: course,
            turns: turns, replyVerdict: replyVerdict,
            notice: notice,
            onPress: { if conversation.finished || ending { return }; if voice.pressBegan() { notice = nil } },
            onEnd: { Task { await finishCall() } },
            extra: callExtra,
            sheet: {
            VStack(spacing: CGFloat.zero) {
                if !conversation.finished {
                    Button("Restart scene") { restartScene() }
                        .dsText(.footnote)
                        .disabled(ending || pendingTurns > 0 || voice.isBusy)
                        .padding(.vertical, AlphonsoDS.Space.s2)
                }
                transcript
                saveWordHint
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

    private var callExtra: AnyView? {
        if conversation.finished {
            return AnyView(
                Text("Nice work, campaign complete!")
                    .dsText(.footnote)
                    .foregroundStyle(AlphonsoDS.current.onHero)
                    .padding(.horizontal, AlphonsoDS.Space.s4).padding(.vertical, AlphonsoDS.Space.s2)
                    .background(AlphonsoDS.current.hero, in: Capsule()))
        }
        if canContinue {
            return AnyView(
                Button {
                    Task { await finishCall(advance: true) }
                } label: {
                    Text(isLastScene ? "Finish campaign" : "Continue: \(campaign.scenes[sceneIndex + 1].title) \u{2192}")
                        .dsText(.footnote)
                        .foregroundStyle(AlphonsoDS.current.ink)
                        .padding(.horizontal, AlphonsoDS.Space.s5).padding(.vertical, AlphonsoDS.Space.s2)
                        .background(AlphonsoDS.current.card, in: Capsule())
                }
                .disabled(ending || pendingTurns > 0 || voice.isBusy))
        }
        return nil
    }

    private var continueButton: some View {
        Button {
            Task { await finishCall(advance: true) }
        } label: {
            Text(isLastScene ? "Finish campaign" : "Continue: \(campaign.scenes[sceneIndex + 1].title) →")
        }
        .buttonStyle(.alphonsoPrimary)
        .disabled(ending || pendingTurns > 0 || voice.isBusy)
        .padding(.top, AlphonsoDS.Space.s1)
    }

    private var completionCard: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            AlphonsoMascotBanner(mascot: .alphonso, message: "Nice work — campaign complete!")
            Text("You made it through all \(campaign.scenes.count) scenes of \(campaign.title).")
                .dsText(.footnote)
                .foregroundStyle(AlphonsoDS.current.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, AlphonsoDS.Space.s2)
    }

    @ViewBuilder
    private func bubbleText(for turn: ChatMessage, index: Int) -> some View {
        if turn.role == "assistant" {
            // A scene's fixed opening line is ours, not the model's. Tracked by position, not by its words.
            AssistantReply(
                turn: turn, isOpener: conversation.openerIndices.contains(index),
                course: course, color: AlphonsoDS.current.ink,
                surface: .campaign, campaignID: campaign.id, sceneIndex: conversation.sceneIndex(ofTurnAt: index), session: session,
                savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(AlphonsoDS.current.onHero)
        }
    }

    private func bubble(for turn: ChatMessage, index: Int) -> some View {
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
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    private var micButton: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            if voice.isBusy {
                ProgressView().tint(AlphonsoDS.current.choice).frame(maxWidth: .infinity)
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoDS.current.choice,
                    recordingColor: AlphonsoDS.current.wrongInk,
                    accessibilityLabel: "Hold to talk",
                    onPress: { if ending { return }; if voice.pressBegan() { notice = nil } },
                    onRelease: { voice.pressEnded() }
                )
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
        let prompt = systemPrompt(for: scene)
        guard let accessToken = await session.freshAccessToken() else {
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
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

    private func continueToNextScene() {
        resetCall()
        notice = nil
        if isLastScene {
            conversation = conversationStore.update(key) { $0.finished = true }
            return
        }
        let nextScene = campaign.scenes[sceneIndex + 1]
        conversation = conversationStore.update(key) {
            $0.appendOpener(nextScene.opener)
            $0.sceneAnchor = $0.turns.count - 1
            $0.sceneIndex += 1
        }
        openerCue += 1
    }

    private func restartScene() {
        resetCall()
        notice = nil
        conversation = conversationStore.update(key) { $0.restartScene() }
        openerCue += 1
    }

    private func loadCefrLevel() async -> String? {
        guard let accessToken = session.accessToken else { return nil }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        return (try? await client.fetchCefrLevel(course: course.wireCode)) ?? nil
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
    private func sendReply(_ text: String, confidence: Double? = nil, generation: Int) async {
        let key = self.key
        let courseCode = course.wireCode
        let prompt = systemPrompt(for: scene)
        guard let accessToken = await session.freshAccessToken() else { return }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken }, refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            var snapshot = conversationStore.append(ChatMessage(role: "user", content: text), to: key)
            conversation = snapshot
            voice.transcribed(generation)

            let chatReply = try await client.chatReply(
                messages: snapshot.recentTurns, systemPrompt: prompt, cefrLevel: cefrLevel, course: courseCode, callId: callId)
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
    private func finishCall(advance: Bool = false) async {
        guard !ending else { return }
        advancing = advance
        ending = true
        voice.disappeared()
        while pendingTurns > 0 { try? await Task.sleep(for: .milliseconds(50)) }
        elapsed = Int(Date().timeIntervalSince(startedAt))
        do { result = try await practiceClient(session).finishPractice(callId: callId) }
        catch { if advance { ending = false; continueToNextScene() } else { dismiss() } }
    }

}
