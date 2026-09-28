import SwiftUI
import AVFoundation
import Observation
import UIKit
import LearnWithAlphonsoKit

/// Pro-only "Hector" mode: an AI voice tutor persona, an additional
/// premium mode alongside the free standalone scenarios in
/// ConversationView (not a replacement). Since the 2026-09-27 decouple it
/// runs entirely on the main account: speech-to-text, the chat reply, and
/// its TTS audio all go through this app's own backend
/// (AIConversationClient's /api/stt and TutorConversationClient's
/// /api/hector-respond). No separate sign-in or enrollment.
struct HectorView: View {
    let session: Session
    let entitlementStore: EntitlementStore

    var body: some View {
        NavigationStack {
            Group {
                if !entitlementStore.isPro {
                    PaywallView(entitlementStore: entitlementStore)
                } else {
                    // Hector runs in-account now (the 2026-09-27 decouple):
                    // no separate Cloud Voice sign-in or enrollment -- a Pro
                    // user's main session is the only auth Hector needs.
                    HectorConversationView(session: session)
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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var turns: [TutorConversationMessage] = []
    @State private var recorder = HectorTurnRecorder()
    @State private var isRecording = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
    // V3 package 3b -- "tutor persona memory." Loaded once per session
    // (this repo has no Hector transcript to recall, only durable facts
    // about the learner -- see TutorMemoryContext's doc comment) and
    // prepended to every respond() call's history, but never appended to
    // `turns` itself so it never renders as a chat bubble.
    @State private var memoryContext: TutorConversationMessage?
    private let sessionID = UUID().uuidString

    private enum Phase: Equatable {
        case idle, transcribing, thinking, speaking
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

            micButton.padding()
        }
        .background(AlphonsoColor.surface)
        .aiDisclosureGate()
        .task { await loadMemoryContext() }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns.map { ChatMessage(role: $0.role, content: $0.content) }
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
        }
    }

    /// Best-effort: a failed fetch just means this session starts without
    /// persona memory, same as a brand-new learner would -- never worth
    /// surfacing an error over.
    private func loadMemoryContext() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL,
            anonKey: AppConfig.supabasePublishableKey,
            accessToken: accessToken
        )
        let cefrLevel = try? await client.fetchCefrLevel(course: "en")
        let trend = (try? await client.fetchWeaknessTrend()) ?? []
        let openCategories = trend.filter { $0.openCount > 0 }.map(\.category)
        memoryContext = TutorMemoryContext.buildPrimingMessage(
            cefrLevel: cefrLevel ?? nil,
            openWeaknessCategories: openCategories
        )
    }

    private func bubble(for turn: TutorConversationMessage) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            if turn.role == "assistant" {
                // Hector's own visual presence in the one place he's
                // actually talking -- a small avatar instead of the plain
                // blank leading space every other bubble list in this app
                // still uses.
                Image("Hector")
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 26, height: 26)
                    .clipShape(Circle())
            } else {
                Spacer(minLength: 40)
            }
            Text(turn.content)
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(turn.role == "user" ? AlphonsoColor.onAccent : AlphonsoColor.ink)
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

    private var micButton: some View {
        Group {
            switch phase {
            case .transcribing, .thinking, .speaking:
                ProgressView().tint(AlphonsoColor.ember).frame(maxWidth: .infinity)
            case .idle:
                Circle()
                    .fill(isRecording ? AlphonsoColor.destructive : AlphonsoColor.ember)
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
        Task {
            // Same fix as ConversationView's identical stopRecordingAndSend
            // (found live 2026-09-28): a quick tap or the recorder's own
            // hardware warm-up can finalize before anything meaningful was
            // captured, which api/stt.ts's `file.size < 512` guard turns
            // into a raw "Empty or missing audio" server error. Give it a
            // real minimum run first, then drop a still-too-small result
            // silently -- same posture as an empty transcript just below.
            if let remaining = recorder.remainingTimeToMinimumDuration() {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
            guard let audio = recorder.stop(), audio.count >= HectorTurnRecorder.minimumAudioBytes else { return }
            await sendTurn(audio: audio)
        }
    }

    private func sendTurn(audio: Data) async {
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        do {
            // Transcription still goes through our own account's /api/stt.
            phase = .transcribing
            let sttClient = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let sttResult = try await sttClient.transcribe(audio: audio, mimeType: "audio/m4a")
            let text = sttResult.text
            guard !text.trimmingCharacters(in: .whitespaces).isEmpty else {
                phase = .idle
                return
            }
            turns.append(TutorConversationMessage(role: "user", content: text))

            phase = .thinking
            let tutorClient = TutorConversationClient(
                endpoint: AppConfig.hectorRespondEndpoint,
                accessToken: { accessToken },
                deviceID: UIDevice.current.identifierForVendor?.uuidString ?? sessionID
            )
            let historyWithMemory = (memoryContext.map { [$0] } ?? []) + turns
            let reply = try await tutorClient.respond(sessionID: sessionID, text: text, language: "en", history: historyWithMemory)
            turns.append(TutorConversationMessage(role: "assistant", content: reply.reply))

            phase = .speaking
            if let audioData = reply.audioData {
                player = try AVAudioPlayer(data: audioData)
                player?.play()
            }
            phase = .idle
        } catch {
            // Same fix as ConversationView.swift's identical catch block:
            // surface the server's own message (e.g. ai-quota.server.ts's
            // "Daily ... limit reached (N/day). Try again tomorrow.")
            // instead of a generic string that looks the same whether the
            // learner hit their daily quota or something actually broke.
            if case let AIConversationError.server(_, message?) = error, !message.isEmpty {
                errorMessage = message
            } else if case let TutorConversationError.server(_, message?) = error, !message.isEmpty {
                errorMessage = message
            } else {
                errorMessage = "Something went wrong. Try again."
            }
            phase = .idle
        }
    }
}

private extension TutorReply {
    var audioData: Data? {
        guard !audioBase64.isEmpty else { return nil }
        return Data(base64Encoded: audioBase64)
    }
}

/// Same recording approach as ConversationView's TurnRecorder -- duplicated
/// rather than shared, matching this codebase's existing pattern of small
/// file-private helpers per screen (see LessonPlayerView/ReviewQueueView's
/// duplicated questionID/Course.code).
@Observable
private final class HectorTurnRecorder {
    /// See ConversationView's identical TurnRecorder for why: matches
    /// api/stt.ts's own `file.size < 512` floor with margin, caught
    /// locally instead of round-tripping to the server for the same
    /// verdict.
    static let minimumAudioBytes = 4_096
    private static let minimumDuration: TimeInterval = 0.4

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var startedAt: Date?

    func start() throws {
        // Set before touching the session, so the flag is already true
        // when iOS delivers interruption-began to the podcast player --
        // that is how it tells an in-app mic takeover from a phone call.
        // See RecordingState.
        RecordingState.shared.began()
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .default)
        try audioSession.setActive(true)

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
        startedAt = Date()
    }

    func remainingTimeToMinimumDuration() -> TimeInterval? {
        guard let startedAt else { return nil }
        let remaining = Self.minimumDuration - Date().timeIntervalSince(startedAt)
        return remaining > 0 ? remaining : nil
    }

    func stop() -> Data? {
        RecordingState.shared.ended()
        recorder?.stop()
        recorder = nil
        startedAt = nil
        defer { fileURL = nil }
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }
}
