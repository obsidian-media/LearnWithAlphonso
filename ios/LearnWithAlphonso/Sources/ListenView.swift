import SwiftUI
import LearnWithAlphonsoKit

/// Listen: browse the podcast folder tree and play an episode.
///
/// This view owns the `NavigationStack`; the screens pushed over it (`ListenShelfDetail`, in ListenShelfViews.swift)
/// deliberately do **not**. Nesting gives two navigation bars and unreliable inner links, which
/// compiles cleanly and is wrong on a screen.
///
/// The library follows the active course (French learners see French episodes), hides
/// folders with nothing published beneath them, and says so plainly when a course has
/// nothing yet. A failed load is never shown as an empty library.
struct ListenView: View {
    let session: Session
    let networkMonitor: NetworkMonitor
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    /// The learner's active course, shared with Learn, Practice and Hector.
    let activeCourse: ActiveCourseModel

    @Environment(\.alphonsoDS) private var ds
    @State private var folders: [PodcastFolder] = []
    @State private var publishedIndex: [PodcastPublishedEpisodeRef] = []
    /// Every episode seen this session, so an offline listing can name what
    /// was downloaded. Downloads outlive any one folder fetch.
    @State private var knownEpisodes: [PodcastEpisode] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var searchQuery = ""
    @State private var searchResults: [PodcastEpisode] = []
    @State private var isSearching = false
    @State private var searchFailed = false

    private var courseCode: String { activeCourse.course.wireCode }

    /// Every folder with a published episode, of ALL courses. The Library has its own EN/FR/ES switch that narrows by
    /// course inside ListenShelf.shelves; pre-filtering to the active course here hid the other two courses' episodes
    /// (build 72: "I don't see the Spanish/French podcast episodes"). Search shares this set, so a result in any
    /// course the Library can show is reachable.
    private var visibleFolders: [PodcastFolder] {
        PodcastLibrary.publishedFolders(
            folders,
            publishedFolderIDs: Set(publishedIndex.map(\.folderID))
        )
    }

    var body: some View {
        NavigationStack {
            Group {
                if searchQuery.isEmpty {
                    content
                } else {
                    PodcastSearchResultsView(
                        query: searchQuery,
                        results: PodcastLibrary.episodes(searchResults, inFolders: visibleFolders),
                        isSearching: isSearching,
                        searchFailed: searchFailed,
                        player: player,
                        downloads: downloads,
                        networkMonitor: networkMonitor
                    )
                }
            }
            .screenScene(.listen)
            .navigationTitle("Library")
            .searchable(text: $searchQuery, prompt: "Search episodes")
        }
        .tint(ds.choice)
        .task { await load() }
        // Keyed on the NORMALIZED query, so "coffee" and "  coffee  " do not
        // fetch twice and each keystroke cancels the previous request rather
        // than racing it.
        .task(id: PodcastSearch.normalizeQuery(searchQuery)) { await runSearch() }
    }

    private func runSearch() async {
        // Below the minimum length PodcastSearch declines to build a filter
        // and the client never calls the network, so there is nothing to show
        // and nothing to report as "no results".
        guard PodcastSearch.normalizeQuery(searchQuery) != nil,
              let client = makePodcastClient(session: session)
        else {
            searchResults = []
            isSearching = false
            searchFailed = false
            return
        }
        isSearching = true
        searchFailed = false
        do {
            searchResults = try await client.searchEpisodes(query: searchQuery)
        } catch {
            // A superseded keystroke's request is cancelled; that is not a failure.
            if Task.isCancelled { return }
            searchResults = []
            searchFailed = true
        }
        isSearching = false
    }

