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

    /// The shared voice engine (permission, recorder, interruptions, stale callbacks after this card leaves).
    @State private var voice = VoiceSessionController()
    @State private var errorMessage: String?
    /// A capture came back empty. With `voice.microphoneUnavailable` this keeps typing open for the rest of the
    /// question, so a learner is never stuck on a mic that cannot produce an answer (no XP, no streak, no unlock).
    @State private var captureFailed = false
    private var micUnavailable: Bool { captureFailed || voice.microphoneUnavailable }
    /// Voice sends audio to Deepgram, so it needs the learner's AI consent.
    /// Without it the card shows the typing fallback (which sends nothing to
    /// any AI provider) and offers voice as an opt-in -- it must NOT replace
    /// the card or pop the lesson, or declining blocks every lesson that has
    /// a speak question (BACKLOG 0.0-z #2).
    @State private var hasAIConsent = AIDisclosureGate.isAcknowledged()
    @State private var showDisclosure = false

    private var canCapture: Bool { isConnected && !micUnavailable && hasAIConsent }
    /// Voice would work if the learner opted in -- worth offering the choice.
    private var voiceNeedsConsent: Bool { isConnected && !micUnavailable && !hasAIConsent }

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
                if voiceNeedsConsent {
                    Button {
                        showDisclosure = true
                    } label: {
                        Label("Use your voice instead", systemImage: "mic")
                    }
                    .buttonStyle(.alphonsoSecondary)
                }
                typingFallback
            }

            if let errorMessage = voice.failure?.userMessage() ?? errorMessage {
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
        // Consent is asked only if the learner chooses voice, and never by
        // blocking the lesson (see hasAIConsent above).
        .aiDisclosureSheet(isPresented: $showDisclosure) { hasAIConsent = true }
        .onAppear {
            // Allowed on another screen since this card was built.
            if !hasAIConsent && AIDisclosureGate.isAcknowledged() { hasAIConsent = true }
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
        }
        .onDisappear {
            voice.disappeared()
            voice.onCapture = nil
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
            if voice.isBusy {
                ProgressView("Checking what you said...").tint(AlphonsoColor.moss)
            } else {
                // Hold to talk, release to send: the same control as the conversation screens.
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: AlphonsoColor.moss,
                    recordingColor: AlphonsoColor.ember,
                    iconColor: AlphonsoColor.onPrimary,
                    accessibilityLabel: "Hold to say the phrase",
                    onPress: { if voice.pressBegan() { errorMessage = nil } },
                    onRelease: { voice.pressEnded() }
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
        if voice.isRecording { return "Listening — let go when you're done" }
        if voice.isBusy { return "Checking what you said..." }
        return picked == nil ? "Hold and say the phrase" : "Hold to say it again"
    }

    private var typingFallback: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
            Text(
                micUnavailable
                    ? "The microphone isn't available. Type the phrase instead."
                    : "You're offline, so speech can't be checked. Type the phrase instead."
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

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            // Nothing captured is not a wrong answer: `picked` stays, so Check cannot submit silence. Typing opens
            // up too.
            errorMessage = "Didn't catch that. Try again, or type the phrase."
            captureFailed = true
        case let .audio(audio, generation, debugTiming):
            await transcribe(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func transcribe(audio: Data, generation: Int, debugTiming: String) async {
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
                audio: audio, mimeType: "audio/m4a", course: course.sttCourseCode, debugTiming: debugTiming)
            // The lesson moved on while this was in flight: don't write into a card that is gone.
            guard voice.isCurrent(generation) else { return }
            let text = result.text.trimmingCharacters(in: .whitespaces)
            // Gate on the NORMALISED text: hesitation noise ("Um.") must not become an answer that costs a heart.
            if SpokenAnswer.normalise(text).isEmpty {
                errorMessage = "Didn't catch that. Try again."
            } else {
                picked = text
            }
        } catch {
            let tutorError = TutorError.from(error)
            // The account's consent was withdrawn elsewhere: back to typing, with voice offered as an opt-in.
            if tutorError == .aiConsentRequired { hasAIConsent = false }
            voice.fail(generation, tutorError)
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
