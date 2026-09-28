import SwiftUI
import AVFoundation
import Observation
import LearnWithAlphonsoKit

/// V4 candidate #4: connected multi-scene campaigns, additive alongside
/// ConversationView's existing one-shot scenarios -- see
/// docs/superpowers/specs/2026-09-21-conversation-campaigns-design.md for
/// the full design writeup (this mirrors ConversationSessionView's
/// record/transcribe/chat/speak turn loop, plus the scene-pointer state
/// described there).
struct CampaignPickerSection: View {
    let campaigns: [Campaign]
    let session: Session

    var body: some View {
        let rows = ForEach(campaigns) { campaign in
            NavigationLink {
                CampaignSessionView(campaign: campaign, session: session)
            } label: {
                AlphonsoRowCard(title: campaign.title, subtitle: campaign.blurb, leadingEmoji: campaign.emoji)
            }
        }
        Section {
            rows
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
    let session: Session

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var turns: [ChatMessage]
    // Message index where the *current* scene's opener lives -- lets
    // "Restart this scene" truncate back to a known point, and lets the
    // turn-count gate count only turns since this scene began. Same
    // approach as the web's campaign_.$campaignId.tsx.
    @State private var sceneIndex = 0
    @State private var sceneAnchor = 0
    @State private var finished = false

    @State private var recorder = CampaignTurnRecorder()
    @State private var isRecording = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
    @State private var cefrLevel: String?

    init(campaign: Campaign, session: Session) {
        self.campaign = campaign
        self.session = session
        _turns = State(initialValue: [ChatMessage(role: "assistant", content: campaign.scenes[0].opener)])
    }

    private enum Phase: Equatable {
        case idle, transcribing, thinking, speaking
    }

    private var scene: CampaignScene { campaign.scenes[sceneIndex] }
    private var isLastScene: Bool { sceneIndex == campaign.scenes.count - 1 }
    private var userTurnsInScene: Int {
        turns[sceneAnchor...].filter { $0.role == "user" }.count
    }
    private var canContinue: Bool { userTurnsInScene >= scene.minTurns }

    /// Full campaign transcript + the current scene's persona -- gives
    /// scene 2+ visibility into what happened earlier without
    /// AIConversationClient.chat needing any new "session" concept.
    private func systemPrompt(for scene: CampaignScene) -> String {
        "\(campaign.premise)\n\n\(scene.systemPrompt)"
    }

    var body: some View {
        VStack(spacing: 0) {
            if !finished {
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
                        if canContinue && !finished {
                            continueButton
                        }
                        if finished {
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

            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            if !finished {
                micButton.padding()
            }
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(campaign.title)
        .navigationBarTitleDisplayMode(.inline)
        .aiDisclosureGate()
        .tint(AlphonsoColor.moss)
        .toolbar {
            if !finished {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restart scene", systemImage: "arrow.counterclockwise") {
                        restartScene()
                    }
                }
            }
        }
        .task {
            if let accessToken = session.accessToken {
                let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
                cefrLevel = try? await client.fetchCefrLevel(course: "en")
            }
        }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
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

    private func bubble(for turn: ChatMessage) -> some View {
        HStack {
            if turn.role == "assistant" { Spacer(minLength: 40) }
            Text(turn.content)
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(turn.role == "user" ? .white : AlphonsoColor.ink)
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
        Group {
            switch phase {
            case .transcribing, .thinking, .speaking:
                ProgressView().tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
            case .idle:
                Circle()
                    .fill(isRecording ? AlphonsoColor.destructive : AlphonsoColor.moss)
                    .frame(width: 72, height: 72)
                    .overlay(Image(systemName: "mic.fill").foregroundStyle(.white).font(.title2))
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in if !isRecording { startRecording() } }
                            .onEnded { _ in stopRecordingAndSend() }
                    )
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func startRecording() {
        errorMessage = nil
        // Permission is asked for EXPLICITLY rather than left to the implicit
        // prompt AVAudioRecorder.record() raises -- see ConversationView's
        // identical startRecording for the full story.
        requestMicrophonePermission { granted in
            guard granted else {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
                return
            }
            do {
                try recorder.start()
                isRecording = true
            } catch {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
            }
        }
    }

    /// Calls back on the main actor whether or not permission was granted.
    private func requestMicrophonePermission(_ completion: @escaping @MainActor (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in
                Task { @MainActor in completion(granted) }
            }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                Task { @MainActor in completion(granted) }
            }
        }
    }

    private func stopRecordingAndSend() {
        guard isRecording else { return }
        isRecording = false
        Task {
            // Same fix as ConversationView/HectorView's identical
            // stopRecordingAndSend (a sweep for the same bug class,
            // 2026-09-28, after finding it live): guarantee a real
            // minimum run before finalizing, then drop a still-too-small
            // result silently instead of sending a request api/stt.ts's
            // `file.size < 512` guard cannot accept.
            if let remaining = recorder.remainingTimeToMinimumDuration() {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
            guard let audio = await recorder.stop(), audio.count >= CampaignTurnRecorder.minimumAudioBytes else { return }
            await sendTurn(audio: audio)
        }
    }

    private func sendTurn(audio: Data) async {
        guard let accessToken = await session.freshAccessToken() else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            // See ConversationView.swift's ConversationSessionView.sendTurn
            // for the full story -- same fix, same reasoning, same
            // duplication-over-sharing posture this file's other helpers
            // already use.
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            phase = .transcribing
            let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")
            guard !result.text.trimmingCharacters(in: .whitespaces).isEmpty else {
                // See ConversationView/HectorView's identical guard for why
                // this needs a message rather than a silent reset: a live
                // report 2026-09-28 described a run of these as "hits a
                // timeout" -- with zero feedback it reads as the app
                // hanging, not as a recognized, retryable failure.
                errorMessage = "Didn't catch that -- try again."
                phase = .idle
                return
            }
            turns.append(ChatMessage(role: "user", content: result.text))

            phase = .thinking
            let reply = try await client.chat(messages: turns, systemPrompt: systemPrompt(for: scene), cefrLevel: cefrLevel)
            turns.append(ChatMessage(role: "assistant", content: reply))

            phase = .speaking
            let audioReply = try await client.synthesizeSpeech(text: reply)
            player = try AVAudioPlayer(data: audioReply)
            // Same discarded-Bool shape as AVAudioRecorder.record() (found
            // in the same sweep, 2026-09-28) -- see ConversationView's
            // identical fix for the full reasoning.
            if player?.play() == false {
                errorMessage = "Got a reply, but couldn't play it back."
            }
            phase = .idle
        } catch {
            errorMessage = "Something went wrong. Try again."
            phase = .idle
        }
    }

    private func continueToNextScene() {
        if isLastScene {
            finished = true
            return
        }
        let nextScene = campaign.scenes[sceneIndex + 1]
        turns.append(ChatMessage(role: "assistant", content: nextScene.opener))
        sceneAnchor = turns.count - 1
        sceneIndex += 1
        errorMessage = nil
    }

    private func restartScene() {
        turns = Array(turns[0...sceneAnchor])
        errorMessage = nil
    }
}

/// AVAudioRecorder.record() returns false rather than throwing on failure
/// -- this makes that a catchable error instead of a silently-ignored Bool.
private enum RecordingStartError: Error {
    case recordCallFailed
}

/// Same recording approach as ConversationView's TurnRecorder -- duplicated
/// rather than shared, matching this codebase's existing pattern of small
/// file-private helpers per screen.
@Observable
private final class CampaignTurnRecorder: NSObject, AVAudioRecorderDelegate {
    static let minimumAudioBytes = 4_096
    private static let minimumDuration: TimeInterval = 0.4

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var startedAt: Date?
    private var finishContinuation: CheckedContinuation<Void, Never>?

    func start() throws {
        // Set before touching the session, so the flag is already true
        // when iOS delivers interruption-began to the podcast player --
        // that is how it tells an in-app mic takeover from a phone call.
        // See RecordingState. Wrapped in do/catch so ANY failure below
        // still calls the matching ended() -- see ConversationView's
        // identical TurnRecorder.start() for the full reasoning.
        RecordingState.shared.began()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default)
            try session.setActive(true)

            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let newRecorder = try AVAudioRecorder(url: url, settings: settings)
            newRecorder.delegate = self
            guard newRecorder.record() else {
                throw RecordingStartError.recordCallFailed
            }
            recorder = newRecorder
            fileURL = url
            startedAt = Date()
        } catch {
            RecordingState.shared.ended()
            throw error
        }
    }

    func remainingTimeToMinimumDuration() -> TimeInterval? {
        guard let startedAt else { return nil }
        let remaining = Self.minimumDuration - Date().timeIntervalSince(startedAt)
        return remaining > 0 ? remaining : nil
    }

    /// See ConversationView's identical TurnRecorder.stop() for why this
    /// awaits the delegate callback instead of trusting stop()'s
    /// synchronous return: the file isn't guaranteed finalized on disk
    /// until audioRecorderDidFinishRecording fires.
    func stop() async -> Data? {
        RecordingState.shared.ended()
        guard let recorder, let fileURL else { return nil }
        await withCheckedContinuation { continuation in
            finishContinuation = continuation
            recorder.stop()
        }
        self.recorder = nil
        startedAt = nil
        defer { self.fileURL = nil }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }

    // AVAudioRecorderDelegate fires on an arbitrary thread, not
    // necessarily the main actor -- hop over explicitly.
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            self.finishContinuation?.resume()
            self.finishContinuation = nil
        }
    }
}
