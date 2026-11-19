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

/// Say the picture (Practice activity): a word's photo with no text, full-bleed, and the learner says it. A frosted
/// stage at the bottom holds the hold-to-talk ring; Alphonso reacts in pose. A miss reveals the written word ON the
/// photo and plays the model, the learner repeats it once, and the session goes on. No hearts, no penalty.
///
/// Mirrors the web's SayThePicture.tsx. Speech goes through the existing /api/stt (the speaking quota, `stt` kind) and
/// the model through /api/tts; the pool is derived LIVE from the bundled vocabulary and its image table every time a
/// session starts (`SayThePicture.pool`), never cached.
struct SayThePictureView: View {
    /// The summary's "add them to your review deck" progress.
    private enum SaveState: Equatable {
        case idle, saving
        case saved(Int, skipped: Int)
        case failed(String)
    }

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
    /// The missed words handed to Say it right from the summary; nil while on this screen.
    @State private var drillWords: [VocabItem]?
    @State private var saveState: SaveState = .idle
    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
    private var pose: SayPicturePose { SayPicturePose.pose(phase: run.phase, listening: voice.isRecording) }

    var body: some View {
        if let words = drillWords {
            // The same Say it right drill, handed exactly the words missed here.
            PronunciationView(contentStore: contentStore, session: session, course: course, onExit: { drillWords = nil }, seedWords: words)
        } else {
            screen
        }
    }

    private var screen: some View {
        Group {
            if poolTooSmall || run.phase == .done {
                ScrollView {
                    VStack(spacing: AlphonsoDS.Space.s4) {
                        header
                        if poolTooSmall {
                            note("Not enough words with pictures yet. Check back soon.")
                        } else {
                            summary
                        }
                    }
                    .padding(AlphonsoDS.Space.gutter)
                    .environment(\.alphonsoDS, ds)
                }
                .background(ds.surface)
                .foregroundStyle(ds.ink)
            } else {
                immersive
            }
        }
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

    // MARK: Summary

    private var summary: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            PracticeStarsView(n: run.stars, prominent: true)
            Text("Practised \(run.words.count) words").dsText(.title).multilineTextAlignment(.center)
            Text("\(run.firstTry) of \(run.words.count) said first time. Every word you practise sticks a little more.")
                .dsText(.body).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            recapGrid
            if !run.missedWords.isEmpty { crossLinks }
            Button("Practise more") {
                run = Self.newRun(contentStore: contentStore, course: course)
                errorMessage = nil
                captureFailed = false
                saveState = .idle
            }.buttonStyle(.dsButton(.primary))
            Button("Back to Practice", action: onExit).buttonStyle(.dsButton(.secondary))
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
    }

