import Foundation
import SwiftData
import LearnWithAlphonsoKit

/// One downloaded episode's bookkeeping, persisted alongside the offline
/// sync queue in the same SwiftData container (a second store would be a
/// second thing to migrate).
@Model
final class PodcastDownloadRecord {
    @Attribute(.unique) var episodeID: String
    var bytes: Int
    var etag: String?
    var storedDurationSeconds: Int
    var lastPlayed: Date?
    var downloadedAt: Date

    init(
        episodeID: String,
        bytes: Int,
        etag: String?,
        storedDurationSeconds: Int,
        lastPlayed: Date? = nil,
        downloadedAt: Date = Date()
    ) {
        self.episodeID = episodeID
        self.bytes = bytes
        self.etag = etag
        self.storedDurationSeconds = storedDurationSeconds
        self.lastPlayed = lastPlayed
        self.downloadedAt = downloadedAt
    }

    var asCacheEntry: PodcastCacheEntry {
        PodcastCacheEntry(
            episodeID: episodeID,
            bytes: bytes,
            etag: etag,
            storedDurationSeconds: storedDurationSeconds,
            lastPlayed: lastPlayed
        )
    }
}

/// What a refused download reports back.
enum PodcastDownloadRefusal: Error {
    /// The download would exceed the budget. Carries what could be removed
    /// to make room -- the learner chooses; nothing is deleted here.
    case budgetExceeded(candidates: [PodcastCacheEntry], neededBytes: Int)
    case noURL
    case transferFailed(String)
}

/// Downloads episode audio for offline playback.
///
/// Deliberately thin: every decision -- whether a download fits, what to
/// offer removing, whether a cached copy is stale, where a file goes --
/// lives in `PodcastCache`/`PodcastCacheBudget` in the Kit, because
/// `ios-swift-tests` covers the Kit and nothing covers this file.
/// `ios-app-build` proves it compiles and no more.
///
/// If a rule is being decided here rather than delegated, it is in the
/// wrong target.
@Observable
@MainActor
final class PodcastDownloadManager {
    /// Injected rather than read from `PodcastCacheBudget.defaultBytes`
    /// directly, so a caller (and, when the app target ever becomes
    /// testable, a test) can set a budget small enough that the refusal
    /// path actually runs. At 500 MB against a 1.3 MB library it never
    /// would.
    let budgetBytes: Int

    private let modelContext: ModelContext
    private(set) var states: [String: PodcastDownloadState] = [:]

    init(modelContext: ModelContext, budgetBytes: Int = PodcastCacheBudget.defaultBytes) {
        self.modelContext = modelContext
        self.budgetBytes = budgetBytes
        reconcile()
    }

    // MARK: - Locations

