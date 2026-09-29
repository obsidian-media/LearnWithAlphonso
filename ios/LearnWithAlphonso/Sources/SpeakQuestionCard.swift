import SwiftUI
import AVFoundation
import LearnWithAlphonsoKit

private let speakCardSynthesizer = AVSpeechSynthesizer()

/// The answer control for a "speak" question, shared by LessonPlayerView's
/// QuestionCard and ReviewQueueView's ReviewQuestionCard -- the two players are
/// separate renderers, and a question type wired into only one of them shows up
/// in the other as a card the learner cannot answer.
///
/// Mirrors the web's SpeakAnswer.tsx, including its two deliberate decisions:
/// the transcript is shown back and graded only on Check (speech-to-text
/// mishears things, and a learner who reads "we heard X" first says it again
/// instead of losing a heart to the microphone), and where speech cannot be
/// captured the control degrades to typing the phrase.
///
/// That fallback matters more here than on the web, because it also covers
/// being offline: transcription is a network call, and a lesson with a question
/// the learner cannot answer is a lesson they cannot complete -- no XP, no
/// streak, no unlock, and nothing on screen explaining why.
struct SpeakQuestionCard: View {
    let question: Question.Speak
    let course: Course
    let session: Session
    let isConnected: Bool
    let checked: Bool
    @Binding var picked: String?

    @State private var recorder = SpeakTurnRecorder()
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    // TEMPORARY (2026-09-28) -- see AIConversationClient.transcribe's
    // debugTiming doc comment. The real touch-down moment, independent of
    // however long the async permission-check/record() chain inside
    // startRecording() takes to actually begin capturing.
    @State private var pressBeganAt: Date?
    /// Set when the microphone itself could not be started (permission denied,
    /// hardware busy). Typing then becomes the only way to answer, so the
    /// fallback is shown for the rest of the question rather than leaving the
    /// learner stuck on a mic button that cannot work.
    @State private var micUnavailable = false

    private enum Phase: Equatable { case idle, recording, transcribing }

