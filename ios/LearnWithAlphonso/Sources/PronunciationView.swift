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

/// Say it right ("Talk with Alphonso"): a warm 1:1 lesson. The word is the hero, shown in Alphonso's speech bubble with a
/// "Hear it" model button; he reacts in pose to each state with a short, varied line, and the learner's mic sits opposite
/// him (blue at rest, red while recording; hold to talk, double-tap to toggle for VoiceOver, auto-stop at the cap). A
/// miss replays the model and allows one retry, then the session goes on. No hearts, no penalty.
///
/// Mirrors the web's SayItRight.tsx (PR #616, redesigned after). Speech goes through the existing /api/stt (the speaking quota, `stt`
/// kind) and the model through /api/tts; the verdict bands are `Pronunciation.judge` (the web's two thresholds). The
/// word pool is the vocabulary of the lessons the learner has completed, derived LIVE every time a session starts
/// (`Pronunciation.learnedPool`), never cached, so it grows as they learn.
struct PronunciationView: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course
    let onExit: () -> Void
    /// Hand-picked words to drill (Say the picture's missed words). Nil draws from the learned pool as usual.
    var seedWords: [VocabItem]? = nil

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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                } else if seedWords == nil && run.words.count < Pronunciation.minPool {
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
            if !dynamicTypeSize.isAccessibilitySize {
                Image(SayItRightPose.levelupCheer.rawValue).resizable().scaledToFit().frame(height: 160)
                    .accessibilityHidden(true)
            }
            PracticeStarsView(n: run.stars, prominent: true)
            Text("Practised \(run.words.count) words").dsText(.title).multilineTextAlignment(.center)
            Text(run.clearlyLine).dsText(.headline).foregroundStyle(ds.brand).multilineTextAlignment(.center)
            Text("Every word you say out loud sticks a little more.")
                .dsText(.body).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            Button("Practise more") { Task { await startSession() } }.buttonStyle(.dsButton(.primary))
            Button("Back", action: onExit).buttonStyle(.dsButton(.secondary))
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
    }

    @ViewBuilder private var round: some View {
        if let word = run.current {
            Text("Word \(run.index + 1) of \(run.words.count)").dsText(.caption).foregroundStyle(ds.inkSoft)
            tutor(word)
            if run.phase == .result {
                result
            } else {
                attempt
            }
        }
    }

    /// Alphonso, in pose, with the word in his speech bubble. The pose hides at accessibility text sizes so the bubble
    /// (the word and the line) never clips.
    private func tutor(_ word: VocabItem) -> some View {
        HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
            if !dynamicTypeSize.isAccessibilitySize {
                Image(pose.rawValue).resizable().scaledToFit().frame(height: 176)
                    .id(pose)
                    .transition(reduceMotion ? AnyTransition.identity : AnyTransition.opacity.combined(with: .offset(y: 12)))
                    .accessibilityHidden(true)
            }
            wordBubble(word)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: pose)
    }

    private var listening: Bool { voice.isRecording || voice.isBusy }
    private var pose: SayItRightPose { run.pose(listening: listening) }

    /// What Alphonso says right now: the prompt, that he is listening, or the line for the last attempt.
    private var bubbleLine: String {
        if voice.isRecording { return SayItRight.listeningLine }
        if voice.isBusy { return SayItRight.checkingLine }
        if run.phase == .ask { return SayItRight.askLine }
        return run.line ?? SayItRight.askLine
    }

    private func wordBubble(_ word: VocabItem) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Text(bubbleLine).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
                .accessibilityAddTraits(.updatesFrequently)
                .onChange(of: bubbleLine) { _, line in AccessibilityNotification.Announcement(line).post() }
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
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble).stroke(ds.line, lineWidth: 1.5))
        .accessibilityElement(children: .contain)
    }

    private var attempt: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if canCapture {
                if voice.isBusy {
                    ProgressView(SayItRight.checkingLine).tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    // The learner's mic sits opposite Alphonso.
                    HStack { Spacer(minLength: 0); micButton }
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
            Button(run.nextLabel) { errorMessage = nil; run.next() }.buttonStyle(.dsButton(.primary))
        }
        .frame(maxWidth: .infinity)
    }

    private var micButton: some View {
        // Hold to talk, release to send; a double-tap toggles for VoiceOver; the recording stops itself at the cap.
        SayItRightMic(
            isRecording: voice.isRecording,
            reduceMotion: reduceMotion,
            onPress: { if voice.pressBegan() { errorMessage = nil } },
            onRelease: { voice.pressEnded() }
        )
    }

    // MARK: Copy

    private var captureHint: String {
        if voice.isRecording { return "Listening. Let go when you are done." }
        if voice.isBusy { return SayItRight.checkingLine }
        return run.phase == .retry ? SayItRight.retryHint : "Hold and say it."
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
        if let seedWords, !seedWords.isEmpty {
            run = PronunciationSession(words: seedWords)
            loading = false
            return
        }
        guard let accessToken = await session.freshAccessToken() else { loading = false; loadFailed = true; return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        guard let ids = try? await client.fetchCompletedLessonIds(course: course.wireCode) else { loading = false; loadFailed = true; return }
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

/// The learner's mic for Say it right: BLUE at rest, RED while recording (deliberately not Say the picture's gold), in a
/// ring that fills over the cap. Hold to talk, release to send; for assistive tech it is a button that says how to use
/// it and whether it is recording, and a double-tap toggles so recording never needs hold-and-drag.
private struct SayItRightMic: View {
    let isRecording: Bool
    let reduceMotion: Bool
    let onPress: () -> Void
    let onRelease: () -> Void
    @State private var fill: CGFloat = 0
    @Environment(\.alphonsoDS) private var ds

    private let size: CGFloat = 98

    var body: some View {
        ZStack {
            Circle().stroke(ds.ink.opacity(0.1), lineWidth: 4)
            Circle().trim(from: 0, to: fill)
                .stroke(ds.wrong, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle()
                .fill(isRecording ? ds.wrong : ds.choice)
                .padding(11)
                .shadow(color: isRecording ? ds.wrongEdge : ds.choiceEdge, radius: 0, y: 4)
                .overlay(
                    Image(systemName: "mic.fill").font(.system(size: size * 0.32))
                        .foregroundStyle(isRecording ? ds.onWrong : ds.onChoice)
                )
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Hold to say the word")
        .accessibilityValue(isRecording ? "Recording" : "Ready")
        .accessibilityHint("Press and hold, say the word, then let go to send it. Or double-tap to start, and double-tap to stop.")
        .accessibilityAddTraits(.isButton)
        .accessibilityDirectTouch(true, options: .requiresActivation)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded { _ in onRelease() }
        )
        .accessibilityAction {
            // VoiceOver: a double-tap toggles.
            if isRecording { onRelease() } else { onPress() }
        }
        .task(id: isRecording) {
            // The ring is full: stop and send.
            guard isRecording else { return }
            try? await Task.sleep(for: .seconds(SayItRight.maxRecordSeconds))
            if !Task.isCancelled && isRecording { onRelease() }
        }
        .onChange(of: isRecording) { _, recording in
            if reduceMotion {
                fill = recording ? 1 : 0
            } else if recording {
                fill = 0
                withAnimation(.linear(duration: SayItRight.maxRecordSeconds)) { fill = 1 }
            } else {
                withAnimation(.easeOut(duration: 0.2)) { fill = 0 }
            }
        }
    }
}
