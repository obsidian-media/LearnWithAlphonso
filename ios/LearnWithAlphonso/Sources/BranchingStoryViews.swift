import SwiftUI
import LearnWithAlphonsoKit

/// Interactive branching stories (docs/archive/2026-11/2026-11-18-interactive-branching-stories-design.md): the
/// "choose your path" reader on iOS. Port of the web BranchingStoryReader and the Android BranchingStoryReader; the rules
/// are `Branching`, `BranchingCopy` and `PodcastClient.fetchBranchingStory/finishBranchingStory` in the Kit (XCTest in
/// BranchingTests), this file only draws them. Each node is a full-bleed cinematic scene (art under a dark fade) with the
/// read-along text (the same narrator, highlight and tap-to-define as the graded reader) and, at a choice point, frosted
/// option bubbles; an ending shows its art, stars, the branch map of paths found and try-another-path. The finished path
/// goes to the finish-branching-story Edge Function (never the service-role RPC); the ending and stars shown are the
/// server's. Compiles in CI's ios-app-build; look at it on a device.

// MARK: - Loader

/// Loads one branching story (the library row only has its summary), then shows the reader. The loader is on the
/// container that always draws, never on content that can be empty. Once the story is ready the reader draws its own
/// back bar over the art, so the navigation bar is hidden for that phase only.
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
        .navigationBarBackButtonHidden(phase == .ready)
        .toolbar(phase == .ready ? .hidden : .visible, for: .navigationBar)
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
/// server), the current node and the ids of every node visited (for "Scene N" and the progress dots).
/// `Branching.walk` is the same algorithm the server re-walks, so the screen and the credited result cannot differ.
struct BranchingStoryReaderView: View {
    let story: BranchingStory
    let session: Session
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var path: [Int] = []
    @State private var nodeID: String
    @State private var visited: [String]
    @State private var round = 0

    init(story: BranchingStory, session: Session, player: PodcastAudioPlayer) {
        self.story = story
        self.session = session
        self.player = player
        _nodeID = State(initialValue: story.graph.start)
        _visited = State(initialValue: [story.graph.start])
    }

    private var node: StoryNode? { story.graph.map[nodeID] }
    private var kind: NodeKind { Branching.nodeKind(node) }

    private func restart() {
        path = []
        nodeID = story.graph.start
        visited = [story.graph.start]
        round += 1
    }

    private func go(to target: String) {
        nodeID = target
        visited.append(target)
    }

    var body: some View {
        Group {
            if let node, kind != .invalid {
                if kind == .ending, let ending = node.ending {
                    // The closing scene first (its text is part of the story), then the celebration.
                    BranchingEndingFlow(
                        story: story, path: path, node: node, ending: ending, session: session,
                        sceneNumber: visited.count,
                        progress: Branching.sceneProgress(
                            story.graph, visitedCount: visited.count, currentNodeID: nodeID),
                        onRestart: restart)
                        .id("\(nodeID)-\(round)")
                        .transition(.opacity)
                } else {
                    BranchingNodePage(
                        story: story, node: node, session: session,
                        sceneNumber: visited.count,
                        progress: Branching.sceneProgress(
                            story.graph, visitedCount: visited.count, currentNodeID: nodeID),
                        onSeeEnding: nil,
                        onChoose: { index in
                            if let target = Branching.chooseOption(story.graph, nodeID: nodeID, index: index) {
                                path.append(index)
                                go(to: target)
                            }
                        },
                        onContinue: { if let next = node.next { go(to: next) } })
                        // A fresh node (or a restart) is a fresh read-along page with its own narrator.
                        .id("\(nodeID)-\(round)")
                        .transition(.opacity)
                }
            } else {
                BranchingNotReady(onStartOver: restart)
            }
        }
        // Scenes fade into each other; nothing slides, so Reduce Motion needs no separate path beyond a shorter fade.
        .animation(.easeInOut(duration: reduceMotion ? AlphonsoDS.Motion.reducedMax : AlphonsoDS.Motion.swap), value: nodeID)
        .background(ds.surface)
        .miniPlayerClearance(player)
    }
}

