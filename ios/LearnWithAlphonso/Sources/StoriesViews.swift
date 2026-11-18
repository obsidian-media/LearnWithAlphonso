import AVFoundation
import SwiftUI
import LearnWithAlphonsoKit

/// Graded stories (docs/superpowers/specs/2026-11-17-graded-stories-design.md): the reading analog of the Listen library.
/// Mirrors the web's StoriesLibrary, StoryReader and StoryCheck. The rules are `Stories`, `StoryNarration` and
/// `PodcastClient.fetchStories/fetchStory/saveStoryProgress/submitStoryCheck` in the Kit (XCTest coverage in
/// StoriesTests); this file only draws them. Compiles in CI's ios-app-build; look at it on a device.

// MARK: - Narration (the app side of StoryNarration)

/// Reads a story one sentence at a time through the existing /api/tts voice (the learner's chosen Alphonso voice), handing
/// the highlight from sentence to sentence as each one ends. The next sentence is fetched while the current one plays.
/// Sentence-level highlight is v1, like the web.
@MainActor
final class StoryNarrator: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var state: StoryNarration

    private let segments: [String]
    private let course: Course
    private let session: Session
    private var player: AVAudioPlayer?
    private var finishContinuation: CheckedContinuation<Bool, Never>?
    private var runID = 0
    private var cache: [Int: Task<Data, Error>] = [:]

    init(segments: [String], course: Course, session: Session) {
        self.segments = segments
        self.course = course
        self.session = session
        self.state = StoryNarration(count: segments.count)
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
                guard await playAndWait(audio), run == runID else {
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

    private func audioData(for index: Int) async throws -> Data {
        if let cached = cache[index] { return try await cached.value }
        let task = Task { () -> Data in
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

    private enum StoryNarrationError: Error { case unauthorized }
}

// MARK: - Library

/// The Stories row under the Listen shelf's Watch shelf: opens the library for the course on screen.
struct StoriesEntryRow: View {
    let session: Session
    let player: PodcastAudioPlayer
    let course: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        NavigationLink {
            StoriesLibraryView(session: session, player: player, course: course)
        } label: {
            HStack(spacing: AlphonsoDS.Space.s3) {
                Icon3DView(emoji: "\u{1F4DA}", size: AlphonsoDS.Space.s12)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Stories").dsText(.headline).foregroundStyle(ds.ink)
                    Text("Read along while you listen").dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .accessibilityHidden(true)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Stories, read along while you listen")
        .accessibilityIdentifier("storiesEntryRow")
    }
}

/// Published stories grouped by level, like the Listen library. A failed load is never shown as an empty library.
struct StoriesLibraryView: View {
    let session: Session
    let player: PodcastAudioPlayer
    let course: String

    @Environment(\.alphonsoDS) private var ds
    @State private var stories: [StorySummary] = []
    @State private var isLoading = true
    @State private var failed = false

    var body: some View {
        let groups = Stories.groupByLevel(Stories.visible(stories, course: course))
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                if isLoading {
                    ProgressView("Loading stories…").tint(ds.choice).frame(maxWidth: .infinity)
                } else if failed {
                    DSEmptyState(
                        art: "Alphonso-thinking", title: "Couldn't load stories", message: Copy.connectionFailure,
                        actionTitle: "Try again") { Task { await load() } }
                } else if groups.isEmpty {
                    DSEmptyState(art: "Alphonso-reading-book", title: StoryCopy.emptyTitle, message: StoryCopy.emptyMessage)
                } else {
                    ForEach(groups, id: \.level) { group in
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                            DSOverline(Stories.levelLabel(group.level))
                            ForEach(group.stories) { story in
                                NavigationLink {
                                    StoryReaderScreen(story: story, session: session, player: player)
                                } label: {
                                    row(story)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(AlphonsoDS.Space.s4)
        }
        .background(ds.surface)
        .miniPlayerClearance(player)
        .navigationTitle("Stories")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func row(_ story: StorySummary) -> some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Icon3DView(emoji: "\u{1F4DA}", size: AlphonsoDS.Space.s12)
            VStack(alignment: .leading, spacing: 2) {
                Text(story.title).dsText(.headline).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Stories.status(story)).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").dsText(.footnote).foregroundStyle(ds.inkSoft).accessibilityHidden(true)
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(story.title), \(Stories.status(story))")
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
            segments: story.segments, course: Course(wireCode: story.course) ?? .english, session: session))
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
        guard aiConsent.isGranted else { narrator.markUnavailable(); return }
        let storyID = story.id
        Task {
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
