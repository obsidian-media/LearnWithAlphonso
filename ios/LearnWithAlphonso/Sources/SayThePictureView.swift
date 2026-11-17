import AVFoundation
import SwiftUI
import LearnWithAlphonsoKit

/// Plays the model pronunciation of a word. Its own small player (not the call's VoiceSessionController): a miss is
/// revealed while the capture that caused it is still finishing, and the controller would refuse a second claim.
@MainActor
final class SayThePictureModelPlayer {
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

/// Say the picture (Practice activity): a word's photo with no text, the learner says it. A miss reveals the written
/// word and plays the model, the learner repeats it once, and the session goes on. No hearts, no penalty.
///
/// Mirrors the web's SayThePicture.tsx. Speech goes through the existing /api/stt (the speaking quota, `stt` kind) and
/// the model through /api/tts; the pool is derived LIVE from the bundled vocabulary and its image table every time a
/// session starts (`SayThePicture.pool`), never cached.
struct SayThePictureView: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course
    let onExit: () -> Void

    @State private var run: SayThePictureSession
    @State private var voice = VoiceSessionController()
    @State private var errorMessage: String?
    /// A capture came back empty or the transcription failed: the mic is not useful right now, "Show me the word" is.
    @State private var captureFailed = false
    @State private var showDisclosure = false
    @State private var modelPlayer = SayThePictureModelPlayer()
    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(contentStore: ContentStore, session: Session, course: Course, onExit: @escaping () -> Void) {
        self.contentStore = contentStore
        self.session = session
        self.course = course
        self.onExit = onExit
        _run = State(initialValue: Self.newRun(contentStore: contentStore, course: course))
    }

    /// A fresh session from the live pool: the image table is read now, so a new photo batch is in the next session.
    private static func newRun(contentStore: ContentStore, course: Course) -> SayThePictureSession {
        let pool = SayThePicture.pool(units: contentStore.bundle(for: course).units, images: contentStore.vocabImages)
        // Too few words for a session: an empty run, shown as the "not enough words" state.
        guard pool.count >= SayThePicture.minPool else { return SayThePictureSession(words: []) }
        return SayThePictureSession(words: SayThePicture.draw(pool))
    }

    private var poolTooSmall: Bool { run.words.isEmpty }
    private var hasAIConsent: Bool { aiConsent.isGranted }
    private var micUnavailable: Bool { captureFailed || voice.microphoneUnavailable || voice.recorderStartFailed }
    private var canCapture: Bool { hasAIConsent && !micUnavailable }

    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                header
                if poolTooSmall {
                    note("Not enough words with pictures yet. Check back soon.")
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
            Text("Say the picture").dsText(.headline).accessibilityAddTraits(.isHeader)
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

    private var summary: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            PracticeStarsView(n: run.stars, prominent: true)
            Text("Practised \(run.words.count) words").dsText(.title).multilineTextAlignment(.center)
            Text("\(run.firstTry) of \(run.words.count) said first time. Every word you practise sticks a little more.")
                .dsText(.body).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            Button("Practise more") {
                run = Self.newRun(contentStore: contentStore, course: course)
                errorMessage = nil
                captureFailed = false
            }.buttonStyle(.dsButton(.primary))
            Button("Back to Practice", action: onExit).buttonStyle(.dsButton(.secondary))
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
    }

    @ViewBuilder private var round: some View {
        if let word = run.current {
            Text("Word \(run.index + 1) of \(run.words.count)").dsText(.caption).foregroundStyle(ds.inkSoft)
            // A new id per word so the image's load state never carries over to the next picture.
            VocabImageView(image: word.image, cardHeight: AlphonsoDS.Space.s12 * 5, decorative: run.phase == .ask)
                .id(word.image.url)
            switch run.phase {
            case .ask: ask
            case .right: right(word)
            case .reveal: reveal(word)
            case .done: EmptyView()
            }
        }
    }

