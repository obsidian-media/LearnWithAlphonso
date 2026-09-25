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
                    question: .speak(question), picked: picked, explanation: question.explanation)
            }
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
                Circle()
                    .fill(phase == .recording ? AlphonsoColor.ember : AlphonsoColor.moss)
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "mic.fill")
                            .foregroundStyle(AlphonsoColor.onPrimary)
                            .font(.title2)
                    )
                    .accessibilityLabel("Hold to say the phrase")
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in if phase != .recording { startRecording() } }
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
        guard let audio = recorder.stop() else {
            // Nothing captured is not a wrong answer: `picked` is left alone so
            // Check cannot submit silence. Typing opens up too, because a
            // recorder that produced no file will usually keep doing so.
            errorMessage = "Didn't catch that -- try again, or type the phrase."
            micUnavailable = true
            return
        }
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        Task { await transcribe(audio: audio, accessToken: accessToken) }
    }

    private func transcribe(audio: Data, accessToken: String) async {
        phase = .transcribing
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
        do {
            let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")
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

/// Wraps AVAudioRecorder for one held press: start() records to a fresh temp
/// file, stop() finalizes it and returns the bytes (nil if nothing was
/// captured). Same approach as ConversationView's TurnRecorder -- kept as its
/// own type for the same reason that one is private to its screen: the shared
/// piece worth sharing is the grading rule, not thirty lines of AVFoundation
/// setup that each screen configures slightly differently.
@Observable
final class SpeakTurnRecorder {
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    func start() throws {
        // Set before touching the session, so the flag is already true
        // when iOS delivers interruption-began to the podcast player --
        // that is how it tells an in-app mic takeover from a phone call.
        // See RecordingState.
        RecordingState.shared.began()
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
        newRecorder.record()
        recorder = newRecorder
        fileURL = url
    }

    func stop() -> Data? {
        RecordingState.shared.ended()
        recorder?.stop()
        recorder = nil
        // Hand the session back rather than leaving the app in a recording
        // category it no longer needs. .notifyOthersOnDeactivation lets
        // whatever was playing before resume.
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        defer { fileURL = nil }
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
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
}
