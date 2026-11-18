import AVFoundation
import SwiftUI
import LearnWithAlphonsoKit

/// Plays the model pronunciation of a word. Its own small player (not the call's VoiceSessionController): a miss replays
/// the model while the capture that caused it is still finishing, and the controller would refuse a second claim.
@MainActor
final class PronunciationModelPlayer {
    private var player: AVAudioPlayer?

    func play(_ audio: Data) -> Bool {
        VoiceAudioHooks.pauseOtherAudio?()
        try? VoiceSessionController.configureForVoice()
        guard let newPlayer = try? AVAudioPlayer(data: audio) else { return false }
        player = newPlayer
        return newPlayer.play()
    }

    func stop() { player?.stop(); player = nil }
}

/// Say it right (Practice drill): a word the learner has already learned, a "Hear it" model, and a recording judged on
/// how clearly it was understood. A miss replays the model and allows one retry, then the session goes on. No hearts,
/// no penalty.
///
/// Mirrors the web's SayItRight.tsx (PR #616). Speech goes through the existing /api/stt (the speaking quota, `stt`
/// kind) and the model through /api/tts; the verdict bands are `Pronunciation.judge` (the web's two thresholds). The
/// word pool is the vocabulary of the lessons the learner has completed, derived LIVE every time a session starts
/// (`Pronunciation.learnedPool`), never cached, so it grows as they learn.
struct PronunciationView: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course
    let onExit: () -> Void

    @State private var run = PronunciationSession(words: [])
    /// The completed-lesson list is being read: the session cannot start until it is known.
    @State private var loading = true
    @State private var loadFailed = false
    @State private var voice = VoiceSessionController()
    @State private var errorMessage: String?
    /// A capture or transcription failed: the mic is not useful right now, "Hear it" and the skip are.
    @State private var captureFailed = false
    @State private var showDisclosure = false
    @State private var modelPlayer = PronunciationModelPlayer()
    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(\.alphonsoDS) private var ds

    private var hasAIConsent: Bool { aiConsent.isGranted }
    private var micUnavailable: Bool { captureFailed || voice.microphoneUnavailable || voice.recorderStartFailed }
    private var canCapture: Bool { hasAIConsent && !micUnavailable }

    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                header
                if loading {
                    ProgressView("Getting your words...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else if loadFailed {
                    loadFailedNote
                } else if run.words.count < Pronunciation.minPool {
                    note("Learn a few words first. Say it right practises the words you have already met in lessons.")
                    Button("Back to Practice", action: onExit).buttonStyle(.dsButton(.secondary))
                } else if run.phase == .done {
                    summary
                } else {
                    round
                }
            }
            .padding(AlphonsoDS.Space.gutter)
            .environment(\.alphonsoDS, ds)
        }
        .background(ds.surface)
        .foregroundStyle(ds.ink)
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .aiDisclosureSheet(isPresented: $showDisclosure) {}
        // On the always-drawn root, never on content that can draw nothing.
        .task { await startSession() }
        .onAppear {
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
        }
        .onDisappear {
            voice.disappeared()
            voice.onCapture = nil
            modelPlayer.stop()
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack {
            Button(action: onExit) { Image(systemName: "xmark").dsText(.headline) }
                .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityLabel("Back to Practice")
            Spacer()
            Text("Say it right").dsText(.headline).accessibilityAddTraits(.isHeader)
            Spacer()
            Color.clear.frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch).accessibilityHidden(true)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).dsText(.body).foregroundStyle(ds.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AlphonsoDS.Space.s4)
            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
            .accessibilityAddTraits(.updatesFrequently)
    }

    private var loadFailedNote: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            note("Couldn't read the words you have learned just now. Check your connection and try again.")
            Button("Try again") { Task { await startSession() } }.buttonStyle(.dsButton(.primary))
            Button("Back to Practice", action: onExit).buttonStyle(.dsButton(.secondary))
        }
    }

    private var summary: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            PracticeStarsView(n: run.stars, prominent: true)
            Text("Practised \(run.words.count) words").dsText(.title).multilineTextAlignment(.center)
            Text("\(run.greatFirst) of \(run.words.count) said clearly first time. Every word you say out loud sticks a little more.")
                .dsText(.body).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            Button("Practise more") { Task { await startSession() } }.buttonStyle(.dsButton(.primary))
            Button("Back to Practice", action: onExit).buttonStyle(.dsButton(.secondary))
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
    }

    @ViewBuilder private var round: some View {
        if let word = run.current {
            Text("Word \(run.index + 1) of \(run.words.count)").dsText(.caption).foregroundStyle(ds.inkSoft)
            wordCard(word)
            if run.phase == .result {
                result
            } else {
                attempt
            }
        }
    }

    private func wordCard(_ word: VocabItem) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Text(word.term).dsText(.title).foregroundStyle(ds.brand).multilineTextAlignment(.center)
            if !word.meaning.isEmpty {
                Text(word.meaning).dsText(.caption).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            }
            // Always available, in every state: a microphone, consent or STT failure is never a dead end.
            Button { Task { await playModel(word.term) } } label: { Label("Hear it", systemImage: "speaker.wave.2.fill") }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
        }
        .frame(maxWidth: .infinity)
        .padding(AlphonsoDS.Space.s4)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
        .accessibilityElement(children: .contain)
    }

    private var attempt: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if canCapture {
                if run.phase == .retry, let verdict = run.verdict {
                    Text(Self.message(verdict)).dsText(.footnote).foregroundStyle(ds.choice)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                if voice.isBusy {
                    ProgressView("Checking how clear that was...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    micButton
                }
                Text(captureHint).dsText(.footnote).foregroundStyle(ds.inkSoft)
            } else {
                // Graceful: no consent, no microphone or a failed transcription. The word can always be heard.
                note(unavailableCopy)
                if !hasAIConsent {
                    Button { showDisclosure = true } label: { Label(AIConsentCopy.useVoiceInstead, systemImage: "mic") }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                }
            }
            if let message = visibleError { Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center) }
            Button(run.skipLabel) { errorMessage = nil; run.next() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                .disabled(voice.isRecording || voice.isBusy)
        }
        .frame(maxWidth: .infinity)
    }

    private var result: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if run.verdict == .great {
                Label("Great!", systemImage: "star.fill").dsText(.title).foregroundStyle(ds.rightInk)
            } else {
                Text("Good try. It gets easier each time.").dsText(.headline).multilineTextAlignment(.center)
            }
            Button(run.nextLabel) { errorMessage = nil; run.next() }.buttonStyle(.dsButton(.primary))
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var micButton: some View {
        // Hold to talk, release to send: the same control as the conversation screens and the speak question.
        HoldToTalkButton(
            isRecording: voice.isRecording,
            idleColor: ds.choice,
            recordingColor: ds.wrong,
            iconColor: ds.onChoice,
            recordingIconColor: ds.onWrong,
            accessibilityLabel: "Hold to say the word",
            onPress: { if voice.pressBegan() { errorMessage = nil } },
            onRelease: { voice.pressEnded() }
        )
    }

    // MARK: Copy

    /// What the verdict says on a miss. It never claims more than "clear": it reflects being understood, not which sound
    /// was off.
    private static func message(_ verdict: Pronunciation.Verdict) -> String {
        switch verdict {
        case .great: return "Great!"
        case .almost: return "Almost - say it a touch clearer."
        case .again: return "Let's try again."
        }
    }

    private var captureHint: String {
        if voice.isRecording { return "Listening. Let go when you are done." }
        if voice.isBusy { return "Checking how clear that was..." }
        return run.phase == .retry ? "Listen, then try once more." : "Hold and say it."
    }

    private var unavailableCopy: String {
        if !hasAIConsent { return "Say it right uses AI speech, which is turned off. You can still hear each word." }
        return "Recording needs a microphone and a connection, and this device can't record right now. You can still hear the word."
    }

    private var visibleError: String? {
        if voice.failure == .aiConsentRequired { return nil }
        return voice.failure?.cardMessage() ?? (voice.recorderStartFailed ? VoiceCopy.microphoneCouldNotStart : nil) ?? errorMessage
    }

    // MARK: Behaviour

    /// A fresh session from the LIVE learned pool: the completed lessons are read now, so a lesson finished since the last
    /// session is in this one.
    private func startSession() async {
        loading = true
        loadFailed = false
        errorMessage = nil
        captureFailed = false
        guard let accessToken = await session.freshAccessToken() else { loading = false; loadFailed = true; return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        guard let ids = try? await client.fetchCompletedLessonIds(course: course.code) else { loading = false; loadFailed = true; return }
        let pool = Pronunciation.learnedPool(units: contentStore.bundle(for: course).units, completedLessonIDs: Set(ids), course: course)
        // Too few words for a session: an empty run, shown as the "learn a few words first" state.
        run = pool.count >= Pronunciation.minPool ? PronunciationSession(words: Pronunciation.draw(pool)) : PronunciationSession(words: pool)
        loading = false
    }

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            // Nothing captured is not a miss.
            errorMessage = "Didn't catch that. Try again."
        case let .audio(audio, generation, debugTiming):
            await transcribe(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func transcribe(audio: Data, generation: Int, debugTiming: String) async {
        guard let accessToken = await session.freshAccessToken() else {
            captureFailed = true
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            let heard = try await Pronunciation.transcribe(client, audio: audio, course: course, debugTiming: debugTiming)
            guard voice.isCurrent(generation) else { return }
            let outcome = run.submit(transcript: heard.text, confidence: heard.confidence, course: course)
            switch outcome {
            case .retry:
                errorMessage = nil
                if let word = run.current { Task { await playModel(word.term) } }
            case .unheard:
                errorMessage = "Didn't catch that. Try again."
            case .great, .finished:
                errorMessage = nil
            }
        } catch {
            let tutorError = TutorError.from(error)
            // A failure (quota, network, repeated server errors) must never leave a dead end: the word can be heard.
            if tutorError != .aiConsentRequired { captureFailed = true }
            voice.fail(generation, tutorError)
        }
    }

    /// The model pronunciation from /api/tts, with the on-device voice when it cannot be fetched or played.
    private func playModel(_ term: String) async {
        let voiceID = VoicePrefsCache().voice(.alphonso, course: course.wireCode)
        if hasAIConsent, let accessToken = await session.freshAccessToken() {
            let client = AIConversationClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { accessToken },
                refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
            if let audio = try? await Pronunciation.modelAudio(client, term: term, voice: voiceID, course: course),
               modelPlayer.play(audio) { return }
        }
        FirstRunVoice.speak(term, course: course)
    }
}
