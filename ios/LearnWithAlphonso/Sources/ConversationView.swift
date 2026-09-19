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
            List(contentStore.scenarios) { scenario in
                NavigationLink {
                    ConversationSessionView(scenario: scenario, session: session)
                } label: {
                    HStack(spacing: 12) {
                        Text(scenario.emoji).font(.largeTitle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(scenario.title).font(.body.weight(.semibold))
                            Text(scenario.blurb).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Practice speaking")
        }
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
                            bubble(for: turn).id(index)
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
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            micButton
                .padding()
        }
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            turns = [ChatMessage(role: "assistant", content: scenario.opener)]
        }
    }

    private func bubble(for turn: ChatMessage) -> some View {
        HStack {
            if turn.role == "assistant" { Spacer(minLength: 40) }
            Text(turn.content)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(turn.role == "user" ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))
            if turn.role == "user" { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    private var micButton: some View {
        Group {
            switch phase {
            case .transcribing, .thinking, .speaking:
                ProgressView(label(for: phase))
            case .idle:
                Circle()
                    .fill(isRecording ? Color.red : Color.accentColor)
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
            let text = try await client.transcribe(audio: audio, mimeType: "audio/m4a")
            guard !text.trimmingCharacters(in: .whitespaces).isEmpty else {
                phase = .idle
                return
            }
            turns.append(ChatMessage(role: "user", content: text))

            phase = .thinking
            let reply = try await client.chat(messages: turns, systemPrompt: scenario.systemPrompt)
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