// MARK: - A content error

private struct BranchingNotReady: View {
    let onStartOver: () -> Void
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            Button("Back") { dismiss() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            Text(BranchingCopy.notReady).dsText(.body).foregroundStyle(ds.ink)
            Button(BranchingCopy.startOver) { onStartOver() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Shared pieces

/// The scene art filling its container, over the Royal hero gradient. The gradient is always drawn first, so a missing
/// or failed image shows the gradient, never a broken image or a blank area.
private struct BranchingBackdrop: View {
    let url: URL?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        LinearGradient(
            colors: [ds.heroA, ds.heroB],
            startPoint: UnitPoint(x: 0.33, y: 0), endPoint: UnitPoint(x: 0.67, y: 1))
            .overlay {
                if let url {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase {
                            image.resizable().scaledToFill()
                        } else {
                            Color.clear
                        }
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// The 30 pt translucent back button (44 pt hit target) that sits over the art.
private struct BranchingBackButton: View {
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button { dismiss() } label: {
            Image(systemName: "chevron.left")
                .font(.footnote.weight(.bold))
                .foregroundStyle(ds.onHero)
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(ds.onHero.opacity(0.16)))
                .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }
}

/// A quiet pill button for controls that sit on the dark scene (Listen, Pause narration).
private struct BranchingGlassButtonStyle: ButtonStyle {
    @Environment(\.alphonsoDS) private var ds
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .dsText(.footnote)
            .foregroundStyle(ds.onHero)
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(Capsule().fill(ds.onHero.opacity(configuration.isPressed ? 0.28 : 0.16)))
            .overlay(Capsule().stroke(ds.onHero.opacity(0.3), lineWidth: 1))
    }
}

// MARK: - One node

/// One node: full-bleed scene art under a dark fade, a back bar with the title and progress dots, then the scene label,
/// the read-along text and Continue or the choice bubbles. The bottom panel scrolls when the text is large.
private struct BranchingNodePage: View {
    let story: BranchingStory
    let node: StoryNode
    let session: Session
    let sceneNumber: Int
    let progress: SceneProgress
    /// Set only on an ending node: shows "See your ending" in the panel where Continue would be.
    let onSeeEnding: (() -> Void)?
    let onChoose: (Int) -> Void
    let onContinue: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @EnvironmentObject private var aiConsent: AIConsentStore
    @StateObject private var narrator: StoryNarrator
    @State private var savingWord: SaveWordRequest?

    init(
        story: BranchingStory, node: StoryNode, session: Session, sceneNumber: Int, progress: SceneProgress,
        onSeeEnding: (() -> Void)?, onChoose: @escaping (Int) -> Void, onContinue: @escaping () -> Void
    ) {
        self.story = story
        self.node = node
        self.session = session
        self.sceneNumber = sceneNumber
        self.progress = progress
        self.onSeeEnding = onSeeEnding
        self.onChoose = onChoose
        self.onContinue = onContinue
        _narrator = StateObject(wrappedValue: StoryNarrator(
            segments: node.segments, course: Course(wireCode: story.course) ?? .english, session: session,
            storyID: story.id))
    }

    private var courseValue: Course { Course(wireCode: story.course) ?? .english }

    /// The mock's full-screen fade: light at the top so the art reads, near-black behind the text. It is dark by the
    /// time the first paragraph starts (about a third of the way down), so bright art never washes the opening lines.
    private var fade: some View {
        LinearGradient(
            stops: [
                .init(color: ds.heroB.opacity(0.10), location: 0),
                .init(color: ds.heroB.opacity(0.10), location: 0.20),
                .init(color: ds.heroB.opacity(0.30), location: 0.30),
                .init(color: ds.heroB.opacity(0.78), location: 0.44),
                .init(color: ds.heroB.opacity(0.94), location: 0.60),
                .init(color: ds.heroB.opacity(0.97), location: 0.80),
                .init(color: ds.heroB.opacity(0.97), location: 1),
            ],
            startPoint: .top, endPoint: .bottom)
            .accessibilityHidden(true)
    }

    private var topBar: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            BranchingBackButton()
            Text(story.title)
                .dsText(.title)
                .foregroundStyle(ds.onHero)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            // The scene label in the panel already says which scene this is, so the dots are decoration.
            HStack(spacing: 3) {
                ForEach(0..<progress.total, id: \.self) { index in
                    Capsule()
                        .fill(index < progress.current ? ds.xp : ds.onHero.opacity(0.4))
                        .frame(width: 11, height: 4)
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .padding(.trailing, AlphonsoDS.Space.s2)
        .background(
            LinearGradient(
                colors: [ds.heroB.opacity(0.5), Color.clear],
                startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top))
    }

    var body: some View {
        let current = narrator.state.current
        ZStack {
            BranchingBackdrop(url: node.artURL).ignoresSafeArea()
            fade.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                GeometryReader { geometry in
                    ScrollViewReader { proxy in
                        ScrollView {
                            panel(current: current)
                                .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .bottomLeading)
                        }
                        .onChange(of: current) { _, now in
                            guard let now else { return }
                            withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(now, anchor: .center) }
                        }
                    }
                }
            }
        }
        .onDisappear { narrator.stop() }
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
    }

    private func panel(current: Int?) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            Text("Scene \(sceneNumber)")
                .dsText(.overline)
                .foregroundStyle(ds.onHeroKick)
                .shadow(color: ds.heroB.opacity(0.9), radius: 3, y: 1)
                .accessibilityAddTraits(.isHeader)
            passage(current: current)
            narrationControls
            if narrator.state.failed {
                Text(aiConsent.isGranted ? StoryCopy.narrationUnavailable : StoryCopy.narrationNeedsAI)
                    .dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            if let onSeeEnding {
                Button(BranchingCopy.seeYourEnding) { narrator.stop(); onSeeEnding() }
                    .buttonStyle(.dsButton(.primary, compact: false, fullWidth: true))
                    .padding(.top, AlphonsoDS.Space.s2)
            } else if let choice = node.choice, node.next == nil {
                choiceBlock(choice)
            } else if node.next != nil {
                Button(BranchingCopy.continueLabel) { narrator.stop(); onContinue() }
                    .buttonStyle(.dsButton(.primary, compact: false, fullWidth: true))
                    .padding(.top, AlphonsoDS.Space.s2)
            }
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.top, AlphonsoDS.Space.s6)
        .padding(.bottom, AlphonsoDS.Space.s4)
    }

    /// The read-along text in white on the dark fade. The active sentence gets a soft light wash and a gold edge.
    private func passage(current: Int?) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            ForEach(Array(node.segments.enumerated()), id: \.offset) { index, segment in
                let active = current == index
                TappableText(text: segment, color: ds.onHero, course: story.course, mode: .allWords) { request in
                    // A tapped word is spoken as well as defined; the narration stops so the two never overlap.
                    narrator.stop()
                    FirstRunVoice.speak(request.word, course: courseValue)
                    savingWord = request
                }
                .dsText(.body)
                .lineSpacing(3)
                // On the text only, before the active sentence's wash and gold edge, so the highlight stays crisp.
                .shadow(color: ds.heroB.opacity(0.8), radius: 3, y: 1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, AlphonsoDS.Space.s3)
                .padding(.vertical, AlphonsoDS.Space.s2)
                .background(
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                        .fill(active ? ds.onHero.opacity(0.16) : Color.clear))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                        .stroke(active ? ds.onHeroKick : Color.clear, lineWidth: 2))
                .id(index)
                .accessibilityValue(active ? "Reading now" : "")
            }
        }
    }

    private var narrationControls: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            if narrator.state.playing {
                Button("Pause narration") { narrator.stop() }
                    .buttonStyle(BranchingGlassButtonStyle())
            } else {
                Button("Listen") { start() }
                    .buttonStyle(BranchingGlassButtonStyle())
            }
        }
    }

    /// The beat line, then one frosted bubble per option with its full label. No tutor image here.
    private func choiceBlock(_ choice: StoryChoice) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2 + 2) {
            Text(choice.prompt)
                .dsText(.footnote)
                .foregroundStyle(ds.onHero.opacity(0.84))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, AlphonsoDS.Space.s2)
            ForEach(Array(choice.options.enumerated()), id: \.offset) { index, option in
                Button {
                    narrator.stop()
                    onChoose(index)
                } label: {
                    Text(option.label)
                        .dsText(.headline)
                        // The bubble is white in every theme, so its text is the fixed Royal brand navy.
                        .foregroundStyle(AlphonsoDS.royalLight.brand)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                        .padding(.horizontal, AlphonsoDS.Space.s4)
                        .padding(.vertical, 13 - 6)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous).fill(ds.onHero.opacity(0.93)))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(ds.onHero.opacity(0.9), lineWidth: 1.5))
                        .shadow(color: Color.black.opacity(0.4), radius: 11, x: 0, y: 10)
                        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func start() {
        Task {
            // A fully recorded node needs no AI consent; otherwise the live fallback does.
            guard await narrator.prepare(aiConsentGranted: aiConsent.isGranted) else { narrator.markUnavailable(); return }
            await narrator.play(from: 0) { _ in }
        }
    }
}

