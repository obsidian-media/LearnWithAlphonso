import Foundation

/// The podcast feature's SessionLifecycle handlers.
/// - Sign-out and account deletion: stop playback and clear Now Playing, so the next
///   account on the device neither hears nor sees the previous one's episode.
/// - Account deletion only: remove downloaded audio and its records.
public enum PodcastAccountCleanup {
    public enum HandlerID {
        public static let playback = "podcast.playback"
        public static let downloads = "podcast.downloads"
    }

    @MainActor
    public static func register(
        on lifecycle: SessionLifecycle,
        stopPlayback: @escaping @MainActor () -> Void,
        removeDownloads: @escaping @MainActor () -> Void
    ) {
        lifecycle.register(HandlerID.playback) { _ in stopPlayback() }
        lifecycle.register(HandlerID.downloads) { event in
            if event == .accountDeleted { removeDownloads() }
        }
    }
}
