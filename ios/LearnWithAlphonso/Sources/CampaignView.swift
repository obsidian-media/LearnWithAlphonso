import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #4: connected multi-scene campaigns, additive alongside
/// ConversationView's one-shot scenarios. See
/// docs/superpowers/specs/2026-09-21-conversation-campaigns-design.md.
/// The active course's variant, stored per (campaign,
/// course), on the shared VoiceSessionController.
struct CampaignPickerSection: View {
    let campaigns: [Campaign]
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    var body: some View {
        Section {
            ForEach(campaigns) { campaign in
                NavigationLink {
                    CampaignSessionView(campaign: campaign, course: course, session: session, conversationStore: conversationStore)
                } label: {
                    AlphonsoRowCard(title: campaign.title, subtitle: campaign.blurb, leadingEmoji: campaign.emoji)
                }
            }
        } header: {
            Text("Campaigns")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(Color.clear)
    }
}

private struct CampaignSessionView: View {
    let campaign: Campaign
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var conversation = ConversationSnapshot()
    /// The word the learner tapped in one of the partner's replies, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?
    @State private var voice = VoiceSessionController()
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
        VStack(spacing: 0) {
            if !conversation.finished {
                Text("Scene \(sceneIndex + 1) of \(campaign.scenes.count) — \(scene.title)")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .padding(.top, 8)
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn).id(index)
                        }
                        if canContinue && !conversation.finished {
                            continueButton
                        }
                        if conversation.finished {
                            completionCard
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) {
                    if reduceMotion {
                        proxy.scrollTo(turns.count - 1, anchor: .bottom)
                    } else {
                        withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                    }
                }
            }

            if let message = voice.failure?.userMessage() ?? notice {
                Text(message)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            if !conversation.finished {
                if turns.contains(where: { $0.role == "assistant" }) {
                    Text("Tap any word in a reply to save it.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                micButton.padding()
            }
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(campaign.title)
        .navigationBarTitleDisplayMode(.inline)
        .aiDisclosureGate()
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        .tint(AlphonsoColor.moss)
        .toolbar {
            if !conversation.finished {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restart scene", systemImage: "arrow.counterclockwise") {
                        restartScene()
                    }
                }
            }
        }
        .onAppear {
            conversation = conversationStore.snapshot(for: key, seededWith: campaign.scenes[0].opener)
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

    private var continueButton: some View {
        Button {
            continueToNextScene()
        } label: {
            Text(isLastScene ? "Finish campaign" : "Continue: \(campaign.scenes[sceneIndex + 1].title) →")
        }
        .buttonStyle(.alphonsoPrimary)
        .padding(.top, 4)
    }

    private var completionCard: some View {
        VStack(spacing: 8) {
            AlphonsoMascotBanner(mascot: .alphonso, message: "Nice work — campaign complete!")
            Text("You made it through all \(campaign.scenes.count) scenes of \(campaign.title).")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    @ViewBuilder
    private func bubbleText(for turn: ChatMessage) -> some View {
        if turn.role == "assistant" {
            // A scene's fixed opening line is ours, not the model's.
            AssistantReply(
                turn: turn, isOpener: campaign.scenes.contains { $0.opener == turn.content },
                course: course, color: AlphonsoColor.ink, savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(.white)
        }
    }

    private func bubble(for turn: ChatMessage) -> some View {
        HStack {
            if turn.role == "assistant" { Spacer(minLength: 40) }
            bubbleText(for: turn)
                .font(AlphonsoFont.sans(15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    turn.role == "user" ? AlphonsoColor.moss : AlphonsoColor.parchment,
                    in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                )
            if turn.role == "user" { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    private var micButton: some View {
        VStack(spacing: 6) {
            if voice.isBusy {
                ProgressView().tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoColor.moss,
                    recordingColor: AlphonsoColor.destructive,
                    accessibilityLabel: "Hold to talk",
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
            var snapshot = conversationStore.append(ChatMessage(role: "user", content: result.text), to: key)
            conversation = snapshot
            voice.transcribed(generation)

            let reply = try await client.chat(
                messages: snapshot.turns, systemPrompt: prompt, cefrLevel: cefrLevel, course: courseCode)
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply), to: key)
            conversation = snapshot

            do {
                let speech = try await client.synthesizeSpeech(text: reply, course: courseCode)
                if !voice.play(speech, generation: generation) {
                    notice = "Got a reply, but couldn't play it back."
                }
            } catch {
                voice.replyWithoutAudio(generation)
                notice = "Got a reply, but couldn't play it back."
            }
        } catch {
            voice.fail(generation, TutorError.from(error))
        }
    }

    private func continueToNextScene() {
        notice = nil
        if isLastScene {
            conversation = conversationStore.update(key) { $0.finished = true }
            return
        }
        let nextScene = campaign.scenes[sceneIndex + 1]
        conversation = conversationStore.update(key) {
            $0.turns.append(ChatMessage(role: "assistant", content: nextScene.opener))
            $0.sceneAnchor = $0.turns.count - 1
            $0.sceneIndex += 1
        }
    }

    private func restartScene() {
        notice = nil
        conversation = conversationStore.update(key) { snapshot in
            let anchor = snapshot.sceneAnchor
            snapshot.turns = Array(snapshot.turns[0...anchor])
            snapshot.confidenceByTurnIndex = snapshot.confidenceByTurnIndex.filter { $0.key <= anchor }
        }
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
        let transcript = snapshot.turns
        let courseCode = course.wireCode
        Task { _ = try? await client.analyzeWeaknesses(transcript: transcript, course: courseCode) }
    }
}