    private var ask: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if canCapture {
                if voice.isBusy {
                    ProgressView("Checking what you said...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    micButton(label: "Hold to say the word")
                }
                Text(captureHint).dsText(.footnote).foregroundStyle(ds.inkSoft)
            } else {
                // Graceful: no consent, no microphone or a failed transcription. The word can always be revealed.
                note(unavailableCopy)
                if !hasAIConsent {
                    Button { showDisclosure = true } label: { Label(AIConsentCopy.useVoiceInstead, systemImage: "mic") }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                }
            }
            if let message = visibleError { Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center) }
            Button("Show me the word") { revealWord() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                .disabled(voice.isRecording || voice.isBusy)
        }
        .frame(maxWidth: .infinity)
    }

    private func right(_ word: SayThePicture.PictureWord) -> some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            Label(word.term, systemImage: "star.fill").dsText(.title).foregroundStyle(ds.rightInk)
            Button(run.nextLabel) { run.next() }.buttonStyle(.dsButton(.primary))
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func reveal(_ word: SayThePicture.PictureWord) -> some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            VStack(spacing: AlphonsoDS.Space.s2) {
                Text("It is").dsText(.overline).foregroundStyle(ds.inkSoft)
                Text(word.term).dsText(.title).foregroundStyle(ds.brand)
                Button { Task { await playModel(word.term) } } label: { Label("Hear it", systemImage: "speaker.wave.2.fill") }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            }
            .frame(maxWidth: .infinity)
            .padding(AlphonsoDS.Space.s4)
            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
            .accessibilityElement(children: .contain)

            Text(revealHint).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            if let message = visibleError { Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center) }
            if run.heard == nil && canCapture {
                if voice.isBusy {
                    ProgressView("Checking what you said...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    micButton(label: "Hold to say the word")
                }
            }
            Button(run.nextWordLabel) { errorMessage = nil; run.next() }
                .buttonStyle(.dsButton(run.heard == nil ? .secondary : .primary))
                .disabled(voice.isRecording || voice.isBusy)
        }
        .frame(maxWidth: .infinity)
    }

    private func micButton(label: String) -> some View {
        // Hold to talk, release to send: the same control as the conversation screens and the speak question.
        HoldToTalkButton(
            isRecording: voice.isRecording,
            idleColor: ds.choice,
            recordingColor: ds.wrong,
            iconColor: ds.onChoice,
            recordingIconColor: ds.onWrong,
            accessibilityLabel: label,
            onPress: { if voice.pressBegan() { errorMessage = nil } },
            onRelease: { voice.pressEnded() }
        )
    }

    // MARK: Copy

    private var captureHint: String {
        if voice.isRecording { return "Listening. Let go when you are done." }
        if voice.isBusy { return "Checking what you said..." }
        return "What is this? Hold and say it."
    }

    private var revealHint: String {
        if voice.isRecording { return "Listening. Let go when you are done." }
        if voice.isBusy { return "Checking what you said..." }
        return run.heard != nil ? "Nice. That is it for this word." : "Now say it once yourself."
    }

    private var unavailableCopy: String {
        if !hasAIConsent { return "Saying the picture uses AI speech, which is turned off. You can still see each word." }
        return "Say the picture needs a microphone and a connection, and this device can't record right now. You can still see each word."
    }

    private var visibleError: String? {
        if voice.failure == .aiConsentRequired { return nil }
        return voice.failure?.cardMessage() ?? (voice.recorderStartFailed ? VoiceCopy.microphoneCouldNotStart : nil) ?? errorMessage
    }

    // MARK: Behaviour

    private func revealWord() {
        guard run.showWord(), let word = run.current else { return }
        Task { await playModel(word.term) }
    }

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            // Nothing captured is not a miss.
            errorMessage = "Didn't catch that. Try again, or tap Show me the word."
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
            let text = try await SayThePicture.transcribe(client, audio: audio, course: course, debugTiming: debugTiming)
            guard voice.isCurrent(generation) else { return }
            let outcome = run.submit(transcript: text, course: course)
            switch outcome {
            case .reveal:
                if let word = run.current { Task { await playModel(word.term) } }
            case .unheard:
                errorMessage = "Didn't catch that. Try again."
            case .right, .repeated:
                errorMessage = nil
            }
        } catch {
            let tutorError = TutorError.from(error)
            // A failure (quota, network, repeated server errors) must never leave a dead end: the word can be shown.
            if tutorError != .aiConsentRequired { captureFailed = true }
            voice.fail(generation, tutorError)
        }
    }

    /// The model pronunciation from /api/tts, with the on-device voice when it cannot be fetched or played.
    private func playModel(_ term: String) async {
        let courseCode = course.wireCode
        let voiceID = VoicePrefsCache().voice(.alphonso, course: courseCode)
        if hasAIConsent, let accessToken = await session.freshAccessToken() {
            let client = AIConversationClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { accessToken },
                refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
            if let audio = try? await SayThePicture.modelAudio(client, term: term, voice: voiceID, course: course),
               modelPlayer.play(audio) { return }
        }
        FirstRunVoice.speak(term, course: course)
    }
}
