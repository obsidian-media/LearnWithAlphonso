import AVFoundation
import SwiftUI
import LearnWithAlphonsoKit

/// Graded stories (docs/superpowers/specs/2026-11-17-graded-stories-design.md): the reading analog of the Listen library.
/// Mirrors the web's StoriesLibrary, StoryReader and StoryCheck. The rules are `Stories`, `StoryNarration` and
/// `PodcastClient.fetchStories/fetchStory/saveStoryProgress/submitStoryCheck` in the Kit (XCTest coverage in
/// StoriesTests); this file only draws them. Compiles in CI's ios-app-build; look at it on a device.

// MARK: - Narration (the app side of StoryNarration)

/// Reads a story one sentence at a time, handing the highlight from sentence to sentence as each one ends. A sentence
/// with a pre-recorded file (StoryRecordings, made by scripts/story-audio.ts) just plays it: no /api/tts call, no AI
/// quota, no AI consent. Only a sentence with no recording (or whose file will not download or play) falls back to the
/// live /api/tts voice (the learner's chosen Alphonso voice), which keeps today's consent and quota. The next sentence is
/// fetched while the current one plays. Sentence-level highlight is v1, like the web.
@MainActor
final class StoryNarrator: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var state: StoryNarration

    private let segments: [String]
    private let course: Course
    private let session: Session
    /// The story whose recordings to look up (a branching story passes its own id for every node); nil looks nothing up.
    private let storyID: String?
    private var recordings: StoryRecordings?
    private var recordingsLoaded = false
    /// Set by `prepare`: whether a sentence with no recording may use the live voice (AI speech is on).
    private var liveSpeechAllowed = false
    /// The sentences whose cached audio is the recording (not live speech), for the play-failure fallback.
    private var recordedIndices: Set<Int> = []
    private var player: AVAudioPlayer?
    private var finishContinuation: CheckedContinuation<Bool, Never>?
    private var runID = 0
    private var cache: [Int: Task<Data, Error>] = [:]

    init(segments: [String], course: Course, session: Session, storyID: String? = nil) {
        self.segments = segments
        self.course = course
        self.session = session
        self.storyID = storyID
        self.state = StoryNarration(count: segments.count)
    }

    /// Looks up the story's recordings (once) and says whether narration may start: every sentence recorded needs no AI
    /// consent; otherwise the live fallback needs it, exactly as before.
    func prepare(aiConsentGranted: Bool) async -> Bool {
        if !recordingsLoaded, let storyID {
            recordings = await StoryRecordings.load(
                supabaseURL: AppConfig.supabaseURL, storyID: storyID,
                requester: { request in try await URLSession.shared.data(for: request) })
            // A failed load (offline, no manifest yet) is not kept, so a later tap looks again.
            recordingsLoaded = recordings != nil
        }
        liveSpeechAllowed = aiConsentGranted
        return StoryRecordings.canNarrate(segments: segments, recordings: recordings, aiConsentGranted: aiConsentGranted)
    }

    /// Plays from `index` to the end of the story. `onSegment` is told each sentence as it starts (the saved position).
    func play(from index: Int, onSegment: @escaping (Int) -> Void) async {
        stop()
        runID += 1
        let run = runID
        state.start(at: index)
        while let current = state.current {
            if run != runID { return }
            onSegment(current)
            let ahead = Stories.nextSegment(after: current, count: segments.count)
            do {
                let audio = try await audioData(for: current)
                if run != runID { return }
                if let ahead { Task { _ = try? await self.audioData(for: ahead) } }
                var played = await playAndWait(audio)
                if !played, run == runID, StoryRecordings.speakLiveAfterPlayFailure(
                    wasRecorded: recordedIndices.contains(current), aiConsentGranted: liveSpeechAllowed) {
                    // A recording that will not play (an unreadable file) falls back to live speech for this sentence.
                    cache[current] = nil
                    let live = try await audioData(for: current, live: true)
                    if run != runID { return }
                    played = await playAndWait(live)
                }
                guard played, run == runID else {
                    if run == runID { state.fail() }
                    return
                }
            } catch {
                if run == runID { state.fail() }
                return
            }
            if run != runID { return }
            state.finishedCurrent()
        }
    }

    func stop() {
        runID += 1
        player?.stop()
        player = nil
        finishContinuation?.resume(returning: false)
        finishContinuation = nil
        state.stop()
    }

    /// Narration cannot start without AI speech turned on; the text stays readable.
    func markUnavailable() { state.fail() }

    /// `live` skips the recording (its file would not play) and asks the live voice.
    private func audioData(for index: Int, live: Bool = false) async throws -> Data {
        if !live, let cached = cache[index] { return try await cached.value }
        let recordedPath = live ? nil : recordings?.path(for: segments[index])
        let liveAllowed = liveSpeechAllowed
        let task = Task { () -> Data in
            // The recording first: a plain public file, nothing to authorise or pay for.
            if let recordedPath,
               let url = StoryRecordings.audioURL(supabaseURL: AppConfig.supabaseURL, path: recordedPath),
               let (data, response) = try? await URLSession.shared.data(from: url),
               (response as? HTTPURLResponse)?.statusCode == 200, !data.isEmpty {
                self.recordedIndices.insert(index)
                return data
            }
            self.recordedIndices.remove(index)
            guard liveAllowed else { throw StoryNarrationError.unauthorized }
            guard let token = await self.session.freshAccessToken() else { throw StoryNarrationError.unauthorized }
            let client = AIConversationClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { token },
                refreshAccessToken: { await self.session.freshAccessToken(forceRefresh: true) })
            let voiceID = VoicePrefsCache().voice(.alphonso, course: self.course.wireCode)
            return try await client.synthesizeSpeech(
                text: self.segments[index], voice: voiceID, course: self.course.wireCode)
        }
        cache[index] = task
        do {
            return try await task.value
        } catch {
            // A failed fetch is not kept, so a later play tries again.
            cache[index] = nil
            throw error
        }
    }

    private func playAndWait(_ audio: Data) async -> Bool {
        VoiceAudioHooks.pauseOtherAudio?()
        try? VoiceSessionController.configureForVoice()
        guard let next = try? AVAudioPlayer(data: audio) else { return false }
        next.delegate = self
        player = next
        guard next.play() else { return false }
        return await withCheckedContinuation { continuation in
            finishContinuation = continuation
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.finishContinuation?.resume(returning: flag)
            self.finishContinuation = nil
        }
    }

    /// A file that starts but cannot be decoded ends the sentence as a failure (so a recording can fall back to live).
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.finishContinuation?.resume(returning: false)
            self.finishContinuation = nil
        }
    }

    private enum StoryNarrationError: Error { case unauthorized }
}