// MARK: - The ending

private enum BranchingFinishState { case saving, failed(String), done(BranchingFinish) }

/// An ending node: first the closing scene like any other (art, "Scene N", read-along text and narration, with "See your
/// ending" where Continue would be), then the celebration. The path is finished when the node is ENTERED, not on the
/// button, so the reading credit is never lost if the learner leaves early. Everything in the result is the server's
/// answer, read against the stored graph; the local walk only guards against sending a path the screen never reached.
private struct BranchingEndingFlow: View {
    let story: BranchingStory
    let path: [Int]
    let node: StoryNode
    let ending: StoryEnding
    let session: Session
    let sceneNumber: Int
    let progress: SceneProgress
    let onRestart: () -> Void

    @State private var showEnding = false
    @State private var state: BranchingFinishState = .saving
    @State private var attempt = 0

    var body: some View {
        Group {
            if showEnding {
                BranchingEndingView(
                    story: story, path: path, ending: ending, artURL: node.artURL, state: state,
                    onRetry: { attempt += 1 }, onRestart: onRestart)
            } else {
                BranchingNodePage(
                    story: story, node: node, session: session, sceneNumber: sceneNumber, progress: progress,
                    onSeeEnding: { showEnding = true }, onChoose: { _ in }, onContinue: {})
            }
        }
        // Re-finish on first entry of a path and on an explicit retry.
        .task(id: "\(path)-\(attempt)") { await finish() }
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

/// The ending celebration: art with a shine, the title, stars, the branch map and try-another-path.
private struct BranchingEndingView: View {
    let story: BranchingStory
    let path: [Int]
    let ending: StoryEnding
    let artURL: URL?
    let state: BranchingFinishState
    let onRetry: () -> Void
    let onRestart: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var typeSize

    private var header: some View {
        BranchingBackdrop(url: artURL)
            .frame(height: 214)
            .overlay(alignment: .bottom) {
                RadialGradient(
                    colors: [ds.onHeroKick.opacity(0.5), Color.clear],
                    center: .center, startRadius: 0, endRadius: 62)
                    .frame(width: 200, height: 200)
                    .offset(y: 20)
                    .accessibilityHidden(true)
            }
            .overlay {
                LinearGradient(
                    stops: [
                        .init(color: ds.heroB.opacity(0.05), location: 0),
                        .init(color: ds.heroB.opacity(0.05), location: 0.30),
                        .init(color: ds.surface, location: 1),
                    ],
                    startPoint: .top, endPoint: .bottom)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .topLeading) { BranchingBackButton().padding(.leading, AlphonsoDS.Space.s2) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                VStack(spacing: AlphonsoDS.Space.s2) {
                    Text(BranchingCopy.yourEnding)
                        .dsText(.overline).tracking(1.4)
                        .foregroundStyle(ds.xpText)
                        .accessibilityAddTraits(.isHeader)
                    Text(ending.title)
                        .dsText(.display)
                        .foregroundStyle(ds.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    result
                    actions
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.bottom, AlphonsoDS.Space.s6)
                .padding(.top, -50)
            }
        }
        .background(ds.surface.ignoresSafeArea())
    }

    /// Stars, the wrap line, the branch map and the reading-credit pill, or the saving / failed states.
    @ViewBuilder private var result: some View {
        switch state {
        case .saving:
            wrap
            ProgressView().tint(ds.choice)
        case .failed(let message):
            wrap
            DSCard {
                Text(message).dsText(.footnote).foregroundStyle(ds.inkSoft)
                Button(BranchingCopy.retrySave) { onRetry() }
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
            }
        case .done(let finish):
            // Stars are computed from the server's endings-found against the stored graph, never a client claim.
            let stars = Branching.stars(
                endingsFound: finish.endingsFound.count, endingsTotal: finish.endingsTotal,
                reachedGood: Branching.reachedGood(story.graph, found: finish.endingsFound))
            BranchingStarsRow(stars: stars)
            wrap
            BranchingMapCard(
                map: Branching.branchMap(
                    story.graph, takenPath: path, found: finish.endingsFound, currentEndingID: ending.id))
                .padding(.top, AlphonsoDS.Space.s2)
            if finish.credited {
                Text(BranchingCopy.countsLine)
                    .dsText(.caption)
                    .foregroundStyle(ds.rightInk)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.vertical, AlphonsoDS.Space.s1 + 2)
                    .background(Capsule().fill(ds.rightTint))
            }
        }
    }

    private var wrap: some View {
        Text(ending.wrap)
            .dsText(.footnote)
            .foregroundStyle(ds.ink)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 340)
    }