    /// Every photo of the session: said first time wears a gold ring, a missed one a retry mark.
    private var recapGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: AlphonsoDS.Space.s2)], spacing: AlphonsoDS.Space.s2) {
            ForEach(Array(run.recap.enumerated()), id: \.offset) { _, entry in
                let first = entry.result == .first
                VStack(spacing: AlphonsoDS.Space.s1) {
                    VocabImageView(image: entry.word.image, thumbnailSize: 72, decorative: true)
                        .overlay(
                            RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous)
                                .stroke(first ? ds.action : ds.line, lineWidth: first ? 3 : 1.5)
                        )
                        .overlay(alignment: .topTrailing) {
                            if !first {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.caption2.weight(.heavy)).foregroundStyle(ds.brand)
                                    .padding(4).background(ds.card, in: Circle()).padding(3)
                            }
                        }
                    Text(entry.word.term).dsText(.caption).lineLimit(1).minimumScaleFactor(0.7)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(entry.word.term), \(first ? "said first time" : "missed")")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your pictures")
    }

    /// The two ways on from a miss: drill the words in Say it right, or put them in the review deck.
    private var crossLinks: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Button("Say it right the ones you missed") { drillWords = run.missedWords.map(\.vocabItem) }
                .buttonStyle(.dsButton(.secondary))
            if SavedWordPolicy.allowsSaving(inCourse: course.wireCode) && !run.missedWords.filter({ SayThePicture.isSavable($0.term) }).isEmpty {
                Button(saveTitle) { Task { await saveMissed() } }
                    .buttonStyle(.dsButton(.secondary))
                    .disabled(saveState == .saving || isSaved)
            }
            if let message = saveMessage {
                Text(message).dsText(.footnote)
                    .foregroundStyle(isSaved ? ds.inkSoft : ds.wrongInk).multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private var isSaved: Bool { if case .saved = saveState { return true } else { return false } }
    private var saveTitle: String {
        switch saveState {
        case .saving: return "Adding..."
        case .saved: return "Added to your review deck"
        default: return "Add them to your review deck"
        }
    }
    private var saveMessage: String? {
        switch saveState {
        case let .saved(count, skipped):
            let base = "\(count) \(count == 1 ? "word" : "words") added to your review deck."
            return skipped > 0 ? base + " Phrases can't be saved, so those stayed out." : base
        case let .failed(message): return message
        default: return nil
        }
    }

    // MARK: Round (full-bleed photo)

    private var immersive: some View {
        ZStack {
            if let word = run.current {
                // A new id per word so the image's load state and the Ken Burns drift never carry over.
                SayPictureHero(image: word.image, revealed: run.phase != .ask, reduceMotion: reduceMotion)
                    .id(word.image.url)
                LinearGradient(
                    stops: [.init(color: Color.black.opacity(0.42), location: 0), .init(color: .clear, location: 0.16),
                            .init(color: .clear, location: 0.36), .init(color: Color.black.opacity(0.14), location: 0.56)],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)

                VStack(spacing: 0) {
                    topBar
                    switch run.phase {
                    case .right: winOverlay(word)
                    case .reveal: revealOverlay(word)
                    default: EmptyView()
                    }
                    Spacer(minLength: 0)
                    if !dynamicTypeSize.isAccessibilitySize { tutor }
                    stage(word)
                }
            }
        }
        .foregroundStyle(.white)
    }

    private var topBar: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Button(action: onExit) {
                Image(systemName: "xmark").dsText(.headline).foregroundStyle(.white)
                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
            }
            .accessibilityLabel("Back to Practice")
            HStack(spacing: 5) {
                ForEach(0..<run.words.count, id: \.self) { i in
                    Capsule()
                        .fill(dotColor(i))
                        .frame(width: i == run.index ? 20 : 7, height: 7)
                        .shadow(color: .black.opacity(0.3), radius: 1, y: 1)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Say the picture, word \(run.index + 1) of \(run.words.count)")
            .accessibilityAddTraits(.isHeader)
            Color.clear.frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch).accessibilityHidden(true)
        }
        .padding(.horizontal, 14).padding(.top, AlphonsoDS.Space.s2)
    }

    private func dotColor(_ i: Int) -> Color {
        if i == run.index { return .white }
        if run.results.indices.contains(i) { return run.results[i] == .first ? ds.action : Color.white.opacity(0.8) }
        return Color.white.opacity(0.45)
    }

    /// The word stamps on, a few sparks and the combo chip. Static under Reduce Motion.
    private func winOverlay(_ word: SayThePicture.PictureWord) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Label(run.combo >= 2 ? "\(run.combo) in a row" : "First try", systemImage: "flame.fill")
                .dsText(.footnote)
                .foregroundStyle(ds.brand)
                .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, 5)
                .background(ds.surface.opacity(0.95), in: Capsule())
            SayPictureStamp(text: word.term, reduceMotion: reduceMotion)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, AlphonsoDS.Space.s4)
        .background(alignment: .top) { SayPictureSparks(reduceMotion: reduceMotion) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// A miss reveals the word on the photo itself, with the model one tap away.
    private func revealOverlay(_ word: SayThePicture.PictureWord) -> some View {
        VStack(spacing: 6) {
            Text("It is").dsText(.overline).foregroundStyle(ds.onHeroKick)
            Text(word.term).dsText(.display).minimumScaleFactor(0.5).lineLimit(2).multilineTextAlignment(.center)
                .shadow(color: .black.opacity(0.7), radius: 9, y: 3)
            Button { Task { await playModel(word.term) } } label: { Label("Hear it", systemImage: "speaker.wave.2.fill") }
                .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, AlphonsoDS.Space.s4).padding(.horizontal, AlphonsoDS.Space.s4)
        .accessibilityElement(children: .contain)
    }

    /// Alphonso, fully in frame, reacting in pose, with a small speech bubble.
    private var tutor: some View {
        HStack(alignment: .bottom, spacing: 4) {
            Image(pose.rawValue).resizable().scaledToFit().frame(height: 210)
                .shadow(color: .black.opacity(0.4), radius: 12, y: 8)
                .id(pose)
                .transition(reduceMotion ? AnyTransition.identity : AnyTransition.opacity.combined(with: .offset(y: 12)))
                .accessibilityHidden(true)
            Text(bubbleText)
                .dsText(.footnote)
                .foregroundStyle(ds.ink)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .frame(maxWidth: 190, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(ds.line, lineWidth: 1.5))
                .padding(.bottom, 130)
                .accessibilityHidden(true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: pose)
    }

    private var bubbleText: String {
        switch run.phase {
        case .right: return run.combo >= 2 ? "\(run.combo) in a row!" : "First try. Brilliant!"
        case .reveal: return voice.isRecording ? "Mm-hm, I'm listening..." : "Now say it with me."
        default: return voice.isRecording ? "Mm-hm, I'm listening..." : "Have a look. What's this one?"
        }
    }

    // MARK: Stage

    @ViewBuilder private func stage(_ word: SayThePicture.PictureWord) -> some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            switch run.phase {
            case .ask: ask
            case .right: right
            case .reveal: reveal
            case .done: EmptyView()
            }
        }
        .foregroundStyle(ds.ink)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 18).padding(.top, AlphonsoDS.Space.s4).padding(.bottom, AlphonsoDS.Space.s4)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30)
                .fill(.ultraThinMaterial)
                .overlay(UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30).fill(ds.surface.opacity(0.9)))
                .overlay(alignment: .top) { UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30).stroke(Color.white.opacity(0.7), lineWidth: 1.5) }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private var ask: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if canCapture {
                if voice.isBusy {
                    ProgressView("Checking what you said...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    micRing(size: 98)
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

    private var right: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            Button(run.nextLabel) { run.next() }.buttonStyle(.dsButton(.primary))
        }
        .frame(maxWidth: .infinity)
    }

    private var reveal: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            Text(revealHint).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            if let message = visibleError { Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center) }
            if run.heard == nil && canCapture {
                if voice.isBusy {
                    ProgressView("Checking what you said...").tint(ds.choice).dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    micRing(size: 76)
                }
            }
            Button(run.nextWordLabel) { errorMessage = nil; run.next() }
                .buttonStyle(.dsButton(run.heard == nil ? .secondary : .primary))
                .disabled(voice.isRecording || voice.isBusy)
        }
        .frame(maxWidth: .infinity)
    }

    private func micRing(size: CGFloat) -> some View {
        // Hold to talk, release to send: the same control as the conversation screens and the speak question, inside
        // a ring that fills while it is held.
        SayPictureMicRing(
            isRecording: voice.isRecording,
            size: size,
            reduceMotion: reduceMotion,
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

    /// "Add them to your review deck": each missed single word goes through the existing save-word route
    /// (`/api/define-word`), the same one the tap-to-save sheet uses. A phrase is left out, as the route would refuse it.
    private func saveMissed() async {
        let savable = run.missedWords.filter { SayThePicture.isSavable($0.term) }
        let skipped = run.missedWords.count - savable.count
        saveState = .saving
        guard let accessToken = await session.freshAccessToken() else {
            saveState = .failed(SavedWordError.notSignedIn.userMessage)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        var saved = 0
        for word in savable {
            do {
                _ = try await client.defineWord(word: word.term, sentence: word.saveSentence, course: course.wireCode)
                saved += 1
            } catch let error as SavedWordError {
                saveState = .failed(error.userMessage)
                return
            } catch is URLError {
                saveState = .failed(SavedWordError.offline.userMessage)
                return
            } catch {
                saveState = .failed(SavedWordError.unavailable.userMessage)
                return
            }
        }
        saveState = .saved(saved, skipped: skipped)
    }
}

// MARK: - Round building blocks

/// The photo as the hero: full-bleed, with a slow Ken Burns drift (still under Reduce Motion). While asking, the photo's
/// own description would give the answer away, so VoiceOver gets nothing until the word is revealed.
private struct SayPictureHero: View {
    let image: VocabImageRef
    let revealed: Bool
    let reduceMotion: Bool
    @State private var failedURL: String?
    @State private var drift = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Color.clear
            .overlay {
                if VocabImagePolicy.slot(url: image.url, failedURL: failedURL) == .visible {
                    AsyncImage(url: URL(string: image.url)) { phase in
                        switch phase {
                        case .success(let loaded):
                            loaded.resizable().aspectRatio(contentMode: .fill)
                                .scaleEffect(drift ? 1.16 : 1.06)
                                .offset(x: drift ? -8 : 0, y: drift ? -6 : 0)
                        case .empty:
                            ZStack { ds.brand; ProgressView().tint(.white) }
                        case .failure:
                            Color.clear.onAppear { failedURL = image.url }
                        @unknown default:
                            Color.clear.onAppear { failedURL = image.url }
                        }
                    }
                } else {
                    ds.brand
                }
            }
            .background(ds.brand)
            .clipped()
            .ignoresSafeArea()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(revealed ? image.alt : "A picture of a word to say")
            .accessibilityHidden(!revealed)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 20).repeatForever(autoreverses: true)) { drift = true }
            }
    }
}