    private var canCapture: Bool { isConnected && !micUnavailable }

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
            Text("SPEAKING")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(question.prompt)
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)

            phraseCard

            if canCapture {
                captureControls
            } else {
                typingFallback
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
            }

            if checked {
                ExplanationView(
                    question: .speak(question), picked: picked, explanation: question.explanation,
                    course: course)
            }
        }
        .aiDisclosureGate()
        // 2026-09-29 whole-codebase audit: this screen had no onDisappear
        // at all, unlike its three sibling recording screens -- a view torn
        // down mid-hold (navigating back, a lesson finishing underneath it)
        // never fired the drag gesture's .onEnded, leaking
        // RecordingState's counter. See SpeakTurnRecorder.cancelIfRecording().
        .onDisappear {
            recorder.cancelIfRecording()
        }
    }

    private var phraseCard: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
            Text("YOUR PHRASE")
                .font(AlphonsoFont.sans(11, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(question.answer)
                .font(AlphonsoFont.sans(17, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Button {
                speakCardSynthesizer.stopSpeaking(at: .immediate)
                let utterance = AVSpeechUtterance(string: question.answer)
                utterance.voice = AVSpeechSynthesisVoice(language: course.speakLanguageCode)
                speakCardSynthesizer.speak(utterance)
            } label: {
                Label("Hear it first", systemImage: "speaker.wave.2.fill")
            }
            .buttonStyle(.alphonsoSecondary(fullWidth: false))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoSpacing.sm)
        .background(
            AlphonsoColor.parchment,
            in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
    }

    private var captureControls: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            if phase == .transcribing {
                ProgressView("Checking what you said...").tint(AlphonsoColor.moss)
            } else {
                // Hold to talk, release to send -- the same gesture the
                // conversation and campaign screens already use, so speaking
                // works the same way everywhere in the app.
                //
                // See ConversationView's identical mic button for why this
                // is a stable outer container hosting the gesture, with a
                // purely-visual color-changing Circle nested inside (found
                // live 2026-09-29, via real press/capture timing data): a
                // view mutating its OWN appearance in response to state a
                // gesture attached to it just set can reset the in-flight
                // gesture recognizer, firing a false release almost
                // instantly regardless of real hold duration.
                Color.clear
                    .frame(width: 72, height: 72)
                    .contentShape(Circle())
                    .overlay(
                        Circle()
                            .fill(phase == .recording ? AlphonsoColor.ember : AlphonsoColor.moss)
                            .overlay(
                                Image(systemName: "mic.fill")
                                    .foregroundStyle(AlphonsoColor.onPrimary)
                                    .font(.title2)
                            )
                            .allowsHitTesting(false)
                    )
                    .accessibilityLabel("Hold to say the phrase")
                    // VoiceOver normally intercepts touches on a control to
                    // drive its own swipe/explore navigation instead of
                    // passing them to a custom gesture recognizer -- a raw
                    // DragGesture like this one would otherwise never fire
                    // for a VoiceOver user at all. requiresActivation is the
                    // safer of the two direct-touch modes: a VoiceOver user
                    // must double-tap-and-hold to "activate" this element
                    // before their touch passes through to the drag gesture,
                    // so a normal exploratory swipe across the screen can't
                    // accidentally start a recording.
                    .accessibilityDirectTouch(true, options: .requiresActivation)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in
                                if phase != .recording {
                                    pressBeganAt = Date()
                                    startRecording()
                                }
                            }
                            .onEnded { _ in stopRecordingAndGrade() }
                    )
                    .disabled(checked)
            }
            Text(captureHint)
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)

            if let said = picked, !said.isEmpty {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                    Text("WE HEARD")
                        .font(AlphonsoFont.sans(11, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.inkSoft)
                    Text(said).font(AlphonsoFont.sans(15)).foregroundStyle(AlphonsoColor.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AlphonsoSpacing.sm)
                .background(
                    AlphonsoColor.surface,
                    in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var captureHint: String {
        switch phase {
        case .recording: return "Listening -- let go when you're done"
        case .transcribing: return "Checking what you said..."
        case .idle: return picked == nil ? "Hold and say the phrase" : "Hold to say it again"
        }
    }

    private var typingFallback: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
            Text(
                micUnavailable
                    ? "The microphone isn't available -- type the phrase instead."
                    : "You're offline, so speech can't be checked -- type the phrase instead."
            )
            .font(AlphonsoFont.sans(13))
            .foregroundStyle(AlphonsoColor.inkSoft)
            TextField(
                "Type the phrase", text: Binding(get: { picked ?? "" }, set: { picked = $0 })
            )
            .textFieldStyle(.plain)
            .padding(AlphonsoSpacing.sm)
            .alphonsoInputBackground()
            .disabled(checked)
        }
    }

    private func startRecording() {
        errorMessage = nil
        // Permission is asked for EXPLICITLY rather than left to the implicit
        // prompt AVAudioRecorder.record() raises. A denied microphone does not
        // make start() throw -- record() just returns false and the file stays
        // empty -- so the catch below never ran for the one case that matters,
        // and the learner was left holding a mic button that could never
        // produce an answer, with Check permanently disabled and no skip. That
        // is an unfinishable lesson: no XP, no streak, no unlock.
        requestMicrophonePermission { granted in
            guard granted else {
                micUnavailable = true
                phase = .idle
                errorMessage =
                    "Microphone access is off. Turn it on in Settings > Privacy > Microphone, or type the phrase."
                return
            }
            do {
                try recorder.start()
                phase = .recording
            } catch {
                micUnavailable = true
                phase = .idle
                errorMessage = "Couldn't access the microphone -- type the phrase instead."
            }
        }
    }

    /// Calls back on the main actor whether or not permission was granted. Uses
    /// the iOS 17+ API where available and the older session call below it,
    /// since the deployment target still includes iOS 16.
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

    private func stopRecordingAndGrade() {
        guard phase == .recording else { return }
        phase = .idle
        // TEMPORARY (2026-09-28) -- see AIConversationClient.transcribe's
        // debugTiming doc comment. Captured here, at the true touch-up
        // moment, not inside the Task below (which can start running
        // noticeably later).
        let pressElapsed = pressBeganAt.map { Date().timeIntervalSince($0) }
        Task {
            // See ConversationView.swift's identical sendTurn for why this
            // is freshAccessToken (not the raw, possibly-stale
            // session.accessToken) plus a refreshAccessToken backstop on
            // the client below: this screen was missed when that 401-retry
            // fix first shipped, so a session more than ~an hour old
            // 401'd here with no retry -- found live 2026-09-28, same bug
            // as HectorView's.
            guard let accessToken = await session.freshAccessToken() else {
                errorMessage = "You've been signed out. Please sign in again."
                return
            }
            // Same bug class as ConversationView/HectorView/CampaignView's
            // identical stop-and-send (swept for after finding it live,
            // 2026-09-28): a too-quick tap or the recorder's own hardware
            // warm-up can finalize before anything meaningful was
            // captured. The `recorder.stop() == nil` guard this replaced
            // only caught a genuinely missing file, not a tiny-but-real
            // one -- which would have reached api/stt.ts, been rejected
            // with "Empty or missing audio", and surfaced here as the
            // *generic* "Couldn't check that just now" from the catch
            // block below (this screen doesn't forward the server's own
            // message), an even more confusing symptom than the raw error
            // Practice/Hector showed for the exact same root cause.
            if let remaining = recorder.remainingTimeToMinimumDuration() {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
            let captureElapsed = recorder.elapsedSinceStart()
            guard let audio = await recorder.stop(), audio.count >= SpeakTurnRecorder.minimumAudioBytes else {
                // Nothing captured is not a wrong answer: `picked` is left alone so
                // Check cannot submit silence. Typing opens up too, because a
                // recorder that produced no file will usually keep doing so.
                errorMessage = "Didn't catch that -- try again, or type the phrase."
                micUnavailable = true
                return
            }
            let debugTiming = "press=\(pressElapsed.map { String(format: "%.2f", $0) } ?? "?")" +
                " capture=\(captureElapsed.map { String(format: "%.2f", $0) } ?? "?")"
            await transcribe(audio: audio, accessToken: accessToken, debugTiming: debugTiming)
        }
    }

    private func transcribe(audio: Data, accessToken: String, debugTiming: String) async {
        phase = .transcribing
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            // Found 2026-09-28, alongside the wire-format fix on
            // AIConversationClient.transcribe itself: this lesson's real
            // course was never being sent, so French/Spanish speaking
            // questions always had their audio transcribed with
            // Deepgram's English model regardless.
            let result = try await client.transcribe(
                audio: audio, mimeType: "audio/m4a", course: course.sttCourseCode, debugTiming: debugTiming
            )
            let text = result.text.trimmingCharacters(in: .whitespaces)
            // Nothing captured is NOT a wrong answer: `picked` stays as it was
            // so Check cannot submit silence and spend a heart on it. The gate
            // is on the NORMALISED text, because hesitation noise comes back as
            // real words ("Um.") that are non-empty here and normalise to
            // nothing at the grading site -- a raw-text gate let those through
            // as an answer and cost the learner a heart for clearing their
            // throat.
            if SpokenAnswer.normalise(text).isEmpty {
                errorMessage = "Didn't catch that -- try again."
            } else {
                picked = text
            }
        } catch {
            errorMessage = "Couldn't check that just now -- try again."
        }
        phase = .idle
    }
}