    /// Both buttons restart from the start, as before. They stack at accessibility text sizes.
    @ViewBuilder private var actions: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: AlphonsoDS.Space.s2))
            : AnyLayout(HStackLayout(spacing: AlphonsoDS.Space.s2 + 2))
        layout {
            Button(BranchingCopy.tryAnotherPath) { onRestart() }
                .buttonStyle(.dsButton(.primary, compact: true, fullWidth: true))
            Button(BranchingCopy.readItAgain) { onRestart() }
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: true))
        }
        .padding(.top, AlphonsoDS.Space.s2)
    }
}

/// Three stars that pop in one after another (scale and a small turn); with Reduce Motion they simply appear.
private struct BranchingStarsRow: View {
    let stars: Int
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var popped = false

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s1) {
            ForEach(0..<3, id: \.self) { index in
                let settled = popped || reduceMotion
                Image(systemName: "star.fill")
                    .font(.title)
                    .foregroundStyle(index < stars ? ds.xp : ds.line)
                    .shadow(color: index < stars ? ds.xpEdge.opacity(0.45) : Color.clear, radius: 3, x: 0, y: 2)
                    .scaleEffect(settled ? 1 : 0.4)
                    .rotationEffect(.degrees(settled ? 0 : -12))
                    .opacity(settled ? 1 : 0)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.6).delay(Double(index) * 0.12),
                        value: popped)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(BranchingCopy.starsLabel(stars))
        .onAppear { popped = true }
    }
}

