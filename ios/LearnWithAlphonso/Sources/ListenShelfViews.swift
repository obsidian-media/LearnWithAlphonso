import SwiftUI
import LearnWithAlphonsoKit

/// The Listen home (round 6.1, option A): a continue-listening card, a course switch, level chips and one painted
/// room per folder, each with its own episode count and percent heard. All logic is `ListenShelf` in the Kit;
/// this file only draws it. Compiles in CI's ios-app-build; look at it on a device.
struct ListenShelfRoot: View {
    let session: Session
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor
    let folders: [PodcastFolder]
    /// The learner's active course code; the course switch starts here.
    let initialCourse: String
    let onEpisodesLoaded: ([PodcastEpisode]) -> Void

    @State private var episodes: [PodcastEpisode] = []
    @State private var progress: [ListenProgress] = []
    @State private var course: String?
    @State private var level: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isLoading = true
    @State private var loadFailed = false

    private let courses: [(code: String, label: String)] = [("en", "English"), ("fr", "Français"), ("es", "Español")]
    private var activeCourse: String { course ?? initialCourse }

    private var shelves: [ListenShelfFolder] {
        ListenShelf.shelves(folders: folders, episodes: episodes, progress: progress, course: activeCourse)
    }

    var body: some View {
        let all = shelves
        let levels = ListenShelf.levels(all)
        let shown = level.flatMap { chosen in levels.contains(chosen) ? all.filter { $0.level == chosen } : nil } ?? all
        let target = ListenShelf.continueListening(all, progress: progress)

        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                Picker("Course", selection: Binding(get: { activeCourse }, set: { course = $0; level = nil })) {
                    ForEach(courses, id: \.code) { Text($0.label).tag($0.code) }
                }
                .pickerStyle(.segmented)

                if let target {
                    ContinueCard(target: target, player: player, downloads: downloads, networkMonitor: networkMonitor, queue: target.shelf.episodes)
                }

                if !levels.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: AlphonsoSpacing.sm) {
                            ForEach([nil] + levels.map { Optional($0) }, id: \.self) { chip in
                                Button { level = chip } label: {
                                    Text(chip ?? "All")
                                        .dsText(.footnote)
                                        .padding(.horizontal, AlphonsoSpacing.md)
                                        .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                                        .foregroundStyle(level == chip ? AlphonsoColor.onPrimary : AlphonsoColor.inkSoft)
                                        .background(Capsule().fill(level == chip ? AlphonsoColor.moss : AlphonsoColor.surface))
                                }
                                .accessibilityLabel(chip.map { "Level \($0)" } ?? "All levels")
                                .accessibilityAddTraits(level == chip ? .isSelected : [])
                            }
                        }
                    }
                }

                if isLoading {
                    ProgressView("Loading episodes…").tint(AlphonsoColor.moss).frame(maxWidth: .infinity)
                } else if loadFailed {
                    VStack(spacing: AlphonsoSpacing.sm) {
                        Text(networkMonitor.isConnected ? "Couldn't load these episodes." : "You're offline.")
                            .dsText(.body).foregroundStyle(AlphonsoColor.inkSoft)
                        Button("Try again") { Task { await load() } }.tint(AlphonsoColor.moss)
                    }
                    .frame(maxWidth: .infinity)
                } else if shown.isEmpty {
                    VStack(spacing: AlphonsoSpacing.sm) {
                        MascotTile(moment: .emptyState, size: 120, tone: .mint).accessibilityHidden(true)
                        Text(episodes.isEmpty
                            ? PodcastLibraryCopy.emptyMessage
                            : "No \(courses.first { $0.code == activeCourse }?.label ?? "") episodes\(level.map { " at \($0)" } ?? "") yet.")
                            .dsText(.body)
                            .foregroundStyle(AlphonsoColor.ink)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(AlphonsoSpacing.md)
                    .alphonsoGlass()
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: AlphonsoSpacing.sm), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2), spacing: AlphonsoSpacing.sm) {
                        ForEach(shown, id: \.folder.id) { shelf in
                            NavigationLink {
                                ListenShelfDetail(
                                    shelf: shelf, progress: progress, session: session, player: player,
                                    downloads: downloads, networkMonitor: networkMonitor
                                )
                            } label: {
                                RoomTile(shelf: shelf)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(AlphonsoSpacing.md)
        }
        .miniPlayerClearance(player)
        .navigationTitle("Listen")
        .task { await load() }
        // Back from a folder, or after an episode played, the shelf reflects what was just heard.
        .task(id: player.episode?.id) { await reloadProgress() }
    }

    private func load() async {
        guard let client = makePodcastClient(session: session) else { isLoading = false; loadFailed = true; return }
        isLoading = true
        loadFailed = false
        do {
            episodes = try await client.fetchEpisodes()
            onEpisodesLoaded(episodes)
        } catch {
            if !Task.isCancelled { loadFailed = true }
        }
        await reloadProgress()
        isLoading = false
    }

    /// Progress is garnish: a failed read shows an unlistened shelf rather than an error.
    private func reloadProgress() async {
        guard let client = makePodcastClient(session: session) else { return }
        if let rows = try? await client.fetchListenProgress() { progress = rows }
    }
}

