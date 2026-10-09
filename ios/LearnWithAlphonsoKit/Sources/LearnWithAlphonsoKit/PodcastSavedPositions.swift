import Foundation

/// What this device last stored for each episode it has played in this launch.
///
/// The episode list is a snapshot taken when a folder opens. Playing an episode, closing the player and
/// tapping the same row again used to start from that stale snapshot: the row said nothing about resuming,
/// playback began from the old position, and the next save guarded on an `updated_at` this device had
/// already moved past. Applying the last stored position (and its `updated_at`) to the episode before it
/// plays fixes all three.
///
/// `updated_at` is written by whichever device saved, from that device's clock, so stamps are compared by
/// identity, never by order. The stored position replaces a snapshot only when the snapshot's stamp is one
/// this device has seen or stored itself (it is the stale copy of our own history). A stamp this device has
/// never seen came from somewhere else, for example another device, and that snapshot wins.
public struct PodcastSavedPositions: Equatable, Sendable {
    private struct Entry: Equatable, Sendable {
        var position: Int
        var updatedAt: String
        var known: Set<String>
    }

    private var entries: [String: Entry] = [:]
    /// Snapshot stamps seen at play time, kept until a save creates the entry they belong to.
    private var seenBeforeSave: [String: Set<String>] = [:]

    public init() {}

    /// A save completed: remember the position and the stamp the server stored.
    public mutating func record(episodeID: String, position: Int, updatedAt: String?) {
        guard let updatedAt else { return }
        var known = entries[episodeID]?.known ?? seenBeforeSave[episodeID] ?? []
        known.insert(updatedAt)
        entries[episodeID] = Entry(position: max(0, position), updatedAt: updatedAt, known: known)
        seenBeforeSave[episodeID] = nil
    }

    /// Playback started from this snapshot, so its stamp is part of this device's own history.
    public mutating func noteSeen(_ episode: PodcastEpisode) {
        guard let stamp = episode.playbackUpdatedAt else { return }
        if entries[episode.id] != nil {
            entries[episode.id]?.known.insert(stamp)
        } else {
            seenBeforeSave[episode.id, default: []].insert(stamp)
        }
    }

    /// Sign-out or account deletion: another account must never inherit these positions.
    public mutating func reset() {
        entries = [:]
        seenBeforeSave = [:]
    }

    public func applying(to episode: PodcastEpisode) -> PodcastEpisode {
        guard let entry = entries[episode.id] else { return episode }
        if let snapshot = episode.playbackUpdatedAt, !entry.known.contains(snapshot) { return episode }
        return PodcastEpisode(
            id: episode.id, folderID: episode.folderID, slug: episode.slug, title: episode.title,
            description: episode.description, audioURL: episode.audioURL,
            durationSeconds: episode.durationSeconds, positionSeconds: entry.position,
            playbackUpdatedAt: entry.updatedAt)
    }
}
