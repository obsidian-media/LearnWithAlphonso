import SwiftUI
import LearnWithAlphonsoKit

/// The Library sub-tab picked this session. It survives leaving the Library and coming back, and is forgotten when the app
/// restarts: "at most per session", and a fresh launch starts on All.
enum LibrarySession {
    nonisolated(unsafe) static var tab: LibraryTab = .all
}

/// How the Watch videos are drawn: the All tab's `peek` row, the Watch tab's `full` grid, or `hidden` (the host stays
/// mounted for its player sheet and the path deep link but draws nothing).
enum WatchPresentation {
    case peek, full, hidden
}

/// The Library home under four sub-tabs (All, Listen, Watch, Stories). All is a Continue card plus a one-row peek of Watch
/// and of Stories, each with "See all"; Listen is the course switch, level chips and one painted room per folder, each
/// with its own episode count and percent heard; Watch and Stories are the focused screens. All logic is `ListenShelf` in the Kit;
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
    /// Seconds listened this month (podcast_play_events); the chip is hidden under a minute.
    @State private var monthSeconds = 0
    @State private var course: String?
    @State private var level: String?
    /// The sub-tab: All by default on a fresh launch, then the one picked this session (LibrarySession).
    @State private var tab: LibraryTab = LibrarySession.tab
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isLoading = true
    @State private var loadFailed = false
    @Environment(\.alphonsoDS) private var ds

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
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                DSSegmented(
                    options: courses.map { DSSegmented<String>.Option(value: $0.code, label: $0.label) },
                    selection: Binding(get: { activeCourse }, set: { course = $0; level = nil }),
                    accessibilityLabel: "Course")

                libraryTabs

                // All: the Continue card, then a one-row peek of Watch and of Stories, each with "See all".
                if tab == .all, let target {
                    ContinueCard(target: target, player: player, downloads: downloads, networkMonitor: networkMonitor, queue: target.shelf.episodes)
                }

                // One Watch host at one fixed place in the stack, so its player sheet and the path deep link survive a tab
                // switch. It draws the peek on All, the full shelf on Watch, and only its loader and sheet elsewhere.
                WatchShelfHost(session: session, player: player, course: activeCourse, presentation: watchPresentation,
                               onSeeAll: { select(.watch) })

                if tab == .all || tab == .stories {
                    StoriesSection(session: session, player: player, course: activeCourse,
                                   presentation: tab == .all ? .peek : .full, onSeeAll: { select(.stories) })
                }

                if tab == .all {
                    if loadFailed {
                        DSEmptyState(
                            art: "Alphonso-thinking",
                            title: networkMonitor.isConnected ? "Couldn't load these episodes." : "You're offline.",
                            actionTitle: "Try again") { Task { await load() } }
                    }
                }

                if tab == .listen {
                    if let chip = ListenShelf.monthChip(seconds: monthSeconds) {
                        Label(chip, systemImage: "timer")
                            .dsText(.footnote)
                            .foregroundStyle(ds.inkSoft)
                            .padding(.horizontal, AlphonsoDS.Space.s4)
                            .frame(minHeight: AlphonsoDS.Space.minTouch)
                            .background(Capsule().fill(ds.card))
                            .accessibilityElement(children: .combine)
                    }

                    if !levels.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: AlphonsoDS.Space.s2) {
                                ForEach([nil] + levels.map { Optional($0) }, id: \.self) { chip in
                                    DSChip(chip ?? "All", selected: level == chip,
                                           accessibilityText: chip.map { "Level \($0)" } ?? "All levels") { level = chip }
                                }
                            }
                        }
                    }

                    if isLoading {
                        ProgressView("Loading episodes…").tint(ds.choice).frame(maxWidth: .infinity)
                    } else if loadFailed {
                        DSEmptyState(
                            art: "Alphonso-thinking",
                            title: networkMonitor.isConnected ? "Couldn't load these episodes." : "You're offline.",
                            actionTitle: "Try again") { Task { await load() } }
                    } else if shown.isEmpty {
                        DSEmptyState(
                            art: "Alphonso-reading-book",
                            title: episodes.isEmpty
                                ? PodcastLibraryCopy.emptyTitle(courseCode: activeCourse)
                                : "No \(courses.first { $0.code == activeCourse }?.label ?? "") episodes\(level.map { " at \($0)" } ?? "") yet.",
                            message: episodes.isEmpty ? PodcastLibraryCopy.emptyMessage : nil)
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: AlphonsoDS.Space.s2), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2), spacing: AlphonsoDS.Space.s2) {
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
            }
            .padding(AlphonsoDS.Space.s4)
        }
        .miniPlayerClearance(player)
        .navigationTitle("Library")
        .task { await load() }
        // Back from a folder, or after an episode played, the shelf reflects what was just heard.
        .task(id: player.episode?.id) { await reloadProgress() }
    }

    private var watchPresentation: WatchPresentation {
        switch tab {
        case .all: return .peek
        case .watch: return .full
        case .listen, .stories: return .hidden
        }
    }

    /// The tab chosen this session is remembered (LibrarySession); a fresh launch starts on All.
    private func select(_ next: LibraryTab) {
        tab = next
        LibrarySession.tab = next
    }

    /// All, Listen, Watch, Stories: one row of chips, the selected one announced to VoiceOver.
    private var libraryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AlphonsoDS.Space.s2) {
                ForEach(LibraryTab.allCases, id: \.self) { item in
                    DSChip(item.title, selected: tab == item, accessibilityText: "\(item.title) tab") { select(item) }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Library sections")
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
        if let seconds = try? await client.fetchMonthListenedSeconds() { monthSeconds = seconds }
    }
}

