import Foundation

/// What this device last stored for each episode it has played in this launch.
///
/// The episode list is a snapshot taken when a folder opens. Playing an episode, closing the player and
/// tapping the same row again used to start from that stale snapshot: the row said nothing about resuming,
/// playback began from the old position, and the next save guarded on an `updated_at` this device had
/// already moved past. Applying the last stored position (and its `updated_at`) to the episode before it
/// plays fixes all three. A snapshot read later than the stored value, e.g. after another device listened,
/// still wins.
public struct PodcastSavedPositions: Equatable, Sendable {
    private struct Entry: Equatable, Sendable {
        let position: Int
        let updatedAt: String?
    }

    private var entries: [String: Entry] = [:]

    public init() {}

    public mutating func record(episodeID: String, position: Int, updatedAt: String?) {
        entries[episodeID] = Entry(position: max(0, position), updatedAt: updatedAt)
    }

    /// Sign-out or account deletion: another account must never inherit these positions.
    public mutating func reset() {
        entries = [:]
    }

    public func applying(to episode: PodcastEpisode) -> PodcastEpisode {
        guard let entry = entries[episode.id], let stored = entry.updatedAt else { return episode }
        if let snapshot = episode.playbackUpdatedAt, snapshot > stored { return episode }
        return PodcastEpisode(
            id: episode.id, folderID: episode.folderID, slug: episode.slug, title: episode.title,
            description: episode.description, audioURL: episode.audioURL,
            durationSeconds: episode.durationSeconds, positionSeconds: entry.position,
            playbackUpdatedAt: stored)
    }
}