// MARK: - Library

/// How the Library draws its stories: `peek` is the All tab's one row (the first few small cover cards, with "See all"),
/// `full` is the Stories tab (the featured story, the continue line and the cover grid).
enum StoriesPresentation {
    case peek, full
}

/// Published stories for the course on screen, in the Library's All (peek) and Stories (full) tabs. A failed load is never
/// shown as an empty library. It owns its read, so a story added to the database appears without a release.
struct StoriesSection: View {
    let session: Session
    let player: PodcastAudioPlayer
    let course: String
    let presentation: StoriesPresentation
    var onSeeAll: (() -> Void)?

    @Environment(\.alphonsoDS) private var ds
    @State private var stories: [StorySummary] = []
    @State private var isLoading = true
    @State private var failed = false

    var body: some View {
        let visible = Stories.visible(stories, course: course)
        // The loader hangs off `loadAnchor`, a real zero-size child that is always in the tree: a `.task` on content that
        // can draw nothing would never fire (the same trap as the Watch shelf).
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            if isLoading {
                if presentation == .full {
                    ProgressView("Loading stories…").tint(ds.choice).frame(maxWidth: .infinity)
                }
            } else if failed {
                DSEmptyState(
                    art: "Alphonso-thinking", title: "Couldn't load stories", message: Copy.connectionFailure,
                    actionTitle: "Try again") { Task { await load() } }
            } else if presentation == .peek {
                peek(Array(visible.prefix(LibraryTab.storiesPeekCount)))
            } else if visible.isEmpty {
                DSEmptyState(art: "Alphonso-reading-book", title: StoryCopy.emptyTitle, message: StoryCopy.emptyMessage)
            } else {
                library(Stories.library(stories, course: course))
            }
            loadAnchor
        }
    }

    /// Always present, draws nothing, takes no room.
    private var loadAnchor: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task(id: course) { await load() }
    }

    @ViewBuilder
    private func library(_ layout: StoriesLibraryLayout) -> some View {
        if let featured = layout.featured {
            NavigationLink { reader(featured) } label: { StoryHeroCard(story: featured) }
                .buttonStyle(.plain)
        }
        if let resume = layout.resume {
            NavigationLink { reader(resume) } label: { StoryContinueLine(story: resume) }
                .buttonStyle(.plain)
        }
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: AlphonsoDS.Space.s3), GridItem(.flexible(), spacing: AlphonsoDS.Space.s3)],
            alignment: .leading, spacing: AlphonsoDS.Space.s3
        ) {
            ForEach(layout.grid) { story in
                NavigationLink { reader(story) } label: { StoryCoverCard(story: story, small: false) }
                    .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func peek(_ shown: [StorySummary]) -> some View {
        if !shown.isEmpty {
            HStack {
                Text("Stories").dsText(.title).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: AlphonsoDS.Space.s2)
                if let onSeeAll {
                    Button("See all") { onSeeAll() }
                        .dsText(.footnote).foregroundStyle(ds.choice)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                        .accessibilityLabel(LibraryTab.stories.seeAllLabel)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                    ForEach(shown) { story in
                        NavigationLink { reader(story) } label: { StoryCoverCard(story: story, small: true) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func reader(_ story: StorySummary) -> some View {
        if story.branching {
            BranchingStoryReaderScreen(story: story, session: session, player: player)
        } else {
            StoryReaderScreen(story: story, session: session, player: player)
        }
    }

    private func load() async {
        guard let client = makePodcastClient(session: session) else { isLoading = false; failed = true; return }
        failed = false
        do {
            stories = try await client.fetchStories(course: course)
        } catch {
            if !Task.isCancelled { failed = true }
        }
        isLoading = false
    }
}

// MARK: - Library cover cards

/// A story's cover: the first scene's art, or a designed fallback (brand-to-scene gradient and a 3D icon) when there is no
/// art or it has not loaded (or fails), so a card is never a broken image. Decorative: the card carries the name.
private struct StoryCover: View {
    let story: StorySummary
    let iconSize: CGFloat
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack {
            LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)
            Icon3DView(emoji: story.branching ? "\u{1F9ED}" : "\u{1F4DA}", size: iconSize)
            if let url = story.coverURL {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase { image.resizable().scaledToFill() }
                }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

/// The endings-found ring on a branching cover. Decorative: the same fact is in the card's name and caption.
private struct EndingsRing: View {
    let story: StorySummary
    let size: CGFloat
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.45))
            Circle().stroke(Color.white.opacity(0.35), lineWidth: 4)
            Circle().trim(from: 0, to: Stories.endingsFraction(story))
                .stroke(ds.xp, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// One cover card: a single element with its full name; `small` is the Library peek's size.
private struct StoryCoverCard: View {
    let story: StorySummary
    let small: Bool
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StoryCover(story: story, iconSize: small ? AlphonsoDS.Space.s8 : AlphonsoDS.Space.s12)
                .frame(maxWidth: .infinity)
                .aspectRatio(4.0 / 3.0, contentMode: .fit)
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, ds.hero.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                        .frame(height: small ? 48 : 72)
                        .allowsHitTesting(false)
                }
                .overlay(alignment: .topLeading) {
                    if story.branching {
                        Label("Path", systemImage: "arrow.triangle.branch").dsText(.caption).foregroundStyle(Color.white)
                            .padding(.horizontal, AlphonsoDS.Space.s2)
                            .background(Capsule().fill(ds.choice))
                            .padding(AlphonsoDS.Space.s2)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if story.branching && story.endingsTotal > 0 {
                        EndingsRing(story: story, size: small ? 30 : 36).padding(AlphonsoDS.Space.s2)
                    }
                }
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                Text(story.level).dsText(.caption).foregroundStyle(ds.choice)
                    .padding(.horizontal, AlphonsoDS.Space.s2)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.choiceTint))
                Text(story.title).dsText(.headline).foregroundStyle(ds.ink)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                Text(Stories.caption(story)).dsText(.caption).foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: small ? 168 : nil)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(ds.card))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Stories.cardLabel(story))
    }
}

/// The featured story: the newest branching story as a full-width card with a scrim, the "Choose your path" badge, its
/// title, "A2 · N endings · M found" and a Read now / Continue button.
private struct StoryHeroCard: View {
    let story: StorySummary
    @Environment(\.alphonsoDS) private var ds

    private var action: String { story.endingsFound > 0 ? "Continue" : "Read now" }

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Spacer(minLength: AlphonsoDS.Space.s12 * 2)
            Label(BranchingCopy.badge.uppercased(), systemImage: "arrow.triangle.branch").dsText(.overline).foregroundStyle(Color.white)
                .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s1)
                .background(Capsule().fill(ds.choice))
            Text(story.title).dsText(.title).foregroundStyle(ds.onHero)
                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            Text(Stories.heroLine(story)).dsText(.footnote).foregroundStyle(ds.onHero.opacity(0.8))
            HStack(spacing: AlphonsoDS.Space.s2) {
                Text(action).dsText(.headline).foregroundStyle(ds.onAction)
                Image(systemName: "play.fill").font(.caption).foregroundStyle(ds.onAction)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(ds.onAction.opacity(0.15)))
            }
            .padding(.leading, AlphonsoDS.Space.s4).padding(.trailing, 6)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(Capsule().fill(ds.action))
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                StoryCover(story: story, iconSize: AlphonsoDS.Space.s12 * 2)
                LinearGradient(
                    stops: [.init(color: ds.hero.opacity(0.92), location: 0), .init(color: ds.hero.opacity(0.55), location: 0.4),
                            .init(color: .clear, location: 0.75), .init(color: .clear, location: 1)],
                    startPoint: .bottom, endPoint: .top)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Stories.cardLabel(story)), \(action)")
    }
}

