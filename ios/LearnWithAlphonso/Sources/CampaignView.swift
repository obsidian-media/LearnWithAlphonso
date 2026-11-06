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
        VStack(alignment: .leading, spacing: 12) {
            practiceSectionLabel("Campaigns")
            ForEach(campaigns) { campaign in
                NavigationLink {
                    CampaignSessionView(campaign: campaign, course: course, session: session, conversationStore: conversationStore)
                } label: {
                    CampaignHeroCard(campaign: campaign)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// A campaign as a big gradient card with its 3D icon and scene count.
private struct CampaignHeroCard: View {
    let campaign: Campaign

    var body: some View {
        HStack(spacing: AlphonsoSpacing.md) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Campaign · \(campaign.level)".uppercased())
                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                    .tracking(0.6)
                Text(campaign.title)
                    .font(AlphonsoFont.display(21, weight: .bold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(campaign.blurb)
                    .font(AlphonsoFont.sans(13))
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(campaign.scenes.count) scenes")
                    .font(AlphonsoFont.sans(11, weight: .bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.18), in: Capsule())
                    .padding(.top, 4)
            }
            Spacer(minLength: 0)
            Icon3DView(emoji: campaign.emoji, size: 64)
        }
        .foregroundStyle(AlphonsoColor.onMossGradient)
        .multilineTextAlignment(.leading)
        .padding(AlphonsoSpacing.md)
        .background(
            LinearGradient(colors: [AlphonsoColor.moss, AlphonsoColor.mossDeep], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl + 6, style: .continuous)
        )
        .alphonsoLift()
        .accessibilityElement(children: .combine)
    }
}

private struct CampaignSessionView: View {
    let campaign: Campaign
    let course: Course
    let session: Session
    let conversationStore: ConversationStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    /// Settings: "Show Alphonso while practising" (default on).
    @AppStorage(AvatarPreference.key) private var showAlphonso = AvatarPreference.defaultValue
    /// What the latest reply said about the learner's turn; the avatar reacts to it after the reply is spoken.
    @State private var replyVerdict = AvatarReplyVerdict()

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
        Group {
            if showAlphonso { callScreen } else { classicScreen }
        }
        .aiDisclosureGate()
        .tint(AlphonsoColor.moss)
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

    /// The transcript with the scene's Continue button or completion card at its end.
    private var transcript: some View {
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
                            bubble(for: turn, index: index).id(index)
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
        }
    }

    private var saveWordHint: some View {
        Group {
            if turns.contains(where: { $0.role == "assistant" }) {
                Text("Tap any word in a reply to save it.")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
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

            if !conversation.finished {
                saveWordHint
                micButton.padding()
            }
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(campaign.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        .toolbar {
            if !conversation.finished {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restart scene", systemImage: "arrow.counterclockwise") {
                        restartScene()
                    }
                    .disabled(voice.isBusy)
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
            scenarioID: campaign.id, voice: voice, course: course,
            turns: turns, replyVerdict: replyVerdict,
            notice: notice,
            onPress: { if conversation.finished { return }; if voice.pressBegan() { notice = nil } },
            onEnd: { dismiss() },
            extra: callExtra
        ) {
            VStack(spacing: 0) {
                if !conversation.finished {
                    Button("Restart scene") { restartScene() }
                        .font(AlphonsoFont.sans(14, weight: .bold))
                        .disabled(voice.isBusy)
                        .padding(.vertical, 6)
                }
                transcript
                saveWordHint
            }
            // The save-word sheet opens from inside the conversation sheet, so it is presented from here.
            .sheet(item: $savingWord) { request in
                SaveWordSheet(request: request, session: session)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }

    private var callExtra: AnyView? {
        if conversation.finished {
            return AnyView(
                Text("Nice work, campaign complete!")
                    .font(AlphonsoFont.sans(13, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(.black.opacity(0.45), in: Capsule()))
        }
        if canContinue {
            return AnyView(
                Button {
                    continueToNextScene()
                } label: {
                    Text(isLastScene ? "Finish campaign" : "Continue: \(campaign.scenes[sceneIndex + 1].title) \u{2192}")
                        .font(AlphonsoFont.sans(13, weight: .bold))
                        .foregroundStyle(Color(red: 0.09, green: 0.14, blue: 0.11))
                        .padding(.horizontal, 20).padding(.vertical, 9)
                        .background(.white, in: Capsule())
                }
                .disabled(voice.isBusy))
        }
        return nil
    }

    private var continueButton: some View {
        Button {
            continueToNextScene()
        } label: {
            Text(isLastScene ? "Finish campaign" : "Continue: \(campaign.scenes[sceneIndex + 1].title) →")
        }
        .buttonStyle(.alphonsoPrimary)
        .disabled(voice.isBusy)
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
    private func bubbleText(for turn: ChatMessage, index: Int) -> some View {
        if turn.role == "assistant" {
            // A scene's fixed opening line is ours, not the model's. Tracked by position, not by its words.
            AssistantReply(
                turn: turn, isOpener: conversation.openerIndices.contains(index),
                course: course, color: AlphonsoColor.ink,
                surface: .campaign, campaignID: campaign.id, sceneIndex: conversation.sceneIndex(ofTurnAt: index), session: session,
                savingWord: $savingWord)
        } else {
            Text(turn.content).foregroundStyle(.white)
        }
    }

    private func bubble(for turn: ChatMessage, index: Int) -> some View {
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

            let chatReply = try await client.chatReply(
                messages: snapshot.recentTurns, systemPrompt: prompt, cefrLevel: cefrLevel, course: courseCode)
            let reply = chatReply.content
            snapshot = conversationStore.append(ChatMessage(role: "assistant", content: reply), to: key)
            conversation = snapshot
            replyVerdict = AvatarReplyVerdict(serial: replyVerdict.serial + 1, verdict: chatReply.verdict)

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
            $0.appendOpener(nextScene.opener)
            $0.sceneAnchor = $0.turns.count - 1
            $0.sceneIndex += 1
        }
    }

    private func restartScene() {
        notice = nil
        conversation = conversationStore.update(key) { $0.restartScene() }
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
}
