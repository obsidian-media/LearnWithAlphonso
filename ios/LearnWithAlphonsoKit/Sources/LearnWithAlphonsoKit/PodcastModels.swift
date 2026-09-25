import Foundation

/// Podcast library models, Phase 1b (see docs/superpowers/specs/
/// 2026-09-24-podcast-phase1b-ios-design.md).
///
/// Mirrors the web app's `PodcastFolder` in src/lib/podcast-tree.ts and
/// `PodcastEpisode` in src/lib/podcast.functions.ts. Ported rather than
/// shared -- this repo has no TS/Swift sharing mechanism, same as the
/// SRS/hearts/progress-math ports.
public struct PodcastFolder: Sendable, Equatable, Identifiable {
    public let id: String
    public let parentID: String?
    public let slug: String
    public let title: String
    public let description: String?
    public let sortOrder: Int

    public init(
        id: String,
        parentID: String?,
        slug: String,
        title: String,
        description: String?,
        sortOrder: Int
    ) {
        self.id = id
        self.parentID = parentID
        self.slug = slug
        self.title = title
        self.description = description
        self.sortOrder = sortOrder
    }
}

public struct PodcastEpisode: Sendable, Equatable, Identifiable {
    public let id: String
    public let folderID: String
    public let slug: String
    public let title: String
    public let description: String?
    public let audioURL: URL
    public let durationSeconds: Int
    /// Already clamped by PodcastPlayback.clampPosition when it came off
    /// the wire -- see PodcastClient.fetchEpisodes.
    public let positionSeconds: Int
    /// The `updated_at` of this user's playback row when it was read, or
    /// nil when no row exists yet.
    ///
    /// Carried so a later write can use optimistic concurrency: the client
    /// sends this value back and the write is rejected if the stored one
    /// has moved on. That is what distinguishes a *stale* device's flush
    /// from a deliberate rewind -- guarding on position magnitude would
    /// reject the rewind, and guarding on now() would accept the stale
    /// write, since now() is evaluated when the write lands.
    public let playbackUpdatedAt: String?

    public init(
        id: String,
        folderID: String,
        slug: String,
        title: String,
        description: String?,
        audioURL: URL,
        durationSeconds: Int,
        positionSeconds: Int,
        playbackUpdatedAt: String?
    ) {
        self.id = id
        self.folderID = folderID
        self.slug = slug
        self.title = title
        self.description = description
        self.audioURL = audioURL
        self.durationSeconds = durationSeconds
        self.positionSeconds = positionSeconds
        self.playbackUpdatedAt = playbackUpdatedAt
    }
}
