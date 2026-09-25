import Foundation

/// Download state for one episode, as the UI sees it.
public enum PodcastDownloadState: Sendable, Equatable {
    case notDownloaded
    case downloading(progress: Double)
    case downloaded(bytes: Int)
    case failed(reason: String)
}

/// One cached episode's bookkeeping.
///
/// There is deliberately no "explicit download" flag: automatic
/// downloading is out of scope, so every download is explicit and the flag
/// would partition nothing. The spec's first draft had one, along with a
/// policy that never evicted such downloads -- which made the policy
/// unreachable.
public struct PodcastCacheEntry: Sendable, Equatable {
    public let episodeID: String
    public let bytes: Int
    /// The object's `ETag` as served when it was downloaded.
    ///
    /// Supabase serves an ETag that **is the MD5 of the content** (probed
    /// 2026-09-25 against the live object: the header matched the hash of
    /// the downloaded bytes exactly, and was stable across requests through
    /// Cloudflare). Content-derived means it changes when the content
    /// changes, which is what makes republish detection possible without a
    /// server-side marker -- and therefore without a migration.
    public let etag: String?
    /// `duration_seconds` from the catalogue at download time, kept so a
    /// cached file can be checked against what the catalogue claims.
    public let storedDurationSeconds: Int
    public let lastPlayed: Date?

    public init(
        episodeID: String,
        bytes: Int,
        etag: String?,
        storedDurationSeconds: Int,
        lastPlayed: Date?
    ) {
        self.episodeID = episodeID
        self.bytes = bytes
        self.etag = etag
        self.storedDurationSeconds = storedDurationSeconds
        self.lastPlayed = lastPlayed
    }
}

/// Paths, staleness and the offline listing.
///
/// Everything here is pure. That is not tidiness: `ios-swift-tests` is the
/// only automated coverage this feature can have, since `ios-app-build`
/// compiles the app target without running anything, so logic that lives
/// in the app target is logic nobody can check until a device says so.
public enum PodcastCache {
    /// Characters allowed in a cache filename. An episode id is a UUID in
    /// practice, but it arrives from the server, and treating server data
    /// as a path component without checking is how a `../` escapes the
    /// cache directory.
    private static let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")

    private static func sanitise(_ episodeID: String) -> String {
        let cleaned = episodeID.lowercased().unicodeScalars
            .map { allowed.contains($0) ? Character($0) : "_" }
        let joined = String(cleaned)
        // Non-empty even if every character was replaced, so two hostile
        // ids cannot collapse onto the same name by being equally empty.
        return joined.isEmpty ? "episode" : joined
    }

    public static func fileName(episodeID: String) -> String {
        "\(sanitise(episodeID)).mp3"
    }

    /// Where a download is written before it is complete.
    ///
    /// A distinct name from `fileName` so a file at the final path always
    /// means a finished download -- the one rule that keeps a half-file
    /// from playing as a shortened episode.
    public static func temporaryFileName(episodeID: String) -> String {
        "\(sanitise(episodeID)).partial"
    }

    /// Whether a cached copy has been superseded on the server.
    ///
    /// Returns false when nothing is known: offline there is nothing to
    /// compare against, and a slightly old episode beats no episode. Never
    /// discard a download on ignorance.
    public static func isStale(
        entry: PodcastCacheEntry,
        servedETag: String?,
        servedBytes: Int?
    ) -> Bool {
        if let cached = entry.etag, let served = servedETag {
            return normalisedETag(cached) != normalisedETag(served)
        }
        if let served = servedBytes {
            return served != entry.bytes
        }
        return false
    }

    /// Strips weak-validator syntax and quotes, so `W/"abc"` and `"abc"`
    /// compare equal -- a CDN may serve either for the same object.
    private static func normalisedETag(_ tag: String) -> String {
        var value = tag
        if value.hasPrefix("W/") { value.removeFirst(2) }
        return value.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
    }

    /// Whether a cached file's real duration contradicts the catalogue.
    ///
    /// The signature of both a truncated download and a republished
    /// episode. A non-finite or zero duration means AVFoundation has not
    /// loaded the asset yet, which is not a disagreement -- treating it as
    /// one would re-download at random.
    public static func durationDisagrees(cachedSeconds: Double, storedSeconds: Int) -> Bool {
        guard cachedSeconds.isFinite, cachedSeconds > 0 else { return false }
        return abs(cachedSeconds - Double(storedSeconds)) > 1
    }

    /// The episodes to show when there is no network: the downloaded set,
    /// flat and ordered by title.
    ///
    /// Flat on purpose. Listen is a folder tree, but folders are a browsing
    /// aid for a library you can see all of, and offline you can only see
    /// what you downloaded. An entry with no matching episode is dropped:
    /// a cache entry can outlive its row.
    public static func offlineListing(
        entries: [PodcastCacheEntry],
        episodes: [PodcastEpisode]
    ) -> [PodcastEpisode] {
        let downloaded = Set(entries.map(\.episodeID))
        return episodes
            .filter { downloaded.contains($0.id) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }
}

/// The cache budget, and what to *offer* removing when a download will not
/// fit.
///
/// Nothing here deletes anything. The spec's first policy evicted
/// automatically while exempting explicit downloads -- and with automatic
/// downloading out of scope, every download is explicit, so the policy
/// could never run. This replaces it: the app refuses and offers, and the
/// learner chooses.
public enum PodcastCacheBudget {
    /// Default budget. Roughly 170 episodes at 3 MB.
    ///
    /// Deliberately not exercisable at the library's real size, which is
    /// why every function here takes the budget as a parameter rather than
    /// reading this: a test can pass 2 MB and actually reach the refusal
    /// path. A default nothing can trip is a guard that never executes.
    public static let defaultBytes = 500_000_000

    public static func usedBytes(_ entries: [PodcastCacheEntry]) -> Int {
        entries.reduce(0) { $0 + $1.bytes }
    }

    public static func canAdd(bytes: Int, to entries: [PodcastCacheEntry], budget: Int) -> Bool {
        usedBytes(entries) + bytes <= budget
    }

    /// Entries to offer for deletion so `needing` bytes would fit, least
    /// recently played first.
    ///
    /// Empty when the download already fits. When even emptying the cache
    /// would not be enough, returns everything rather than a short list:
    /// the caller needs to know that deleting will not help, not a
    /// suggestion that implies it would.
    public static func deletionCandidates(
        in entries: [PodcastCacheEntry],
        needing bytes: Int,
        budget: Int
    ) -> [PodcastCacheEntry] {
        guard !canAdd(bytes: bytes, to: entries, budget: budget) else { return [] }

        // Never played sorts before played, then oldest play first: the
        // episode someone keeps returning to is the last to propose.
        let ranked = entries.sorted { left, right in
            switch (left.lastPlayed, right.lastPlayed) {
            case (nil, nil): return left.episodeID < right.episodeID
            case (nil, _): return true
            case (_, nil): return false
            case let (lhs?, rhs?): return lhs < rhs
            }
        }

        var chosen: [PodcastCacheEntry] = []
        var remaining = entries
        for candidate in ranked {
            chosen.append(candidate)
            remaining.removeAll { $0.episodeID == candidate.episodeID }
            if canAdd(bytes: bytes, to: remaining, budget: budget) { break }
        }
        return chosen
    }
}