/// The Watch shelf with its player sheet and the path deep link into it. It owns the videos read, so the shelf shows
/// whenever there are published videos: beside the rooms, and also when the podcast side is empty, offline or failed
/// (ListenView). It draws nothing when the course has no videos, so the podcast empty state is all that is left when
/// there are neither podcasts nor videos.
struct WatchShelfHost: View {
    let session: Session
    let player: PodcastAudioPlayer
    let course: String
    var presentation: WatchPresentation = .full
    var onSeeAll: (() -> Void)?

    /// Alphonso videos, read on their own so a failed read never hides the podcasts.
    @State private var videos: [LibraryVideo] = []
    @State private var videosLoaded = false
    @State private var videosFailed = false
    @State private var watching: LibraryVideo?
    /// Where the player's "practice this" goes once the sheet has finished closing.
    @State private var practiceAfterClose: PathDestination?
    @Environment(PathDeepLink.self) private var deepLink
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        // The loaders hang off `loadAnchor`, a real (zero-size) child that is always in the tree. They must never sit on
        // the conditional content: while `videos` is empty the shelf draws nothing, a view that draws nothing never
        // appears, and a `.task` on it never fires, so the shelf would never load (build 63).
        VStack(spacing: 0) {
            if presentation == .hidden {
                EmptyView()
            } else if videosFailed {
                HStack {
                    Text("We couldn't load the videos.").dsText(.footnote).foregroundStyle(ds.inkSoft)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    Button("Try again") { Task { await loadVideos() } }.tint(ds.choice)
                }
                .padding(AlphonsoDS.Space.s4)
                .alphonsoGlass()
            } else {
                WatchShelfSection(videos: VideoShelf.shelf(videos, course: course), presentation: presentation, onSeeAll: onSeeAll) { watching = $0 }
            }
            loadAnchor
        }
        .sheet(item: $watching, onDismiss: {
            // Back from the player: the shelf shows what was just watched, and a chosen practice item opens now.
            Task { await loadVideos() }
            if let destination = practiceAfterClose {
                practiceAfterClose = nil
                deepLink.open(destination)
            }
        }) { video in
            VideoPlayerSheet(
                video: video,
                client: makePodcastClient(session: session),
                pauseOtherAudio: { player.pauseForVoice() },
                onPractice: { destination in
                    practiceAfterClose = destination
                    watching = nil
                },
                onClose: { watching = nil }
            )
            .presentationDetents([.large])
        }
    }

    /// Always present, draws nothing, takes no room. Carries the videos read and the path deep link.
    private var loadAnchor: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task { await loadVideos() }
            // A path stop for a video lands here: open its player as soon as the videos are known.
            .task(id: deepLink.pending) { openPendingVideo() }
    }

    private func loadVideos() async {
        guard let client = makePodcastClient(session: session) else {
            // No session token: say so instead of showing nothing.
            videosFailed = true
            videosLoaded = true
            return
        }
        do {
            videos = try await client.fetchVideos()
            videosFailed = false
        } catch {
            if Task.isCancelled { return }
            videosFailed = true
        }
        videosLoaded = true
        openPendingVideo()
    }

    private func openPendingVideo() {
        guard case let .video(id)? = deepLink.pending, videosLoaded else { return }
        deepLink.pending = nil
        if let video = videos.first(where: { $0.id == id }) { watching = video }
    }
}

