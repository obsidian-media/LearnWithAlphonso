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
                        ProgressView("Connecting to Hector...").tint(AlphonsoColor.ember)
                    case .ready:
                        HectorConversationView(session: session, hectorSession: hectorSession)
                    }
                }
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Hector")
        }
        .tint(AlphonsoColor.ember)
        // Hector re-parenting Phase 0 (docs/superpowers/specs/
        // 2026-09-26-hector-reparenting-design.md): records the pairing
        // between this account and the Cloud Voice account Hector just
        // enrolled, so a later account deletion can reach it. Same
        // reaction-to-state-change shape as RootView's own
        // `.onChange(of: remotePushRegistrar.deviceTokenHex)`.
        // Fire-and-forget: enrollment already succeeded by the time this
        // fires, so a slow or failing link call must never affect the
        // Hector session itself.
        .onChange(of: hectorSession.enrolledCloudVoiceUserID) { _, cloudVoiceUserID in
            // Send the Cloud Voice access token, never the id itself --
            // the server derives the id by verifying this token against
            // Cloud Voice's own project (see AccountClient.linkHectorAccount's
            // doc comment for why trusting a claimed id here was the bug).
            guard cloudVoiceUserID != nil,
                  let accessToken = session.accessToken,
                  case .ready(let hectorAccessToken) = hectorSession.state
            else { return }
            Task {
                let client = AccountClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
                try? await client.linkHectorAccount(cloudVoiceAccessToken: hectorAccessToken)
            }
        }
    }

    private var signInBody: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Text("Sign in to Hector")
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)

            AlphonsoMascotBanner(mascot: .hector, message: "Your personal AI tutor")
                .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.9)

            Text("Hector uses a separate account from your main Learn with Alphonso sign-in.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
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
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
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
        VStack(spacing: AlphonsoSpacing.sm) {
            TextField("Email", text: $email)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task { await hectorSession.requestCode(email: email) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Send code")
                }
            }
            .buttonStyle(.alphonsoEmber)
            .disabled(hectorSession.isBusy || !email.contains("@"))
        }
    }
}

private struct HectorCodeStep: View {
    let hectorSession: HectorSession
    let email: String
    @State private var code = ""

    var body: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            Text("Enter the code sent to \(email)")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
            TextField("6-digit code", text: $code)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
            Button {
                Task { await hectorSession.verifyCodeAndEnroll(code) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Verify")
                }
            }
            .buttonStyle(.alphonsoEmber)
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
                    withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
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
            let historyWithMemory = (memoryContext.map { [$0] } ?? []) + turns
            let reply = try await tutorClient.respond(sessionID: sessionID, text: text, language: "en-US", history: historyWithMemory)
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
    }

    func stop() -> Data? {
        RecordingState.shared.ended()
        recorder?.stop()
        recorder = nil
        defer { fileURL = nil }
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }
}
