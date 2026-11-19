import SwiftUI
import LearnWithAlphonsoKit

/// Interactive branching stories (docs/superpowers/specs/2026-11-18-interactive-branching-stories-design.md): the
/// "choose your path" reader on iOS. Port of the web BranchingStoryReader and the Android BranchingStoryReader; the rules
/// are `Branching`, `BranchingCopy` and `PodcastClient.fetchBranchingStory/finishBranchingStory` in the Kit (XCTest in
/// BranchingTests), this file only draws them. Each node is a read-along page (the same narrator, highlight and
/// tap-to-define as the graded reader); a choice point shows the real Alphonso with soft options; an ending shows the
/// wrap, the endings found, stars and try-another-path. The finished path goes to the finish-branching-story Edge Function
/// (never the service-role RPC); the ending and stars shown are the server's. Compiles in CI's ios-app-build; look at it
/// on a device.

// MARK: - Loader

/// Loads one branching story (the library row only has its summary), then shows the reader. The loader is on the
/// container that always draws, never on content that can be empty.
struct BranchingStoryReaderScreen: View {
    let story: StorySummary
    let session: Session
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @State private var loaded: BranchingStory?
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
                if let loaded { BranchingStoryReaderView(story: loaded, session: session, player: player) }
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
            if let found = try await client.fetchBranchingStory(id: story.id) {
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

// MARK: - Reader (drives the node graph)

/// Holds the only mutable state: the option index chosen at each choice point, in order (the one thing sent to the
/// server), and the current node. `Branching.walk` is the same algorithm the server re-walks, so the screen and the
/// credited result cannot differ.
struct BranchingStoryReaderView: View {
    let story: BranchingStory
    let session: Session
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @State private var path: [Int] = []
    @State private var nodeID: String
    @State private var round = 0

    init(story: BranchingStory, session: Session, player: PodcastAudioPlayer) {
        self.story = story
        self.session = session
        self.player = player
        _nodeID = State(initialValue: story.graph.start)
    }

    private var node: StoryNode? { story.graph.map[nodeID] }
    private var kind: NodeKind { Branching.nodeKind(node) }

    private func restart() {
        path = []
        nodeID = story.graph.start
        round += 1
    }

    var body: some View {
        Group {
            if let node, kind != .invalid {
                if kind == .ending, let ending = node.ending {
                    BranchingEndingView(story: story, path: path, ending: ending, session: session, onRestart: restart)
                } else {
                    BranchingNodePage(
                        story: story, node: node, session: session,
                        onChoose: { index in
                            if let target = Branching.chooseOption(story.graph, nodeID: nodeID, index: index) {
                                path.append(index)
                                nodeID = target
                            }
                        },
                        onContinue: { if let next = node.next { nodeID = next } })
                        // A fresh node (or a restart) is a fresh read-along page with its own narrator.
                        .id("\(nodeID)-\(round)")
                }
            } else {
                BranchingNotReady(onStartOver: restart)
            }
        }
        .background(ds.surface)
        .miniPlayerClearance(player)
    }
}

// MARK: - A content error

private struct BranchingNotReady: View {
    let onStartOver: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            Text(BranchingCopy.notReady).dsText(.body).foregroundStyle(ds.ink)
            Button(BranchingCopy.startOver) { onStartOver() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - One node

/// One node: its scene art (or a quiet placeholder), the read-along text (the graded reader's narrator, highlight and
/// tap-to-define), then Continue or the choice.
private struct BranchingNodePage: View {
    let story: BranchingStory
    let node: StoryNode
    let session: Session
    let onChoose: (Int) -> Void
    let onContinue: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @EnvironmentObject private var aiConsent: AIConsentStore
    @StateObject private var narrator: StoryNarrator
    @State private var savingWord: SaveWordRequest?

    init(
        story: BranchingStory, node: StoryNode, session: Session,
        onChoose: @escaping (Int) -> Void, onContinue: @escaping () -> Void
    ) {
        self.story = story
        self.node = node
        self.session = session
        self.onChoose = onChoose
        self.onContinue = onContinue
        _narrator = StateObject(wrappedValue: StoryNarrator(
            segments: node.segments, course: Course(wireCode: story.course) ?? .english, session: session))
    }

    private var courseValue: Course { Course(wireCode: story.course) ?? .english }

    var body: some View {
        let current = narrator.state.current
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                    SceneArtView(url: node.artURL)
                    textCard(current: current)
                    if let choice = node.choice, node.next == nil {
                        ChoicePointCard(prompt: choice.prompt, labels: choice.options.map(\.label)) { index in
                            narrator.stop()
                            onChoose(index)
                        }
                    } else if node.next != nil {
                        Button(BranchingCopy.continueLabel) { narrator.stop(); onContinue() }
                            .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
                    }
                }
                .padding(AlphonsoDS.Space.s4)
            }
            .onChange(of: current) { _, now in
                guard let now else { return }
                withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(now, anchor: .center) }
            }
        }
        .onDisappear { narrator.stop() }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
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
                ForEach(Array(node.segments.enumerated()), id: \.offset) { index, segment in
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
                Button("Listen") { start() }
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
            }
        }
    }

    private func start() {
        guard aiConsent.isGranted else { narrator.markUnavailable(); return }
        Task { await narrator.play(from: 0) { _ in } }
    }
}