/// The Watch videos as vertical posters. `peek` is the All tab's one row (the first few, with "See all"), `full` is the
/// Watch tab (every video, wrapped). It draws NOTHING when there are none (no empty box). A poster shows its state (a New
/// badge, a bar part-way through, a tick when watched) and its length; every title, length and state comes from the rows
/// (`VideoShelf` in the Kit), which track all three states, so none is invented here.
private struct WatchShelfSection: View {
    let videos: [LibraryVideo]
    let presentation: WatchPresentation
    var onSeeAll: (() -> Void)?
    let onOpen: (LibraryVideo) -> Void
    @Environment(\.alphonsoDS) private var ds

    private let posterWidth: CGFloat = 104

    var body: some View {
        if !videos.isEmpty && presentation != .hidden {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                HStack {
                    Text("Watch").dsText(.title).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    if presentation == .peek, let onSeeAll {
                        Button("See all") { onSeeAll() }
                            .dsText(.footnote).foregroundStyle(ds.choice)
                            .frame(minHeight: AlphonsoDS.Space.minTouch)
                            .accessibilityLabel(LibraryTab.watch.seeAllLabel)
                    }
                }
                if presentation == .peek {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                            ForEach(videos.prefix(LibraryTab.watchPeekCount)) { video in
                                card(video).frame(width: posterWidth)
                            }
                        }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: posterWidth), spacing: AlphonsoDS.Space.s3, alignment: .top)],
                              alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        ForEach(videos) { video in card(video) }
                    }
                }
            }
        }
    }

    private func card(_ video: LibraryVideo) -> some View {
        let state = VideoShelf.state(video)
        let stateWord = state == .done ? "watched" : state == .inProgress ? "in progress" : "new"
        let length = VideoShelf.clock(Double(video.durationSeconds))
        return Button { onOpen(video) } label: {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                // The picture is an overlay on a sized clear base: a scaledToFill image would otherwise size its parent.
                Color.clear
                    .aspectRatio(2.0 / 3.0, contentMode: .fit)
                    .background(ds.sunk)
                    .overlay {
                        if let poster = video.posterURL {
                            AsyncImage(url: poster) { image in image.resizable().scaledToFill() } placeholder: { ds.sunk }
                        }
                    }
                    .overlay {
                        Image(systemName: "play.fill").foregroundStyle(.white).shadow(radius: 2)
                    }
                    .overlay(alignment: .topLeading) {
                        if let level = video.level {
                            Text(level).dsText(.caption).foregroundStyle(ds.choice)
                                .padding(.horizontal, AlphonsoDS.Space.s2)
                                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.choiceTint))
                                .padding(AlphonsoDS.Space.s2)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if state == .new {
                            Text("NEW").dsText(.caption).foregroundStyle(.white)
                                .padding(.horizontal, AlphonsoDS.Space.s2)
                                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.heart))
                                .padding(AlphonsoDS.Space.s2)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        if state == .done {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(ds.right)
                                .background(Circle().fill(ds.card)).padding(AlphonsoDS.Space.s2)
                        } else {
                            Text(length).dsText(.caption).foregroundStyle(.white)
                                .padding(.horizontal, AlphonsoDS.Space.s2)
                                .background(Capsule().fill(ds.hero.opacity(0.7)))
                                .padding(AlphonsoDS.Space.s2)
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if state == .inProgress {
                            ProgressView(value: VideoShelf.fraction(video)).tint(ds.xp)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                Text(video.title).dsText(.footnote).foregroundStyle(ds.ink)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(video.title), \(length), \(stateWord)")
        .accessibilityAddTraits(.isButton)
    }
}

private struct RoomBackdrop: View {
    let room: String
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        // The image is an overlay, not a ZStack child: a scaledToFill image sizes its parent to the picture's own
        // aspect ratio, which blew the room tiles and the Continue card up to full-screen height (QA, build 61).
        ds.hero
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
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoomBackdrop(room: shelf.room)
            LinearGradient(colors: [.clear, ds.hero.opacity(0.85)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 2) {
                if let level = shelf.level {
                    Text(level).dsText(.caption).foregroundStyle(ds.ink)
                        .padding(.horizontal, AlphonsoDS.Space.s2).background(Capsule().fill(ds.card))
                }
                Spacer(minLength: 0)
                Text(shelf.folder.title)
                    .dsText(.headline).foregroundStyle(ds.onHero)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(shelf.episodes.count) \(shelf.episodes.count == 1 ? "episode" : "episodes") \u{00B7} \(shelf.percent == 100 ? "finished \u{2713}" : "\(shelf.percent)%")")
                    .dsText(.caption).foregroundStyle(ds.onHeroSoft)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).stroke(ds.line, lineWidth: 2))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(shelf.folder.title), \(shelf.level ?? "all levels"), \(shelf.episodes.count) episodes, \(shelf.percent == 100 ? "finished" : "\(shelf.percent) percent done")")
    }
}