    @ViewBuilder
    private var content: some View {
        if isLoading {
            ProgressView("Loading episodes…")
                .padding(AlphonsoDS.Space.s6)
                .alphonsoGlass()
                .tint(ds.choice)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !networkMonitor.isConnected && folders.isEmpty {
            // Offline shows the DOWNLOADED set, flat, rather than an error.
            // Nothing downloaded is its own state: telling someone who downloaded
            // three episodes that there are none would be a lie about their own device.
            let offline = PodcastCache.offlineListing(
                entries: downloads.entries(),
                episodes: knownEpisodes
            )
            if offline.isEmpty {
                withWatchShelf {
                    DSEmptyState(
                        art: "Alphonso-sleepy-night", title: "You're offline",
                        message: "Download episodes while you have a connection and they'll play here.",
                        actionTitle: "Try again") { Task { await load() } }
                }
            } else {
                OfflineEpisodeList(episodes: offline, player: player, downloads: downloads)
            }
        } else if let errorMessage {
            withWatchShelf {
                DSEmptyState(
                    art: "Alphonso-thinking", title: "Couldn't load episodes", message: errorMessage,
                    actionTitle: "Try again") { Task { await load() } }
            }
        } else if visibleFolders.isEmpty {
            // No podcasts is a stated state, not a blank list. The Watch shelf still shows above it when the course
            // has published videos; with neither podcasts nor videos this is all there is.
            withWatchShelf {
                DSEmptyState(
                    art: "Alphonso-reading-book", title: PodcastLibraryCopy.emptyTitle(courseCode: courseCode),
                    message: PodcastLibraryCopy.emptyMessage, actionTitle: "Refresh") { Task { await load() } }
            }
        } else {
            // The Listen home is the rooms shelf (ListenShelfViews.swift); a folder opens its own episode list.
            ListenShelfRoot(
                session: session,
                player: player,
                downloads: downloads,
                networkMonitor: networkMonitor,
                folders: visibleFolders,
                initialCourse: courseCode,
                onEpisodesLoaded: rememberEpisodes
            )
        }
    }

    /// The podcast-side placeholder (empty, offline, failed) under the Watch shelf, so published videos and path video
    /// stops stay reachable when there is nothing to list. The shelf draws nothing when the course has no videos.
    private func withWatchShelf<Content: View>(@ViewBuilder _ placeholder: () -> Content) -> some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                WatchShelfHost(session: session, player: player, course: courseCode)
                placeholder()
            }
            .padding(AlphonsoDS.Space.s4)
        }
        .miniPlayerClearance(player)
    }

    /// Keeps one entry per episode id, so the offline listing can name a
    /// download whose folder has not been opened this launch.
    private func rememberEpisodes(_ loaded: [PodcastEpisode]) {
        var byID = Dictionary(knownEpisodes.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for episode in loaded { byID[episode.id] = episode }
        knownEpisodes = Array(byID.values)
    }

    private func load() async {
        guard let client = makePodcastClient(session: session) else {
            isLoading = false
            errorMessage = "Please sign in again to load episodes."
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            async let folderRows = client.fetchFolders()
            async let index = client.fetchPublishedIndex()
            let (loadedFolders, loadedIndex) = try await (folderRows, index)
            folders = loadedFolders
            publishedIndex = loadedIndex
            // Licensing: downloads of unpublished episodes go, but only after a
            // successful read. A failed read says nothing about what is published.
            // Skipped when no folders came back: that is a role or RLS problem, not
            // "everything was unpublished" (PodcastLibrary.canPruneDownloads).
            if PodcastLibrary.canPruneDownloads(afterLoading: loadedFolders) {
                downloads.removeDownloads(
                    notIn: Set(loadedIndex.map(\.episodeID)),
                    keeping: player.episode?.id
                )
            }
        } catch PodcastClientError.unauthorized {
            errorMessage = "Please sign in again to load episodes."
        } catch {
            errorMessage = networkMonitor.isConnected
                ? Copy.connectionFailure
                : "You're offline."
        }
        isLoading = false
    }
}

/// Builds a client from the current session, or nil when there is no access
/// token to build one with.
///
/// Free function rather than a shared singleton because the token changes:
/// PodcastClient holds the one it was given and cannot refresh it, so a
/// client is built per call site from whatever the session currently has.
@MainActor
func makePodcastClient(session: Session) -> PodcastClient? {
    guard let accessToken = session.accessToken else { return nil }
    return PodcastClient(
        supabaseURL: AppConfig.supabaseURL,
        anonKey: AppConfig.supabasePublishableKey,
        accessToken: accessToken
    )
}

