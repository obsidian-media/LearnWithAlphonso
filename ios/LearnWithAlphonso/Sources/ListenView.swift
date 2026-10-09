import SwiftUI
import LearnWithAlphonsoKit

/// Listen: browse the podcast folder tree and play an episode.
///
/// This view owns the `NavigationStack`, and `PodcastFolderListing` below deliberately
/// does **not**. Nesting gives two navigation bars and unreliable inner links, which
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

    private var visibleFolders: [PodcastFolder] {
        PodcastLibrary.visibleFolders(
            folders,
            publishedFolderIDs: Set(publishedIndex.map(\.folderID)),
            courseCode: courseCode
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
            .background(AlphonsoColor.surface)
            .navigationTitle("Listen")
            .searchable(text: $searchQuery, prompt: "Search episodes")
        }
        .tint(AlphonsoColor.moss)
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
                .tint(AlphonsoColor.moss)
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
                ContentUnavailableView {
                    Label("You're offline", systemImage: "wifi.slash")
                } description: {
                    Text("Download episodes while you have a connection and they'll play here.")
                } actions: {
                    Button("Try again") { Task { await load() } }
                        .tint(AlphonsoColor.moss)
                }
            } else {
                OfflineEpisodeList(episodes: offline, player: player, downloads: downloads)
            }
        } else if let errorMessage {
            ContentUnavailableView {
                Label("Couldn't load episodes", systemImage: "exclamationmark.triangle")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Try again") { Task { await load() } }
                    .tint(AlphonsoColor.moss)
            }
        } else if visibleFolders.isEmpty {
            // A course with nothing published is a stated state, not a blank list.
            ContentUnavailableView {
                Label(PodcastLibraryCopy.emptyTitle(courseCode: courseCode), systemImage: "headphones")
            } description: {
                Text(PodcastLibraryCopy.emptyMessage)
            } actions: {
                Button("Refresh") { Task { await load() } }
                    .tint(AlphonsoColor.moss)
            }
        } else {
            PodcastFolderListing(
                folder: nil,
                folders: visibleFolders,
                session: session,
                player: player,
                downloads: downloads,
                networkMonitor: networkMonitor,
                onEpisodesLoaded: rememberEpisodes
            )
        }
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

/// One level of the tree: child folders, then this folder's episodes.
///
/// Owns no `NavigationStack` -- see ListenView's doc comment.
private struct PodcastFolderListing: View {
    /// nil at the root.
    let folder: PodcastFolder?
    /// Already filtered to the visible set by ListenView.
    let folders: [PodcastFolder]
    let session: Session
    let player: PodcastAudioPlayer
    let downloads: PodcastDownloadManager
    let networkMonitor: NetworkMonitor
    let onEpisodesLoaded: ([PodcastEpisode]) -> Void

    @State private var episodes: [PodcastEpisode] = []
    @State private var isLoadingEpisodes = false
    @State private var loadFailed = false

    private var children: [PodcastFolder] {
        PodcastTree.children(of: folder?.id, in: folders)
    }