private struct RoomBackdrop: View {
    let room: String
    var body: some View {
        // The image is an overlay, not a ZStack child: a scaledToFill image sizes its parent to the picture's own
        // aspect ratio, which blew the room tiles and the Continue card up to full-screen height (QA, build 61).
        AlphonsoColor.mossDeep
            .overlay {
                if let image = LessonArt.room(room) {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
            .clipped()
        .accessibilityHidden(true)
    }
}

private struct RoomTile: View {
    let shelf: ListenShelfFolder

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoomBackdrop(room: shelf.room)
            LinearGradient(colors: [.clear, AlphonsoColor.mossDeep.opacity(0.85)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 2) {
                if let level = shelf.level {
                    Text(level).dsText(.caption).foregroundStyle(AlphonsoColor.ink)
                        .padding(.horizontal, AlphonsoSpacing.sm).background(Capsule().fill(AlphonsoColor.parchment))
                }
                Spacer(minLength: 0)
                Text(shelf.folder.title)
                    .dsText(.headline).foregroundStyle(AlphonsoColor.onPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(shelf.episodes.count) \(shelf.episodes.count == 1 ? "episode" : "episodes") \u{00B7} \(shelf.percent == 100 ? "finished \u{2713}" : "\(shelf.percent)%")")
                    .dsText(.caption).foregroundStyle(AlphonsoColor.onPrimary.opacity(0.85))
            }
            .padding(AlphonsoSpacing.sm + 2)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(AlphonsoColor.hairline, lineWidth: 2))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(shelf.folder.title), \(shelf.level ?? "all levels"), \(shelf.episodes.count) episodes, \(shelf.percent == 100 ? "finished" : "\(shelf.percent) percent done")")
    }
}

private struct ContinueCard: View {
    let target: ListenShelf.ContinueTarget
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor
    let queue: [PodcastEpisode]

    var body: some View {
        let left = ListenShelf.secondsLeft(target.episode, target.progress)
        let number = (queue.firstIndex { $0.id == target.episode.id } ?? 0) + 1
        Button {
            player.play(target.episode, localURL: downloads.localURL(episodeID: target.episode.id),
                        queue: queue, isOnline: networkMonitor.isConnected)
            downloads.markPlayed(episodeID: target.episode.id)
        } label: {
            ZStack(alignment: .bottomLeading) {
                RoomBackdrop(room: target.shelf.room)
                LinearGradient(colors: [AlphonsoColor.mossDeep.opacity(0.4), AlphonsoColor.mossDeep.opacity(0.9)], startPoint: .top, endPoint: .bottom)
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                        Text("CONTINUE LISTENING").dsText(.caption).foregroundStyle(AlphonsoColor.emberSoft)
                        Spacer(minLength: 0)
                        Text(target.episode.title).dsText(.title)
                            .foregroundStyle(AlphonsoColor.onPrimary).fixedSize(horizontal: false, vertical: true)
                        Text(([target.shelf.level, "Episode \(number)", target.progress == nil ? ListenShelf.clock(left) : "\(ListenShelf.clock(left)) left"]
                            .compactMap { $0 }).joined(separator: " \u{00B7} "))
                            .dsText(.footnote).foregroundStyle(AlphonsoColor.onPrimary.opacity(0.85))
                        ProgressView(value: ListenShelf.fraction(target.episode, target.progress)).tint(AlphonsoColor.ember)
                    }
                    Image(MascotArt.assetName(for: .learnGreeting)).resizable().scaledToFit().frame(width: 96)
                        .accessibilityHidden(true)
                }
                .padding(AlphonsoSpacing.md)
            }
            .frame(minHeight: 176)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(AlphonsoColor.ember, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Continue listening: \(target.episode.title), \(ListenShelf.clock(left)) left")
        .accessibilityAddTraits(.isButton)
    }
}

/// One folder: the room as header, one continue/start button, and every episode with its state.
struct ListenShelfDetail: View {
    let shelf: ListenShelfFolder
    let progress: [ListenProgress]
    let session: Session
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor

    @State private var quizEpisodeIDs: Set<String> = []

    var body: some View {
        let byID = Dictionary(progress.map { ($0.episodeID, $0) }, uniquingKeysWith: { a, _ in a })
        let target = ListenShelf.continueListening([shelf], progress: progress)?.episode
            ?? shelf.episodes.first { ListenShelf.state(byID[$0.id]) == .new }
        let minutes = max(1, Int((Double(shelf.totalSeconds) / 60).rounded()))

        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                ZStack(alignment: .bottomLeading) {
                    RoomBackdrop(room: shelf.room)
                    LinearGradient(colors: [.clear, AlphonsoColor.parchment], startPoint: .center, endPoint: .bottom)
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                            if let level = shelf.level {
                                Text(level).dsText(.caption).foregroundStyle(AlphonsoColor.ink)
                                    .padding(.horizontal, AlphonsoSpacing.sm).background(Capsule().fill(AlphonsoColor.surface))
                            }
                            Text(shelf.folder.title).dsText(.display).foregroundStyle(AlphonsoColor.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Hosted by Alphonso \u{00B7} \(shelf.episodes.count) \(shelf.episodes.count == 1 ? "episode" : "episodes") \u{00B7} \(minutes) min")
                                .dsText(.footnote).foregroundStyle(AlphonsoColor.inkSoft)
                        }
                        Spacer(minLength: 0)
                        Image(MascotArt.assetName(for: .lessonComplete)).resizable().scaledToFit().frame(width: 110)
                            .accessibilityHidden(true)
                    }
                    .padding(AlphonsoSpacing.md)
                }
                .frame(minHeight: 240)

                if let target {
                    let isContinue = ListenShelf.state(byID[target.id]) == .inProgress
                    let number = (shelf.episodes.firstIndex { $0.id == target.id } ?? 0) + 1
                    Button {
                        play(target)
                    } label: {
                        Label("\(isContinue ? "Continue" : "Start") Episode \(number)", systemImage: "play.fill")
                            .dsText(.headline)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(AlphonsoColor.onPrimary)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AlphonsoColor.moss))
                    }
                    .padding(.horizontal, AlphonsoSpacing.md)
                }