    /// Application Support, not Caches: the system may purge Caches under
    /// pressure, and a download someone deliberately asked for should not
    /// evaporate.
    private static func directory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = base.appendingPathComponent("podcast-audio", isDirectory: true)
        if !FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        // Downloaded audio is re-downloadable content. iOS expects it
        // excluded from iCloud backup and Apple has rejected apps for
        // including it -- an App Store review-visible property, like
        // UIBackgroundModes.
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var mutable = directory
        try? mutable.setResourceValues(resourceValues)
        return directory
    }

    /// The local file for an episode, or nil when it is not downloaded.
    func localURL(episodeID: String) -> URL? {
        guard let directory = try? Self.directory() else { return nil }
        let url = directory.appendingPathComponent(PodcastCache.fileName(episodeID: episodeID))
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: - Reading state

    func entries() -> [PodcastCacheEntry] {
        records().map(\.asCacheEntry)
    }

    func state(for episodeID: String) -> PodcastDownloadState {
        states[episodeID] ?? (localURL(episodeID: episodeID) != nil
            ? .downloaded(bytes: record(for: episodeID)?.bytes ?? 0)
            : .notDownloaded)
    }

    func usedBytes() -> Int {
        PodcastCacheBudget.usedBytes(entries())
    }

    private func records() -> [PodcastDownloadRecord] {
        (try? modelContext.fetch(FetchDescriptor<PodcastDownloadRecord>())) ?? []
    }

    private func record(for episodeID: String) -> PodcastDownloadRecord? {
        records().first { $0.episodeID == episodeID }
    }

    // MARK: - Downloading

    /// Downloads an episode for offline playback.
    ///
    /// Refuses rather than deleting when the budget is reached, carrying
    /// what could be removed. Nothing is ever deleted without the learner
    /// asking.
    func download(episode: PodcastEpisode) async throws {
        let existing = entries()
        // The size is not known until the response arrives, so the budget
        // is checked against the catalogue's own duration-derived estimate
        // first and re-checked against the real byte count below. The
        // second check is the one that decides.
        let estimate = estimatedBytes(for: episode)
        if !PodcastCacheBudget.canAdd(bytes: estimate, to: existing, budget: budgetBytes) {
            throw PodcastDownloadRefusal.budgetExceeded(
                candidates: PodcastCacheBudget.deletionCandidates(
                    in: existing, needing: estimate, budget: budgetBytes
                ),
                neededBytes: estimate
            )
        }

        states[episode.id] = .downloading(progress: 0)
        do {
            let (temporaryURL, response) = try await URLSession.shared.download(from: episode.audioURL)
            let http = response as? HTTPURLResponse
            let servedBytes = http?.expectedContentLengthOrNil
            let etag = http?.value(forHTTPHeaderField: "ETag")

            let directory = try Self.directory()
            let staging = directory.appendingPathComponent(
                PodcastCache.temporaryFileName(episodeID: episode.id)
            )
            let final = directory.appendingPathComponent(PodcastCache.fileName(episodeID: episode.id))

            try? FileManager.default.removeItem(at: staging)
            try FileManager.default.moveItem(at: temporaryURL, to: staging)

            let actualBytes = (try? FileManager.default.attributesOfItem(atPath: staging.path)[.size] as? Int) ?? nil
            if let expected = servedBytes, let actual = actualBytes, expected != actual {
                // URLSession hands back a file only on success, so this is
                // belt-and-braces rather than the last line of defence --
                // it costs one comparison against a header the server
                // already sends, and covers damage after the task
                // completed but before the move.
                try? FileManager.default.removeItem(at: staging)
                throw PodcastDownloadRefusal.transferFailed("incomplete download")
            }

            let bytes = actualBytes ?? 0
            // Re-check against the REAL size: the estimate above was a
            // guess, and a download that actually would not fit must not
            // land just because the guess was generous.
            if !PodcastCacheBudget.canAdd(bytes: bytes, to: existing, budget: budgetBytes) {
                try? FileManager.default.removeItem(at: staging)
                throw PodcastDownloadRefusal.budgetExceeded(
                    candidates: PodcastCacheBudget.deletionCandidates(
                        in: existing, needing: bytes, budget: budgetBytes
                    ),
                    neededBytes: bytes
                )
            }

            // Atomic move last: a file exists at the final path only when
            // it is complete and accounted for.
            try? FileManager.default.removeItem(at: final)
            try FileManager.default.moveItem(at: staging, to: final)

            // Record written only AFTER the move succeeds. A row pointing
            // at no file is worse than no row.
            modelContext.insert(
                PodcastDownloadRecord(
                    episodeID: episode.id,
                    bytes: bytes,
                    etag: etag,
                    storedDurationSeconds: episode.durationSeconds
                )
            )
            try? modelContext.save()
            states[episode.id] = .downloaded(bytes: bytes)
        } catch let refusal as PodcastDownloadRefusal {
            states[episode.id] = .notDownloaded
            throw refusal
        } catch {
            states[episode.id] = .failed(reason: error.localizedDescription)
            throw PodcastDownloadRefusal.transferFailed(error.localizedDescription)
        }
    }

    /// A rough size from the catalogue's duration, used only for the
    /// pre-flight budget check. Episodes are mono ~64 kbps, so 8 KB per
    /// second is close enough to catch an obviously-too-large download
    /// before spending the bytes.
    private func estimatedBytes(for episode: PodcastEpisode) -> Int {
        max(episode.durationSeconds, 1) * 8_000
    }

    // MARK: - Deleting

    func delete(episodeID: String) {
        if let directory = try? Self.directory() {
            try? FileManager.default.removeItem(
                at: directory.appendingPathComponent(PodcastCache.fileName(episodeID: episodeID))
            )
        }
        if let record = record(for: episodeID) {
            modelContext.delete(record)
            try? modelContext.save()
        }
        states[episodeID] = .notDownloaded
    }

    func markPlayed(episodeID: String) {
        guard let record = record(for: episodeID) else { return }
        record.lastPlayed = Date()
        try? modelContext.save()
    }

    // MARK: - Reconciliation

    /// Drops rows whose file is gone and files with no row.
    ///
    /// Being killed mid-download is a normal event on iOS, not an
    /// exception, so the two can disagree and neither side is authoritative
    /// on its own. A `.partial` file is always deleted: it is by definition
    /// an interrupted transfer.
    private func reconcile() {
        guard let directory = try? Self.directory() else { return }

        var known = Set<String>()
        for record in records() {
            let url = directory.appendingPathComponent(
                PodcastCache.fileName(episodeID: record.episodeID)
            )
            if FileManager.default.fileExists(atPath: url.path) {
                known.insert(url.lastPathComponent)
            } else {
                modelContext.delete(record)
            }
        }

        let contents = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        for name in contents where !known.contains(name) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
        try? modelContext.save()
    }
}

private extension HTTPURLResponse {
    /// `expectedContentLength` is -1 when the server does not say. Treating
    /// that as a real size would compare every download against -1.
    var expectedContentLengthOrNil: Int? {
        expectedContentLength >= 0 ? Int(expectedContentLength) : nil
    }
}
