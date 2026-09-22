import SwiftUI
import AVFoundation
import Observation
import LearnWithAlphonsoKit

/// Scenario picker -- reuses the already-bundled (previously unused)
/// scenarios.json via ContentStore.scenarios.
struct ConversationView: View {
    let contentStore: ContentStore
    let session: Session

    var body: some View {
        NavigationStack {
            List {
                // V4 candidate #4: connected multi-scene campaigns,
                // additive alongside the scenarios below -- see
                // CampaignView.swift.
                if !contentStore.campaigns.isEmpty {
                    CampaignPickerSection(campaigns: contentStore.campaigns, session: session)
                }
                Section {
                    ForEach(contentStore.scenarios) { scenario in
                        NavigationLink {
                            ConversationSessionView(scenario: scenario, session: session)
                        } label: {
                            HStack(spacing: AlphonsoSpacing.sm + 4) {
                                Text(scenario.emoji).font(.largeTitle)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(scenario.title)
                                        .font(AlphonsoFont.sans(16, weight: .semiBold))
                                        .foregroundStyle(AlphonsoColor.ink)
                                    Text(scenario.blurb)
                                        .font(AlphonsoFont.sans(12))
                                        .foregroundStyle(AlphonsoColor.inkSoft)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        if !contentStore.campaigns.isEmpty {
                            Text("Scenarios")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .tracking(0.4)
                                .foregroundStyle(AlphonsoColor.ember)
                        }
                    }
                }
                .listRowBackground(AlphonsoColor.parchment)
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Practice speaking")
        }
        .tint(AlphonsoColor.moss)
    }
}

/// V1 scope: hold the mic button to record, release to send. No live
/// streaming/interruption -- one full turn at a time (record -> transcribe
/// -> chat reply -> speak), matching what /api/stt (pre-recorded, not
/// streaming) supports.
private struct ConversationSessionView: View {
    let scenario: Scenario
    let session: Session

    @State private var turns: [ChatMessage] = []
    @State private var recorder = TurnRecorder()
    @State private var isRecording = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
    // V3 package 3a: adaptive difficulty + pronunciation-clarity heuristic.
    @State private var cefrLevel: String?
    @State private var confidenceByTurnIndex: [Int: Double] = [:]

    private enum Phase: Equatable {
        case idle
        case transcribing
        case thinking
        case speaking
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, confidence: confidenceByTurnIndex[index]).id(index)
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) {
                    withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            micButton
                .padding()
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            turns = [ChatMessage(role: "assistant", content: scenario.opener)]
            // Best-effort -- if this fails, chat() just gets nil and skips
            // the difficulty hint, same as before this feature existed.
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

    private func bubble(for turn: ChatMessage, confidence: Double?) -> some View {
        VStack(alignment: turn.role == "user" ? .trailing : .leading, spacing: 2) {
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
            // V3 package 3a: lightweight pronunciation-clarity heuristic
            // from Deepgram's own utterance-level confidence, not real
            // phoneme-level scoring -- see AIConversationClient.transcribe.
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

    private var micButton: some View {
        Group {
            switch phase {
            case .transcribing, .thinking, .speaking:
                ProgressView(label(for: phase)).tint(AlphonsoColor.moss)
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

    private func label(for phase: Phase) -> String {
        switch phase {
        case .transcribing: return "Listening..."
        case .thinking: return "Thinking..."
        case .speaking: return "..."
        case .idle: return ""
        }
    }

    private func startRecording() {
        errorMessage = nil
        do {
            try recorder.start()
            isRecording = true
        } catch {
            errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
        }
    }

    private func stopRecordingAndSend() {
        guard isRecording else { return }
        isRecording = false
        guard let audio = recorder.stop() else { return }
        Task { await sendTurn(audio: audio) }
    }

    private func sendTurn(audio: Data) async {
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
        do {
            phase = .transcribing
            let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")
            guard !result.text.trimmingCharacters(in: .whitespaces).isEmpty else {
                phase = .idle
                return
            }
            if let confidence = result.confidence {
                confidenceByTurnIndex[turns.count] = confidence
            }
            turns.append(ChatMessage(role: "user", content: result.text))

            phase = .thinking
            let reply = try await client.chat(messages: turns, systemPrompt: scenario.systemPrompt, cefrLevel: cefrLevel)
            turns.append(ChatMessage(role: "assistant", content: reply))

            phase = .speaking
            let audioReply = try await client.synthesizeSpeech(text: reply)
            player = try AVAudioPlayer(data: audioReply)
            player?.play()
            phase = .idle
        } catch {
            errorMessage = "Something went wrong. Try again."
            phase = .idle
        }
    }
}

/// Wraps AVAudioRecorder for a single hold-to-talk turn: start() begins
/// recording to a fresh temp file, stop() finalizes it and returns the
/// recorded bytes (nil if nothing was captured).
@Observable
private final class TurnRecorder {
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    func start() throws {
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
        newRecorder.record()
        recorder = newRecorder
        fileURL = url
    }

    func stop() -> Data? {
        recorder?.stop()
        recorder = nil
        defer { fileURL = nil }
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }
}