// MARK: - The branch map

/// "The paths you've found": a card with the tree of choices and endings. The drawing is hidden from assistive tech;
/// the card reads `Branching.branchMapSummary` instead.
private struct BranchingMapCard: View {
    let map: BranchMap
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            HStack {
                Text("The paths you've found").dsText(.headline).foregroundStyle(ds.brand)
                Spacer(minLength: AlphonsoDS.Space.s2)
                Text("\(map.endingsFound) / \(map.endingsTotal)")
                    .dsText(.caption)
                    .foregroundStyle(ds.xpText)
                    .padding(.horizontal, AlphonsoDS.Space.s2)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(ds.xpTint))
            }
            BranchingMapDiagram(map: map)
                .frame(height: max(116, CGFloat(map.endingsTotal) * 26 + 12))
            Text(Branching.branchMapCaption(map))
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                .stroke(ds.line, lineWidth: 2))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Branching.branchMapSummary(map))
    }
}

/// The tree itself: straight links drawn in a Canvas, then the nodes and ending labels as views on top. The start is at
/// the left, endings share one column, and the labels sit to the right of each ending.
private struct BranchingMapDiagram: View {
    let map: BranchMap
    @Environment(\.alphonsoDS) private var ds

    private let inset: CGFloat = 14
    private let verticalInset: CGFloat = 12