/// The winning word, stamped on (it lands from slightly large). Static under Reduce Motion.
private struct SayPictureStamp: View {
    let text: String
    let reduceMotion: Bool
    @State private var landed = false

    var body: some View {
        Text(text)
            .dsText(.display)
            .minimumScaleFactor(0.5).lineLimit(2).multilineTextAlignment(.center)
            .shadow(color: .black.opacity(0.6), radius: 9, y: 3)
            .scaleEffect(landed || reduceMotion ? 1 : 1.3)
            .opacity(landed || reduceMotion ? 1 : 0)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) { landed = true }
            }
    }
}

/// A small sparkle burst behind the win. Drawn once and static under Reduce Motion.
private struct SayPictureSparks: View {
    let reduceMotion: Bool
    @Environment(\.alphonsoDS) private var ds
    @State private var on = false
    private let sparks: [(x: CGFloat, y: CGFloat, size: CGFloat, delay: Double)] = [
        (-110, 18, 20, 0), (95, 6, 16, 0.12), (130, 66, 18, 0.2), (-135, 60, 16, 0.28),
    ]

    var body: some View {
        ZStack {
            ForEach(Array(sparks.enumerated()), id: \.offset) { _, s in
                Image(systemName: "star.fill")
                    .font(.system(size: s.size)).foregroundStyle(ds.onHeroKick)
                    .shadow(color: ds.actionEdge.opacity(0.5), radius: 3, y: 2)
                    .offset(x: s.x, y: s.y)
                    .scaleEffect(on || reduceMotion ? 1 : 0.2)
                    .opacity(on || reduceMotion ? 0.95 : 0)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.7).delay(s.delay), value: on)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: 96)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { on = true }
    }
}

