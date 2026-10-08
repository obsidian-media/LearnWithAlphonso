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

    /// Bumped by removeAllDownloads(). A transfer that started before an account deletion
    /// checks it before landing, so it cannot write a file or row afterwards.
    private var cleanupGeneration = 0

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
    /// A transfer becomes a download only if it is HTTP 200, `audio/*`, and the length the
    /// server declared (Supabase answers a missing object with 400 + JSON, which used to be
    /// saved as the episode). The body goes to a `.partial` file and is moved over the final
    /// name atomically; every failure path deletes what it wrote. Every failure is a
    /// `PodcastDownloadFailure`, whose title names the cause. Nothing is ever deleted
    /// without the learner asking.
    func download(episode: PodcastEpisode) async throws {
        let existing = entries()
        // The size is not known until the response arrives, so the budget is checked
        // against the catalogue's duration-derived estimate first and re-checked against the
        // real byte count below. The second check is the one that decides.
        let estimate = estimatedBytes(for: episode)
        if !PodcastCacheBudget.canAdd(bytes: estimate, to: existing, budget: budgetBytes) {
            throw PodcastDownloadFailure.budgetExceeded(
                candidates: PodcastCacheBudget.deletionCandidates(in: existing, needing: estimate, budget: budgetBytes),
                neededBytes: estimate
            )
        }

        let generation = cleanupGeneration
        states[episode.id] = .downloading(progress: 0)
        // Whatever is listed here when the function returns is deleted: the URLSession temp
        // file, then the staging file. A successful landing empties the list.
        var leftovers: [URL] = []
        defer { for url in leftovers { try? FileManager.default.removeItem(at: url) } }

        do {
            let directory = try Self.directory()
            let staging = directory.appendingPathComponent(PodcastCache.temporaryFileName(episodeID: episode.id))
            let final = directory.appendingPathComponent(PodcastCache.fileName(episodeID: episode.id))

            let (temporaryURL, response) = try await URLSession.shared.download(from: episode.audioURL)
            leftovers.append(temporaryURL)
            guard let http = response as? HTTPURLResponse else { throw PodcastDownloadFailure.network }
            if let failure = PodcastDownloadValidation.checkResponse(
                statusCode: http.statusCode,
                contentType: http.value(forHTTPHeaderField: "Content-Type")
            ) {
                throw failure
            }

            try? FileManager.default.removeItem(at: staging)
            try FileManager.default.moveItem(at: temporaryURL, to: staging)
            leftovers = [staging]

            let bytes = try Self.fileSize(at: staging)
            if let failure = PodcastDownloadValidation.checkBody(
                expectedLength: http.expectedContentLengthOrNil,
                actualBytes: bytes,
                durationSeconds: episode.durationSeconds
            ) {
                throw failure
            }
            // Re-check against the REAL size: the estimate was a guess.
            if !PodcastCacheBudget.canAdd(bytes: bytes, to: existing, budget: budgetBytes) {
                throw PodcastDownloadFailure.budgetExceeded(
                    candidates: PodcastCacheBudget.deletionCandidates(in: existing, needing: bytes, budget: budgetBytes),
                    neededBytes: bytes
                )
            }
            // The account was deleted while this was in flight: land nothing.
            guard generation == cleanupGeneration else {
                states[episode.id] = .notDownloaded
                return
            }

            // Atomic: the final name is either the old complete file or the new one, never
            // a half-written file.
            if FileManager.default.fileExists(atPath: final.path) {
                _ = try FileManager.default.replaceItemAt(final, withItemAt: staging)
            } else {
                try FileManager.default.moveItem(at: staging, to: final)
            }
            leftovers = []

            // Row only after the file landed. If the row cannot be saved, remove the file
            // too: a file with no row is an orphan reconcile() would delete anyway.
            modelContext.insert(PodcastDownloadRecord(
                episodeID: episode.id,
                bytes: bytes,
                etag: http.value(forHTTPHeaderField: "ETag"),
                storedDurationSeconds: episode.durationSeconds
            ))
            do {
                try modelContext.save()
            } catch {
                try? FileManager.default.removeItem(at: final)
                throw error
            }
            states[episode.id] = .downloaded(bytes: bytes)
        } catch let failure as PodcastDownloadFailure {
            if case .budgetExceeded = failure {
                states[episode.id] = .notDownloaded
            } else {
                states[episode.id] = .failed(reason: PodcastDownloadCopy.title(for: failure))
            }
            throw failure
        } catch {
            let failure = PodcastDownloadValidation.classify(PodcastErrorCode.chain(from: error))
            states[episode.id] = .failed(reason: PodcastDownloadCopy.title(for: failure))
            throw failure
        }
    }

    /// The file's size through `URLResourceValues.fileSize`, not FileManager's attribute
    /// dictionary. That call is on Apple's File Timestamp required-reason list (it returns
    /// dates whichever key is read) and was this app's only use of that category;
    /// `fileSizeKey` is not on the list.
    private static func fileSize(at url: URL) throws -> Int {
        try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
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

    /// Account deletion (SessionLifecycle `.accountDeleted`, PodcastAccountCleanup). Removes
    /// every downloaded file and row. Sign-out keeps downloads: the audio is public
    /// learning content, not account data.
    func removeAllDownloads() {
        cleanupGeneration += 1
        if let directory = try? Self.directory() {
            try? FileManager.default.removeItem(at: directory)
        }
        for record in records() {
            modelContext.delete(record)
        }
        do {
            try modelContext.save()
        } catch {
            print("[PodcastDownloadManager] removeAllDownloads save failed: \(error)")
        }
        states = [:]
    }

    /// Licensing: an episode that has been unpublished must not keep playing from a
    /// download. Called only after a SUCCESSFUL published-index read; a failed read says
    /// nothing about what is published. The episode playing now is kept until it changes.
    func removeDownloads(notIn publishedEpisodeIDs: Set<String>, keeping playingEpisodeID: String?) {
        for episodeID in PodcastLibrary.unpublishedDownloads(
            entries: entries(),
            publishedEpisodeIDs: publishedEpisodeIDs,
            keeping: playingEpisodeID
        ) {
            delete(episodeID: episodeID)
        }
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