    var body: some View {
        List {
            if !children.isEmpty {
                Section {
                    ForEach(children) { child in
                        NavigationLink {
                            PodcastFolderListing(
                                folder: child,
                                folders: folders,
                                session: session,
                                player: player,
                                downloads: downloads,
                                networkMonitor: networkMonitor,
                                onEpisodesLoaded: onEpisodesLoaded
                            )
                        } label: {
                            AlphonsoRowCard(
                                title: child.title,
                                subtitle: child.description ?? "Browse episodes",
                                leadingEmoji: "📁"
                            )
                        }
                    }
                }
                .listRowBackground(Color.clear)
            }

            if !episodes.isEmpty {
                Section {
                    ForEach(episodes) { episode in
                        HStack(spacing: AlphonsoSpacing.sm) {
                            Button {
                                player.play(
                                    episode,
                                    localURL: downloads.localURL(episodeID: episode.id),
                                    queue: episodes,
                                    isOnline: networkMonitor.isConnected
                                )
                                downloads.markPlayed(episodeID: episode.id)
                            } label: {
                                AlphonsoRowCard(
                                    title: episode.title,
                                    subtitle: subtitle(for: episode),
                                    accent: episode.positionSeconds > 0
                                        ? AlphonsoColor.ember
                                        : AlphonsoColor.moss
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
                }
                .listRowBackground(Color.clear)
            }

            if loadFailed {
                // A failed fetch is not "Nothing here yet".
                VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                    Text(networkMonitor.isConnected
                        ? "Couldn't load these episodes."
                        : "You're offline. Downloaded episodes appear on the Listen screen.")
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                    Button("Try again") { Task { await loadEpisodes() } }
                        .tint(AlphonsoColor.moss)
                }
                .listRowBackground(Color.clear)
            } else if children.isEmpty && episodes.isEmpty && !isLoadingEpisodes {
                // Expected, not an error: the tree gets built before it is filled.
                Text("Nothing here yet. New episodes appear as they're published.")
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle(folder?.title ?? "Listen")
        .task(id: folder?.id) { await loadEpisodes() }
    }

    private func subtitle(for episode: PodcastEpisode) -> String {
        let minutes = episode.durationSeconds / 60
        let seconds = episode.durationSeconds % 60
        let length = String(format: "%d:%02d", minutes, seconds)
        return episode.positionSeconds > 0 ? "\(length) · Resume" : length
    }

    private func loadEpisodes() async {
        // The root has no episodes of its own: episodes belong to a folder.
        guard let folder, let client = makePodcastClient(session: session) else { return }
        isLoadingEpisodes = true
        loadFailed = false
        do {
            episodes = try await client.fetchEpisodes(folderID: folder.id)
            onEpisodesLoaded(episodes)
        } catch {
            if !Task.isCancelled { loadFailed = true }
        }
        isLoadingEpisodes = false
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
            .background(AlphonsoColor.surface)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(AlphonsoFont.sans(14))
            .foregroundStyle(AlphonsoColor.inkSoft)
            .multilineTextAlignment(.center)
            .padding(.horizontal, AlphonsoSpacing.md)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AlphonsoColor.surface)
    }

    private func durationLabel(for episode: PodcastEpisode) -> String {
        let minutes = episode.durationSeconds / 60
        let seconds = episode.durationSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

/// Download / delete for one episode. A failure is an alert whose title names the cause.
///
/// Refusal for lack of budget is a prompt, never a silent deletion: it names what could
/// be removed and waits for the learner to choose.
private struct PodcastDownloadButton: View {
    let episode: PodcastEpisode
    let downloads: PodcastDownloadManager
    let player: PodcastAudioPlayer

    @State private var failure: PodcastDownloadFailure?
    @State private var showFailure = false

    var body: some View {
        Group {
            switch downloads.state(for: episode.id) {
            case .downloading(let progress):
                ProgressView(value: progress)
                    .progressViewStyle(.circular)
                    .tint(AlphonsoColor.moss)
                    .accessibilityLabel("Downloading")
            case .downloaded:
                Button {
                    deleteRespectingPlayback()
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(AlphonsoColor.moss)
                }
                .accessibilityLabel("Downloaded. Tap to remove.")
            case .failed:
                Button { start() } label: {
                    Image(systemName: "exclamationmark.arrow.circlepath")
                        .foregroundStyle(AlphonsoColor.destructive)
                }
                .accessibilityLabel("Download failed. Tap to retry.")
            case .notDownloaded:
                Button { start() } label: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(AlphonsoColor.inkSoft)
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

    var body: some View {
        List {
            Section {
                ForEach(episodes) { episode in
                    HStack(spacing: AlphonsoSpacing.sm) {
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
                                subtitle: "Downloaded",
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
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(Color.clear)
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
    }
}