                ForEach(Array(shelf.episodes.enumerated()), id: \.element.id) { index, episode in
                    let p = byID[episode.id]
                    let state = ListenShelf.state(p)
                    VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                        HStack(spacing: AlphonsoSpacing.sm) {
                            Button { play(episode) } label: {
                                HStack(spacing: AlphonsoSpacing.sm + 2) {
                                    Text(state == .done ? "\u{2713}" : "\(index + 1)")
                                        .dsText(.body)
                                        .foregroundStyle(state == .done ? AlphonsoColor.onPrimary : AlphonsoColor.ink)
                                        .frame(width: 36, height: 36)
                                        .background(Circle().fill(state == .done ? AlphonsoColor.moss : state == .inProgress ? AlphonsoColor.emberSoft : AlphonsoColor.surface))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(episode.title).dsText(.headline).foregroundStyle(AlphonsoColor.ink)
                                            .fixedSize(horizontal: false, vertical: true)
                                        if state == .inProgress {
                                            ProgressView(value: ListenShelf.fraction(episode, p)).tint(AlphonsoColor.ember)
                                        }
                                        Text(subtitle(episode, state: state, left: ListenShelf.secondsLeft(episode, p)))
                                            .dsText(.caption).foregroundStyle(AlphonsoColor.inkSoft)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(AlphonsoSpacing.sm + 2)
                                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AlphonsoColor.surface))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(episode.title), \(ListenShelf.clock(episode.durationSeconds)), \(state == .done ? "finished" : state == .inProgress ? "\(ListenShelf.clock(ListenShelf.secondsLeft(episode, p))) left" : "new")")
                            PodcastDownloadButton(episode: episode, downloads: downloads, player: player)
                        }
                        if quizEpisodeIDs.contains(episode.id) {
                            PodcastQuizRowButton(episode: episode, session: session).padding(.leading, AlphonsoSpacing.sm)
                        }
                    }
                    .padding(.horizontal, AlphonsoSpacing.md)
                }
            }
        }
        .miniPlayerClearance(player)
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard let client = makePodcastClient(session: session) else { return }
            quizEpisodeIDs = (try? await client.fetchQuizEpisodeIDs(episodeIDs: shelf.episodes.map(\.id))) ?? []
        }
    }

    private func subtitle(_ episode: PodcastEpisode, state: ListenEpisodeState, left: Int) -> String {
        var parts = [ListenShelf.clock(episode.durationSeconds)]
        if state == .inProgress { parts.append("\(ListenShelf.clock(left)) left") }
        if state == .new { parts.append("New") }
        if episode.aiNarrated { parts.append(PodcastLabel.aiNarrated) }
        return parts.joined(separator: " \u{00B7} ")
    }

    private func play(_ episode: PodcastEpisode) {
        player.play(episode, localURL: downloads.localURL(episodeID: episode.id),
                    queue: shelf.episodes, isOnline: networkMonitor.isConnected)
        downloads.markPlayed(episodeID: episode.id)
    }
}
