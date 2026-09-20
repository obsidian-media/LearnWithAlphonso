import SwiftUI
import AVFoundation
import Observation
import UIKit
import LearnWithAlphonsoKit

/// Pro-only "Hector" mode: AlphonsoCompanion's Cloud Voice tutor persona,
/// an additional premium mode alongside the free standalone scenarios in
/// ConversationView (not a replacement). Speech-to-text still goes through
/// this app's own /api/stt (AIConversationClient, the main account's
/// session) -- only the chat reply + its TTS audio come from Cloud Voice's
/// TutorConversationClient, which needs HectorSession's separate
/// sign-in/enrollment first.
struct HectorView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    @State private var hectorSession = HectorSession()

    var body: some View {
        NavigationStack {
            Group {
                if !entitlementStore.isPro {
                    PaywallView(entitlementStore: entitlementStore)
                } else {
                    switch hectorSession.state {
                    case .signedOut, .awaitingCode:
                        signInBody
                    case .enrolling:
                        ProgressView("Connecting to Hector...")
                    case .ready:
                        HectorConversationView(session: session, hectorSession: hectorSession)
                    }
                }
            }
            .navigationTitle("Hector")
        }
    }

    private var signInBody: some View {
        VStack(spacing: 16) {
            Text("Sign in to Hector")
                .font(.title2.weight(.semibold))
            Text("Hector uses a separate account from your main Learn with Alphonso sign-in.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            switch hectorSession.state {
            case .signedOut:
                HectorEmailStep(hectorSession: hectorSession)
            case .awaitingCode(let email):
                HectorCodeStep(hectorSession: hectorSession, email: email)
            default:
                EmptyView()
            }

            if let errorMessage = hectorSession.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .frame(maxWidth: 360)
    }
}

private struct HectorEmailStep: View {
    let hectorSession: HectorSession
    @State private var email = ""

    var body: some View {
        VStack(spacing: 12) {
            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task { await hectorSession.requestCode(email: email) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView()
                } else {
                    Text("Send code").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(hectorSession.isBusy || !email.contains("@"))
        }
    }
}

private struct HectorCodeStep: View {
    let hectorSession: HectorSession
    let email: String
    @State private var code = ""

    var body: some View {
        VStack(spacing: 12) {
            Text("Enter the code sent to \(email)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            TextField("6-digit code", text: $code)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
            Button {
                Task { await hectorSession.verifyCodeAndEnroll(code) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView()
                } else {
                    Text("Verify").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(hectorSession.isBusy || code.isEmpty)
        }
    }
}

private struct HectorConversationView: View {
    let session: Session
    let hectorSession: HectorSession

    @State private var turns: [TutorConversationMessage] = []
    @State private var recorder = HectorTurnRecorder()
    @State private var isRecording = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
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
                    withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                }
            }

            if let errorMessage {
                Text(errorMessage).font(.footnote).foregroundStyle(.red).padding(.horizontal)
            }

            micButton.padding()
        }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns.map { ChatMessage(role: $0.role, content: $0.content) }
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
        }
    }

    private func bubble(for turn: TutorConversationMessage) -> some View {
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
                ProgressView().frame(maxWidth: .infinity)
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
        guard case .ready(let hectorAccessToken) = hectorSession.state else {
            errorMessage = "Hector session expired. Please sign in again."
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
                endpoint: AppConfig.cloudVoiceRespondEndpoint,
                accessToken: { hectorAccessToken },
                deviceID: UIDevice.current.identifierForVendor?.uuidString ?? sessionID
            )
            let reply = try await tutorClient.respond(sessionID: sessionID, text: text, language: "en-US", history: turns)
            turns.append(TutorConversationMessage(role: "assistant", content: reply.reply))

            phase = .speaking
            if let audioData = reply.audioData {
                player = try AVAudioPlayer(data: audioData)
                player?.play()
            }
            phase = .idle
        } catch {
            errorMessage = "Something went wrong. Try again."
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
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    func start() throws {
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