/// The gold mic inside a ring that fills while it is held (red while recording). Hold to talk, release to send. The
/// ring is a button for assistive tech: it says how to use it and whether it is recording.
private struct SayPictureMicRing: View {
    let isRecording: Bool
    let size: CGFloat
    let reduceMotion: Bool
    let onPress: () -> Void
    let onRelease: () -> Void
    @State private var fill: CGFloat = 0
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack {
            Circle().stroke(ds.ink.opacity(0.1), lineWidth: 4)
            Circle().trim(from: 0, to: fill)
                .stroke(isRecording ? ds.wrong : ds.action, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle()
                .fill(isRecording ? AnyShapeStyle(ds.wrong) : AnyShapeStyle(LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .top, endPoint: .bottom)))
                .padding(11)
                .shadow(color: isRecording ? ds.wrongEdge : ds.actionEdge, radius: 0, y: 4)
                .overlay(
                    Image(systemName: "mic.fill").font(.system(size: size * 0.32))
                        .foregroundStyle(isRecording ? ds.onWrong : ds.onAction)
                )
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Hold to say the word")
        .accessibilityValue(isRecording ? "Recording" : "Ready")
        .accessibilityHint("Press and hold, say the word, then let go to send it.")
        .accessibilityAddTraits(.isButton)
        .accessibilityDirectTouch(true, options: .requiresActivation)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded { _ in onRelease() }
        )
        .accessibilityAction {
            // VoiceOver: a double-tap toggles, so recording never needs hold-and-drag.
            if isRecording { onRelease() } else { onPress() }
        }
        .task(id: isRecording) {
            // The ring is full: stop and send.
            guard isRecording else { return }
            try? await Task.sleep(for: .seconds(SayThePicture.maxRecordSeconds))
            if !Task.isCancelled && isRecording { onRelease() }
        }
        .onChange(of: isRecording) { _, recording in
            if reduceMotion {
                fill = recording ? 1 : 0
            } else if recording {
                fill = 0
                withAnimation(.linear(duration: SayThePicture.maxRecordSeconds)) { fill = 1 }
            } else {
                withAnimation(.easeOut(duration: 0.2)) { fill = 0 }
            }
        }
    }
}