/// The slim resume card under the hero: thumbnail, title, "Continue · Scene X" and Resume.
private struct StoryContinueLine: View {
    let story: StorySummary
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            StoryCover(story: story, iconSize: AlphonsoDS.Space.s6)
                .frame(width: 52, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(story.title).dsText(.headline).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Stories.resumeLine(story)).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            Spacer(minLength: 0)
            Text("Resume").dsText(.footnote).foregroundStyle(Color.white)
                .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s2)
                .background(Capsule().fill(ds.choice))
        }
        .padding(AlphonsoDS.Space.s2)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(story.title), \(Stories.resumeLine(story)), Resume")
    }
}

// MARK: - Reader

/// Loads one story (the library row only has its summary), then shows the reader. The loader is on the container that
/// always draws, never on content that can be empty.
struct StoryReaderScreen: View {
    let story: StorySummary
    let session: Session
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @State private var loaded: Story?
    @State private var phase: Phase = .loading

    private enum Phase { case loading, ready, missing, failed }

    var body: some View {
        ZStack {
            ds.surface.ignoresSafeArea()
            switch phase {
            case .loading:
                ProgressView("Loading…").tint(ds.choice)
            case .missing:
                DSEmptyState(art: "Alphonso-reading-book", title: "Story not found", message: "It may not be available yet.")
                    .padding(AlphonsoDS.Space.s4)
            case .failed:
                DSEmptyState(
                    art: "Alphonso-thinking", title: "We couldn't load this story", message: Copy.connectionFailure,
                    actionTitle: "Try again") { Task { await load() } }
                    .padding(AlphonsoDS.Space.s4)
            case .ready:
                if let loaded { StoryReaderView(story: loaded, session: session, player: player) }
            }
        }
        .navigationTitle(story.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let client = makePodcastClient(session: session) else { phase = .failed; return }
        phase = .loading
        do {
            if let found = try await client.fetchStory(id: story.id) {
                loaded = found
                phase = .ready
            } else {
                phase = .missing
            }
        } catch {
            if !Task.isCancelled { phase = .failed }
        }
    }
}

/// The read-along: the text in sentences, the narration voice reading them with the current one highlighted, every word
/// tappable (it is spoken, and opens the same define-and-save sheet as the podcast transcript), and the short check.
struct StoryReaderView: View {
    let story: Story
    let session: Session
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var aiConsent: AIConsentStore
    @StateObject private var narrator: StoryNarrator
    @State private var savingWord: SaveWordRequest?
    @State private var showCheck = false
    @State private var checked: PodcastQuizResult?
    @State private var progressStopped = false