/// AVAudioRecorder.record() returns false rather than throwing on failure
/// -- this makes that a catchable error instead of a silently-ignored Bool.
private enum RecordingStartError: Error {
    case recordCallFailed
}

/// Wraps AVAudioRecorder for one held press: start() records to a fresh temp
/// file, stop() finalizes it and returns the bytes (nil if nothing was
/// captured). Same approach as ConversationView's TurnRecorder -- kept as its
/// own type for the same reason that one is private to its screen: the shared
/// piece worth sharing is the grading rule, not thirty lines of AVFoundation
/// setup that each screen configures slightly differently.
@Observable
final class SpeakTurnRecorder: NSObject, AVAudioRecorderDelegate {
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
            let audioSession = AVAudioSession.sharedInstance()
            // .defaultToSpeaker matters here in a way it does not on the
            // conversation screen: AVAudioSession is process-wide, and plain
            // .playAndRecord routes playback to the receiver. Without it, one
            // speaking question left "Hear it first", a listening question's TTS
            // and every other sound in the app playing quietly out of the earpiece
            // for the rest of the session -- and a review queue interleaves
            // speaking and listening items, so the learner meets that in one
            // sitting.
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try audioSession.setActive(true)

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + ".m4a")
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
        // Hand the session back rather than leaving the app in a recording
        // category it no longer needs. .notifyOthersOnDeactivation lets
        // whatever was playing before resume.
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
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
    /// takeover, permanently suppressing the podcast player's resume. This
    /// screen previously had no onDisappear at all.
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

extension Course {
    /// Locale for the phrase's model pronunciation, matching the web's
    /// `localeForCourse`.
    var speakLanguageCode: String {
        switch self {
        case .english: return "en-US"
        case .french: return "fr-FR"
        case .spanish: return "es-ES"
        }
    }

    /// Bare course code for api/stt.ts's `course` field -- matches
    /// `isCourse`'s web-side validator exactly ("en"/"fr"/"es"), a
    /// different format from `speakLanguageCode`'s locale strings above.
    var sttCourseCode: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }
}