/// The All tab's Continue card: the podcast-studio art (one square picture, centre-cropped to fill), a gold play button and
/// "Episode N of M". It resumes `ListenShelf.continueListening` (the most recently touched episode still in progress, else the
/// next new one in that series). One button, one spoken label.
private struct ContinueCard: View {
    let target: ListenShelf.ContinueTarget
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor
    let queue: [PodcastEpisode]
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let left = ListenShelf.secondsLeft(target.episode, target.progress)
        let number = (queue.firstIndex { $0.id == target.episode.id } ?? 0) + 1
        let detail = target.progress == nil ? ListenShelf.clock(left) : "\(ListenShelf.clock(left)) left"
        Button {
            player.play(target.episode, localURL: downloads.localURL(episodeID: target.episode.id),
                        queue: queue, isOnline: networkMonitor.isConnected)
            downloads.markPlayed(episodeID: target.episode.id)
        } label: {
            ZStack(alignment: .bottomLeading) {
                RoomBackdrop(room: "continue-studio")
                LinearGradient(colors: [.clear, ds.hero.opacity(0.95)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Spacer(minLength: 0)
                    Text("CONTINUE LISTENING").dsText(.caption).foregroundStyle(ds.onHeroKick)
                    Text(target.episode.title).dsText(.title)
                        .foregroundStyle(ds.onHero).fixedSize(horizontal: false, vertical: true)
                    Text(LibraryTab.continueSubtitle(number: number, count: queue.count, detail: detail))
                        .dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    DSProgressBar(fraction: ListenShelf.fraction(target.episode, target.progress), onHero: true)
                }
                .padding(AlphonsoDS.Space.s4)
                .padding(.trailing, AlphonsoDS.Space.s12 + AlphonsoDS.Space.s4)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 208)
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "play.fill")
                    .foregroundStyle(ds.onAction)
                    .frame(width: AlphonsoDS.Space.s12, height: AlphonsoDS.Space.s12)
                    .background(Circle().fill(ds.action))
                    .background(Circle().fill(ds.actionEdge).offset(y: 4))
                    .padding(AlphonsoDS.Space.s4)
                    .accessibilityHidden(true)
            }
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.sheet, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LibraryTab.continueLabel(series: target.shelf.folder.title, number: number, count: queue.count,
                                                     title: target.episode.title, detail: detail))
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
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let byID = Dictionary(progress.map { ($0.episodeID, $0) }, uniquingKeysWith: { a, _ in a })
        let target = ListenShelf.continueListening([shelf], progress: progress)?.episode
            ?? shelf.episodes.first { ListenShelf.state(byID[$0.id]) == .new }
        let minutes = max(1, Int((Double(shelf.totalSeconds) / 60).rounded()))

        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                ZStack(alignment: .bottomLeading) {
                    RoomBackdrop(room: shelf.room)
                    LinearGradient(colors: [.clear, ds.surface], startPoint: .center, endPoint: .bottom)
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                            if let level = shelf.level {
                                Text(level).dsText(.caption).foregroundStyle(ds.ink)
                                    .padding(.horizontal, AlphonsoDS.Space.s2).background(Capsule().fill(ds.card))
                            }
                            Text(shelf.folder.title).dsText(.display).foregroundStyle(ds.brand)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Hosted by Alphonso \u{00B7} \(shelf.episodes.count) \(shelf.episodes.count == 1 ? "episode" : "episodes") \u{00B7} \(minutes) min")
                                .dsText(.footnote).foregroundStyle(ds.inkSoft)
                        }
                        Spacer(minLength: 0)
                        Image(MascotArt.assetName(for: .lessonComplete)).resizable().scaledToFit().frame(width: 110)
                            .accessibilityHidden(true)
                    }
                    .padding(AlphonsoDS.Space.s4)
                }
                .frame(minHeight: 240)

                if let target {
                    let isContinue = ListenShelf.state(byID[target.id]) == .inProgress
                    let number = (shelf.episodes.firstIndex { $0.id == target.id } ?? 0) + 1
                    // The one gold button of the folder (round 6.1).
                    Button {
                        play(target)
                    } label: {
                        Label("\(isContinue ? "Continue" : "Start") Episode \(number)", systemImage: "play.fill")
                    }
                    .buttonStyle(.dsButton(.primary))
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                }

                ForEach(Array(shelf.episodes.enumerated()), id: \.element.id) { index, episode in
                    let p = byID[episode.id]
                    let state = ListenShelf.state(p)
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            Button { play(episode) } label: {
                                HStack(spacing: AlphonsoDS.Space.s3) {
                                    Text(state == .done ? "\u{2713}" : "\(index + 1)")
                                        .dsText(.body)
                                        .foregroundStyle(state == .done ? ds.onRight : ds.ink)
                                        .frame(width: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1, height: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1)
                                        .background(Circle().fill(state == .done ? ds.right : state == .inProgress ? ds.actionTint : ds.sunk))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(episode.title).dsText(.headline).foregroundStyle(ds.ink)
                                            .fixedSize(horizontal: false, vertical: true)
                                        if state == .inProgress {
                                            DSProgressBar(fraction: ListenShelf.fraction(episode, p))
                                        }
                                        Text(subtitle(episode, state: state, left: ListenShelf.secondsLeft(episode, p)))
                                            .dsText(.caption).foregroundStyle(ds.inkSoft)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(AlphonsoDS.Space.s3)
                                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                                .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(episode.title), \(ListenShelf.clock(episode.durationSeconds)), \(state == .done ? "finished" : state == .inProgress ? "\(ListenShelf.clock(ListenShelf.secondsLeft(episode, p))) left" : "new")")
                            PodcastDownloadButton(episode: episode, downloads: downloads, player: player)
                        }
                        if quizEpisodeIDs.contains(episode.id) {
                            PodcastQuizRowButton(episode: episode, session: session).padding(.leading, AlphonsoDS.Space.s2)
                        }
                    }
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                }
            }
        }
        .background(ds.surface)
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