    private func point(_ node: BranchMapNode, in size: CGSize) -> CGPoint {
        let left = inset
        let right = max(left, size.width * 0.46)
        let top = verticalInset
        let height = max(0, size.height - verticalInset * 2)
        return CGPoint(x: left + CGFloat(node.x) * (right - left), y: top + CGFloat(node.y) * height)
    }

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let points = Dictionary(uniqueKeysWithValues: map.nodes.map { ($0.id, point($0, in: size)) })
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    for edge in map.edges {
                        guard let from = points[edge.from], let to = points[edge.to] else { continue }
                        var line = Path()
                        line.move(to: from)
                        line.addLine(to: to)
                        switch edge.style {
                        case .taken:
                            context.stroke(line, with: .color(ds.xp), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        case .found:
                            context.stroke(line, with: .color(ds.right), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        case .locked:
                            context.stroke(
                                line, with: .color(ds.line),
                                style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [3, 4]))
                        case .plain:
                            context.stroke(line, with: .color(ds.line), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        }
                    }
                }
                ForEach(map.nodes, id: \.id) { node in
                    if let at = points[node.id] {
                        nodeView(node)
                            .position(at)
                        if let ending = node.ending {
                            label(ending)
                                .frame(width: max(0, size.width - at.x - 16 - 4), alignment: .leading)
                                .position(x: at.x + 16 + max(0, size.width - at.x - 16 - 4) / 2, y: at.y)
                        }
                    }
                }
            }
        }
        // The labels are small by design; keep them from outgrowing the rows.
        .dynamicTypeSize(...DynamicTypeSize.large)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func nodeView(_ node: BranchMapNode) -> some View {
        switch node.kind {
        case .start:
            if let ending = node.ending {
                endingMark(ending.state)
            } else {
                Circle().fill(ds.brand).frame(width: 18, height: 18)
            }
        case .branch:
            if node.onPath {
                Circle().fill(ds.xp).frame(width: 14, height: 14)
            } else {
                Circle().fill(ds.sunk).overlay(Circle().stroke(ds.line, lineWidth: 2)).frame(width: 14, height: 14)
            }
        case .ending:
            if let ending = node.ending { endingMark(ending.state) }
        }
    }

    @ViewBuilder private func endingMark(_ state: BranchMapEndingState) -> some View {
        switch state {
        case .current:
            Circle().fill(ds.xp).frame(width: 18, height: 18)
                .overlay(Image(systemName: "checkmark").font(.caption2.weight(.heavy)).foregroundStyle(ds.ink))
        case .found:
            Circle().fill(ds.right).frame(width: 18, height: 18)
                .overlay(Image(systemName: "checkmark").font(.caption2.weight(.heavy)).foregroundStyle(ds.onRight))
        case .locked:
            Circle().fill(ds.sunk).overlay(Circle().stroke(ds.line, lineWidth: 2)).frame(width: 16, height: 16)
                .overlay(Text("?").dsText(.caption).foregroundStyle(ds.inkFaint))
        }
    }

    private func label(_ ending: BranchMapEnding) -> some View {
        Text(ending.state == .locked ? "Hidden ending" : ending.title)
            .dsText(.caption)
            .foregroundStyle(ending.state == .locked ? ds.inkFaint : ds.ink)
            .lineLimit(1)
            .truncationMode(.tail)
    }
}
