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
    // 2026-09-30 audit (Fable, Codex #3) -- see ConversationView's
    // identical isRequestingMic/wantsToStop for the full reasoning: closes
    // the window where a DragGesture's repeated .onChanged during a hold
    // (before the async permission callback resolves) could call
    // startRecording() more than once, and the window where a tap shorter
    // than that same hop leaves a recording with no way left to stop it.
    @State private var isRequestingMic = false
    @State private var wantsToStop = false
    // 2026-09-30 audit (fresh-context pre-ship review) -- see
    // ConversationView's identical recordingGeneration/isTornDown for the
    // full reasoning: closes the shared-recorder rapid-double-press race
    // (a stale delayed stop() operating on a NEWER press's live
    // recording) and the in-flight-permission-request teardown gap.
    @State private var recordingGeneration = 0
    @State private var isTornDown = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
    // TEMPORARY (2026-09-28) -- see AIConversationClient.transcribe's
    // debugTiming doc comment. The real touch-down moment, independent of
    // however long the async permission-check/record() chain inside
    // startRecording() takes to actually begin capturing.
    @State private var pressBeganAt: Date?
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
            // See ConversationView's identical onDisappear/isTornDown for
            // why this must be set before cancelIfRecording(), not instead
            // of it -- that only covers an already-started recorder.
            isTornDown = true
            recorder.cancelIfRecording()
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
        VStack(spacing: 6) {
            Group {
                switch phase {
                case .transcribing, .thinking, .speaking:
                    ProgressView().tint(AlphonsoColor.ember).frame(maxWidth: .infinity)
                case .idle:
                    // See ConversationView's identical mic button for why this
                    // is a stable outer container hosting the gesture, with a
                    // purely-visual color-changing Circle nested inside
                    // (found live 2026-09-29, via real press/capture timing
                    // data): a view mutating its OWN appearance in response to
                    // state a gesture attached to it just set can reset the
                    // in-flight gesture recognizer, firing a false release
                    // almost instantly regardless of real hold duration.
                    Color.clear
                        .frame(width: 72, height: 72)
                        .contentShape(Circle())
                        .overlay(
                            Circle()
                                .fill(isRecording ? AlphonsoColor.destructive : AlphonsoColor.ember)
                                .overlay(Image(systemName: "mic.fill").foregroundStyle(.white).font(.title2))
                                .allowsHitTesting(false)
                        )
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { _ in
                                    if !isRecording && !isRequestingMic {
                                        pressBeganAt = Date()
                                        isRequestingMic = true
                                        recordingGeneration += 1
                                        startRecording()
                                    }
                                }
                                .onEnded { _ in
                                    if isRequestingMic {
                                        wantsToStop = true
                                    } else {
                                        stopRecordingAndSend()
                                    }
                                }
                        )
                        .accessibilityLabel("Hold to talk to Hector")
                }
            }
            // TestFlight feedback (2026-09-29): "the listening period is
            // either too short or doesn't want to listen." Real production
            // debugTiming data showed the actual touch-down-to-release span
            // was consistently under 0.2s across ten separate attempts --
            // this screen had ZERO on-screen text saying the button must be
            // held, unlike SpeakQuestionCard's "Hold and say the phrase."
            // Matches that screen's existing pattern.
            if phase == .idle {
                Text(isRecording ? "Listening -- release to send" : "Hold to talk")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func startRecording() {
        errorMessage = nil
        // Permission is asked for EXPLICITLY rather than left to the implicit
        // prompt AVAudioRecorder.record() raises -- see ConversationView's
        // identical startRecording for the full story (found live testing
        // Hector specifically, 2026-09-28: the minimum-duration fix alone
        // did not resolve a repeat "Empty or missing audio" report, because
        // a denied/never-granted microphone means record() silently returns
        // false and produces an empty file regardless of how long the
        // button is held).
        requestMicrophonePermission { granted in
            isRequestingMic = false
            // See ConversationView's identical guard/isTornDown comment.
            guard !isTornDown else { return }
            guard granted else {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
                wantsToStop = false
                return
            }
            do {
                try recorder.start()
                isRecording = true
                if wantsToStop {
                    wantsToStop = false
                    stopRecordingAndSend()
                }
            } catch {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
                wantsToStop = false
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
        // See ConversationView's identical recordingGeneration comment.
        let myGeneration = recordingGeneration
        // TEMPORARY (2026-09-28) -- see AIConversationClient.transcribe's
        // debugTiming doc comment. Captured here, at the true touch-up
        // moment, not inside the Task below (which can start running
        // noticeably later).
        let pressElapsed = pressBeganAt.map { Date().timeIntervalSince($0) }
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
            // See ConversationView's identical guard's own comment: a
            // newer press already claimed the shared recorder during the
            // sleep above.
            guard myGeneration == recordingGeneration else { return }
            let captureElapsed = recorder.elapsedSinceStart()
            guard let audio = await recorder.stop(), audio.count >= HectorTurnRecorder.minimumAudioBytes else { return }
            let debugTiming = "press=\(pressElapsed.map { String(format: "%.2f", $0) } ?? "?")" +
                " capture=\(captureElapsed.map { String(format: "%.2f", $0) } ?? "?")"
            await sendTurn(audio: audio, debugTiming: debugTiming)
        }
    }

    private func sendTurn(audio: Data, debugTiming: String) async {
        // See ConversationView.swift's identical sendTurn for why this is
        // freshAccessToken (not the raw, possibly-stale session.accessToken)
        // plus a refreshAccessToken backstop on the client below: this
        // screen was missed when that 401-retry fix first shipped, so a
        // session more than ~an hour old 401'd here with no retry, forcing
        // a full manual sign-out/sign-in -- found live 2026-09-28.
        guard let accessToken = await session.freshAccessToken() else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        let sttClient = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            // Transcription still goes through our own account's /api/stt.
            phase = .transcribing
            let sttResult = try await sttClient.transcribe(audio: audio, mimeType: "audio/m4a", debugTiming: debugTiming)
            let text = sttResult.text
            guard !text.trimmingCharacters(in: .whitespaces).isEmpty else {
                // Silent-reset-to-idle here (no message) was reported live
                // 2026-09-28 as "hits a timeout" -- a run of these in a row
                // (the underlying empty-transcript bug is still being
                // chased server-side) with zero feedback reads as the app
                // hanging, not as a recognized, retryable failure. Matches
                // SpeakQuestionCard's existing message for the same case.
                errorMessage = "Didn't catch that -- try again."
                phase = .idle
                return
            }
            turns.append(TutorConversationMessage(role: "user", content: text))

            phase = .thinking
            // TutorConversationClient has no 401-retry of its own (unlike
            // AIConversationClient above) -- re-checking freshness here
            // rather than reusing the token captured before the STT round
            // trip closes that gap without needing to add retry logic to
            // a second client for what would still be a rare case.
            guard let tutorAccessToken = await session.freshAccessToken() else {
                errorMessage = "You've been signed out. Please sign in again."
                return
            }
            let tutorClient = TutorConversationClient(
                endpoint: AppConfig.hectorRespondEndpoint,
                accessToken: { tutorAccessToken },
                deviceID: UIDevice.current.identifierForVendor?.uuidString ?? sessionID
            )
            let historyWithMemory = (memoryContext.map { [$0] } ?? []) + turns
            let reply = try await tutorClient.respond(sessionID: sessionID, text: text, language: "en", history: historyWithMemory)
            turns.append(TutorConversationMessage(role: "assistant", content: reply.reply))

            phase = .speaking
            if let audioData = reply.audioData {
                player = try AVAudioPlayer(data: audioData)
                // Same discarded-Bool shape as AVAudioRecorder.record()
                // (found in the same sweep, 2026-09-28): play() can return
                // false without throwing. The turn already succeeded (the
                // reply text is appended above), so this stays
                // informational rather than resetting the turn as failed.
                if player?.play() == false {
                    errorMessage = "Got a reply, but couldn't play it back."
                }
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

/// AVAudioRecorder.record() returns false rather than throwing on failure
/// -- this makes that a catchable error instead of a silently-ignored Bool.
private enum RecordingStartError: Error {
    case recordCallFailed
}

/// Same recording approach as ConversationView's TurnRecorder -- duplicated
/// rather than shared, matching this codebase's existing pattern of small
/// file-private helpers per screen (see LessonPlayerView/ReviewQueueView's
/// duplicated questionID/Course.code).
@Observable
private final class HectorTurnRecorder: NSObject, AVAudioRecorderDelegate {
    /// See ConversationView's identical TurnRecorder for why: matches
    /// api/stt.ts's own `file.size < 512` floor with margin, caught
    /// locally instead of round-tripping to the server for the same
    /// verdict.
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
        // (setCategory, setActive, the recorder init, record() itself)
        // still calls the matching ended() -- see ConversationView's
        // identical TurnRecorder.start() for the full reasoning.
        RecordingState.shared.began()
        do {
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

    /// TEMPORARY (2026-09-28) -- see AIConversationClient.transcribe's
    /// debugTiming doc comment. Reads startedAt without clearing it
    /// (unlike stop(), which nils it as part of finalizing), so this must
    /// be called before stop().
    func elapsedSinceStart() -> TimeInterval? {
        guard let startedAt else { return nil }
        return Date().timeIntervalSince(startedAt)
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

    /// See ConversationView's identical TurnRecorder.cancelIfRecording()
    /// for the full reasoning (2026-09-29 whole-codebase audit): a view
    /// torn down mid-hold never fires the drag gesture's .onEnded, so
    /// without this, RecordingState's counter leaks and every later real
    /// phone-call interruption is wrongly treated as an in-app mic
    /// takeover, permanently suppressing the podcast player's resume.
    func cancelIfRecording() {
        guard let recorder else { return }
        recorder.stop()
        self.recorder = nil
        fileURL = nil
        startedAt = nil
        RecordingState.shared.ended()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
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