    init(story: Story, session: Session, player: PodcastAudioPlayer) {
        self.story = story
        self.session = session
        self.player = player
        _narrator = StateObject(wrappedValue: StoryNarrator(
            segments: story.segments, course: Course(wireCode: story.course) ?? .english, session: session,
            storyID: story.id))
    }

    private var courseValue: Course { Course(wireCode: story.course) ?? .english }
    private var resumeAt: Int { story.segmentIndex < story.segments.count ? story.segmentIndex : 0 }

    var body: some View {
        let current = narrator.state.current
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                    textCard(current: current)
                    if !story.questions.isEmpty { checkCard }
                }
                .padding(AlphonsoDS.Space.s4)
            }
            .onChange(of: current) { _, now in
                guard let now else { return }
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { proxy.scrollTo(now, anchor: .center) }
            }
        }
        .background(ds.surface)
        .miniPlayerClearance(player)
        .onDisappear { narrator.stop() }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
        .sheet(isPresented: $showCheck) {
            PodcastQuizSheet(
                title: story.title,
                episodeID: story.id,
                offer: PodcastQuizOffer(questions: story.questions, best: nil),
                session: session,
                onSaved: { checked = $0 },
                send: { [storyID = story.id] client, answers, _ in
                    // The server grades from the stored key: only the chosen answers are sent.
                    try await client.submitStoryCheck(storyID: storyID, answers: answers)
                },
                resultNote: { _ in StoryCopy.countsLine })
        }
    }

    private func textCard(current: Int?) -> some View {
        DSCard {
            HStack {
                Text(Stories.levelLabel(story.level)).dsText(.caption).foregroundStyle(ds.inkSoft)
                Spacer(minLength: 0)
                Text("Tap a word to hear it and save it.").dsText(.caption).foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                ForEach(Array(story.segments.enumerated()), id: \.offset) { index, segment in
                    let active = current == index
                    TappableText(text: segment, color: ds.ink, course: story.course, mode: .allWords) { request in
                        // A tapped word is spoken as well as defined; the narration stops so the two never overlap.
                        narrator.stop()
                        FirstRunVoice.speak(request.word, course: courseValue)
                        savingWord = request
                    }
                    .dsText(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.vertical, AlphonsoDS.Space.s2)
                    .background(
                        RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                            .fill(active ? ds.choiceTint : Color.clear))
                    .overlay(
                        RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                            .stroke(active ? ds.choice : Color.clear, lineWidth: 2))
                    .id(index)
                    .accessibilityValue(active ? "Reading now" : "")
                }
            }
            narrationControls
            if narrator.state.failed {
                Text(aiConsent.isGranted ? StoryCopy.narrationUnavailable : StoryCopy.narrationNeedsAI)
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private var narrationControls: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            if narrator.state.playing {
                Button("Pause narration") { narrator.stop() }
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
            } else {
                Button(resumeAt > 0 ? "Continue listening" : "Listen") { start(from: resumeAt) }
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
                if resumeAt > 0 {
                    Button("From the start") { start(from: 0) }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                }
            }
        }
    }

    private var checkCard: some View {
        DSCard {
            DSOverline(StoryCopy.checkTitle)
            if let checked {
                Text("\(checked.correct) of \(checked.total) correct").dsText(.display).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(StoryCopy.countsLine).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            Button(checked == nil ? "Start the check" : "Take the check again") { showCheck = true }
                .buttonStyle(.dsButton(checked == nil ? .primary : .secondary, compact: true, fullWidth: false))
        }
    }

    private func start(from index: Int) {
        let storyID = story.id
        Task {
            // A fully recorded story needs no AI consent; otherwise the live fallback does (StoryRecordings.canNarrate).
            guard await narrator.prepare(aiConsentGranted: aiConsent.isGranted) else { narrator.markUnavailable(); return }
            await narrator.play(from: index) { segment in saveProgress(storyID: storyID, segment: segment) }
        }
    }

    /// Garnish, like the podcast position: a failed save never interrupts reading. A rejected token stops further saves.
    private func saveProgress(storyID: String, segment: Int) {
        guard !progressStopped, let client = makePodcastClient(session: session) else { return }
        Task {
            do {
                try await client.saveStoryProgress(storyID: storyID, segmentIndex: segment)
            } catch PodcastClientError.unauthorized {
                progressStopped = true
            } catch {}
        }
    }
}