/// Search results, flat across the active course's visible folders. Mirrors the web
/// app's `PodcastSearchResults`.
///
/// Owns no `NavigationStack` -- ListenView owns it.
///
/// The empty-ish states are deliberately distinct. Below the minimum length
/// `PodcastSearch` declines to build a filter and the client never calls the network,
/// so "no episodes match" would be a lie about a search that never ran, and a failed
/// search is not "no episodes match" either.
private struct PodcastSearchResultsView: View {
    let query: String
    let results: [PodcastEpisode]
    let isSearching: Bool
    let searchFailed: Bool
    let player: PodcastAudioPlayer
    /// Search results play the downloaded copy too -- a result found while
    /// offline is useless if tapping it reaches for the network.
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        if PodcastSearch.normalizeQuery(query) == nil {
            message("Keep typing to search episodes.")
        } else if isSearching {
            message("Searching…")
        } else if searchFailed {
            message(networkMonitor.isConnected
                ? Copy.connectionFailure
                : "You're offline. Search needs a connection.")
        } else if results.isEmpty {
            message("No episodes match “\(query)”.")
        } else {
            List {
                ForEach(results) { episode in
                    Button {
                        player.play(
                            episode,
                            localURL: downloads.localURL(episodeID: episode.id),
                            queue: results,
                            isOnline: networkMonitor.isConnected
                        )
                        downloads.markPlayed(episodeID: episode.id)
                    } label: {
                        AlphonsoRowCard(
                            title: episode.title,
                            subtitle: durationLabel(for: episode),
                            leadingEmoji: "🎧"
                        )
                    }
                    .buttonStyle(.plain)
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .miniPlayerClearance(player)
            .background(ds.surface)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .dsText(.footnote)
            .foregroundStyle(ds.inkSoft)
            .multilineTextAlignment(.center)
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ds.surface)
    }

    private func durationLabel(for episode: PodcastEpisode) -> String {
        PodcastLabel.rowSubtitle(durationSeconds: episode.durationSeconds, resume: false, aiNarrated: episode.aiNarrated)
    }
}

/// Download / delete for one episode. A failure is an alert whose title names the cause.
///
/// Refusal for lack of budget is a prompt, never a silent deletion: it names what could
/// be removed and waits for the learner to choose.
struct PodcastDownloadButton: View {
    let episode: PodcastEpisode
    let downloads: PodcastDownloadManager
    let player: PodcastAudioPlayer

    @Environment(\.alphonsoDS) private var ds
    @State private var failure: PodcastDownloadFailure?
    @State private var showFailure = false

    var body: some View {
        Group {
            switch downloads.state(for: episode.id) {
            case .downloading(let progress):
                ProgressView(value: progress)
                    .progressViewStyle(.circular)
                    .tint(ds.choice)
                    .accessibilityLabel("Downloading")
            case .downloaded:
                Button {
                    deleteRespectingPlayback()
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(ds.right)
                }
                .accessibilityLabel("Downloaded. Tap to remove.")
            case .failed:
                Button { start() } label: {
                    Image(systemName: "exclamationmark.arrow.circlepath")
                        .foregroundStyle(ds.wrongInk)
                }
                .accessibilityLabel("Download failed. Tap to retry.")
            case .notDownloaded:
                Button { start() } label: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(ds.inkSoft)
                }
                .accessibilityLabel("Download for offline")
            }
        }
        .buttonStyle(.plain)
        .alert(
            failure.map(PodcastDownloadCopy.title(for:)) ?? "",
            isPresented: $showFailure,
            presenting: failure
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { failure in
            Text(PodcastDownloadCopy.message(for: failure))
        }
    }

    private func start() {
        Task {
            do {
                try await downloads.download(episode: episode)
            } catch let error as PodcastDownloadFailure {
                failure = error
                showFailure = true
            } catch {
                failure = .network
                showFailure = true
            }
        }
    }

    /// Deleting the file underneath a playing AVPlayer is plausible and
    /// misbehaves quietly, so playback stops first and the learner can see
    /// why. Silently continuing from a deleted file, or stalling with no
    /// explanation, are both worse than a clear stop.
    private func deleteRespectingPlayback() {
        if player.episode?.id == episode.id {
            player.close()
        }
        downloads.delete(episodeID: episode.id)
    }
}

/// The flat downloaded set, shown when there is no network.
///
/// Flat and title-ordered on purpose: folders are a browsing aid for a
/// library you can see all of, and offline you can only see what you
/// downloaded. The banner explains why the shape changed, so the tree's
/// absence reads as a state rather than a fault.
private struct OfflineEpisodeList: View {
    let episodes: [PodcastEpisode]
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        List {
            Section {
                ForEach(episodes) { episode in
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Button {
                            // Only shown offline, and a missing file fails at once
                            // with "Download this episode to listen offline".
                            player.play(
                                episode,
                                localURL: downloads.localURL(episodeID: episode.id),
                                queue: episodes,
                                isOnline: false
                            )
                            downloads.markPlayed(episodeID: episode.id)
                        } label: {
                            AlphonsoRowCard(
                                title: episode.title,
                                subtitle: PodcastLabel.downloadedSubtitle(aiNarrated: episode.aiNarrated),
                                leadingEmoji: "🎧"
                            )
                        }
                        .buttonStyle(.plain)

                        PodcastDownloadButton(
                            episode: episode,
                            downloads: downloads,
                            player: player
                        )
                    }
                }
            } header: {
                Text("Offline — showing your downloads")
                    .dsText(.overline)
                    .foregroundStyle(ds.actionText)
            }
            .listRowBackground(Color.clear)
        }
        .scrollContentBackground(.hidden)
        .miniPlayerClearance(player)
        .background(ds.surface)
    }
}
