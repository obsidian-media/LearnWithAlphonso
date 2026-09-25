import SwiftUI
import LearnWithAlphonsoKit

/// Listen: browse the podcast folder tree and play an episode.
///
/// This view owns the `NavigationStack`, and `PodcastFolderView` below
/// deliberately does **not**. Phase 0 had to make the Profile hub present
/// rather than push because League, Friends and Achievements each owned a
/// stack; nesting gives two navigation bars and unreliable inner links,
/// which compiles cleanly and is wrong on a screen. Here the child is new
/// code, so the constraint costs nothing.
///
/// Online-only in this phase. Everything else on iOS works on a plane --
/// lessons, review, completions -- and podcasts will not until Phase 3
/// adds download. A subway is exactly where people listen, so the offline
/// state says so plainly instead of blaming the episode.
struct ListenView: View {
    let session: Session
    let networkMonitor: NetworkMonitor
    let player: PodcastAudioPlayer

    @State private var folders: [PodcastFolder] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            content
                .background(AlphonsoColor.surface)
                .navigationTitle("Listen")
        }
        .tint(AlphonsoColor.moss)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading {
            ProgressView("Loading episodes…")
                .tint(AlphonsoColor.moss)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !networkMonitor.isConnected && folders.isEmpty {
            ContentUnavailableView {
                Label("You're offline", systemImage: "wifi.slash")
            } description: {
                Text("Listening needs a connection for now. Downloads are coming.")
            } actions: {
                Button("Try again") { Task { await load() } }
                    .tint(AlphonsoColor.moss)
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
        } else {
            PodcastFolderListing(
                folder: nil,
                folders: folders,
                session: session,
                player: player
            )
        }
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
            folders = try await client.fetchFolders()
        } catch PodcastClientError.unauthorized {
            errorMessage = "Please sign in again to load episodes."
        } catch {
            errorMessage = networkMonitor.isConnected
                ? "Something went wrong loading the library."
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
    let folders: [PodcastFolder]
    let session: Session
    let player: PodcastAudioPlayer

    @State private var episodes: [PodcastEpisode] = []
    @State private var isLoadingEpisodes = false

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
                                player: player
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
                        Button {
                            player.play(episode)
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
                    }
                }
                .listRowBackground(Color.clear)
            }

            if children.isEmpty && episodes.isEmpty && !isLoadingEpisodes {
                // Expected, not an error: the tree gets built before it is
                // filled.
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
        episodes = (try? await client.fetchEpisodes(folderID: folder.id)) ?? []
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