// MARK: - The choice point

/// The real Alphonso asking, with two or three soft options. A wrong-seeming pick only leads somewhere else.
private struct ChoicePointCard: View {
    let prompt: String
    let labels: [String]
    let onPick: (Int) -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard {
            HStack(alignment: .center, spacing: AlphonsoDS.Space.s2) {
                Image("Alphonso-explaining-pointer")
                    .resizable().scaledToFit()
                    .frame(width: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s6, height: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s6)
                    .accessibilityHidden(true)
                Text(prompt).dsText(.headline).foregroundStyle(ds.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(spacing: AlphonsoDS.Space.s2) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Button(label) { onPick(index) }
                        .buttonStyle(.dsButton(.secondary, compact: false, fullWidth: true))
                }
            }
        }
    }
}

// MARK: - Scene art

/// The scene illustration from the public story-art bucket; a quiet placeholder when there is none or it cannot load.
private struct SceneArtView: View {
    let url: URL?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                    } else {
                        shape.fill(ds.choiceTint)
                    }
                }
            } else {
                shape.fill(ds.choiceTint)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: AlphonsoDS.Space.s12 * 4)
        .clipShape(shape)
        .accessibilityHidden(true)
    }
}

// MARK: - The ending

/// The ending: wrap, endings found, stars and try-another-path. Everything in the result card is the server's answer,
/// read against the stored graph; the local walk only guards against sending a path the screen never actually reached.
private struct BranchingEndingView: View {
    let story: BranchingStory
    let path: [Int]
    let ending: StoryEnding
    let session: Session
    let onRestart: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @State private var state: FinishState = .saving
    @State private var attempt = 0

    private enum FinishState { case saving, failed(String), done(BranchingFinish) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                DSOverline(BranchingCopy.yourEnding)
                Text(ending.title).dsText(.display).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(ending.wrap).dsText(.body).foregroundStyle(ds.ink)
                resultCard
                Button(BranchingCopy.tryAnotherPath) { onRestart() }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            }
            .padding(AlphonsoDS.Space.s4)
        }
        // Re-finish on first appearance of a path and on an explicit retry.
        .task(id: "\(path)-\(attempt)") { await finish() }
    }

    @ViewBuilder private var resultCard: some View {
        switch state {
        case .saving:
            ProgressView().tint(ds.choice)
        case .failed(let message):
            DSCard {
                Text(message).dsText(.footnote).foregroundStyle(ds.inkSoft)
                Button(BranchingCopy.retrySave) { attempt += 1 }
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
            }
        case .done(let finish):
            // Stars are computed from the server's endings-found against the stored graph, never a client claim.
            let stars = Branching.stars(
                endingsFound: finish.endingsFound.count, endingsTotal: finish.endingsTotal,
                reachedGood: Branching.reachedGood(story.graph, found: finish.endingsFound))
            DSCard {
                DSOverline(BranchingCopy.endingsFound(finish.endingsFound.count, of: finish.endingsTotal))
                Text(String(repeating: "★", count: stars) + String(repeating: "☆", count: max(0, 3 - stars)))
                    .dsText(.display).foregroundStyle(ds.ink)
                    .accessibilityLabel(BranchingCopy.starsLabel(stars))
                if finish.credited {
                    Text(BranchingCopy.countsLine).dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
            }
        }
    }

    private func finish() async {
        state = .saving
        // The local walk must agree with the screen; the server re-walks the stored graph regardless.
        guard case .ended = Branching.walk(story.graph, path: path) else {
            state = .failed(BranchingCopy.notReady)
            return
        }
        guard let client = makePodcastClient(session: session) else {
            state = .failed(BranchingCopy.saveFailed)
            return
        }
        do {
            let result = try await client.finishBranchingStory(storyID: story.id, path: path)
            state = .done(result)
        } catch let error as PodcastQuizError {
            state = .failed(BranchingCopy.message(for: error))
        } catch {
            if !Task.isCancelled { state = .failed(BranchingCopy.saveFailed) }
        }
    }
}
