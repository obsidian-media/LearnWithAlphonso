import Foundation

/// One row of `listen_progress`, as the client reads it.
public struct ListenProgress: Sendable, Equatable {
    public let episodeID: String
    public let positionS: Int
    public let completedAt: String?
    /// ISO-8601 from the server; same-format strings sort chronologically.
    public let updatedAt: String

    public init(episodeID: String, positionS: Int, completedAt: String?, updatedAt: String) {
        self.episodeID = episodeID
        self.positionS = positionS
        self.completedAt = completedAt
        self.updatedAt = updatedAt
    }
}

public enum ListenEpisodeState: Sendable, Equatable {
    case new, inProgress, done
}

/// A folder that directly holds episodes, with what the Listen shelf draws for it.
public struct ListenShelfFolder: Sendable, Equatable {
    public let folder: PodcastFolder
    public let level: String?
    public let room: String
    public let episodes: [PodcastEpisode]
    public let doneCount: Int
    /// Whole percent heard; a finished folder is exactly 100.
    public let percent: Int
    public let totalSeconds: Int
}

/// Pure logic behind the Listen shelf. Mirrors src/lib/listen-library.ts (web) and ListenShelf.kt (Android).
public enum ListenShelf {
    public static let rooms = ["library", "kitchen", "market", "seaside", "station",
                               "garden", "classroom", "bank", "coffee", "radio"]

    public static func state(_ p: ListenProgress?) -> ListenEpisodeState {
        guard let p else { return .new }
        if p.completedAt != nil { return .done }
        return p.positionS > 0 ? .inProgress : .new
    }

    /// 0...1 heard; a finished episode is 1 whatever its last position says.
    public static func fraction(_ e: PodcastEpisode, _ p: ListenProgress?) -> Double {
        guard let p else { return 0 }
        if p.completedAt != nil { return 1 }
        guard e.durationSeconds > 0 else { return 0 }
        return min(1, max(0, Double(p.positionS) / Double(e.durationSeconds)))
    }

    public static func secondsLeft(_ e: PodcastEpisode, _ p: ListenProgress?) -> Int {
        guard let p, p.completedAt == nil else { return e.durationSeconds }
        return max(0, e.durationSeconds - p.positionS)
    }

    /// 370 -> "6:10".
    public static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    /// 12000 -> "3 h 20 m"; 2400 -> "40 m".
    public static func hoursMinutes(_ seconds: Int) -> String {
        let m = max(0, seconds) / 60
        return m >= 60 ? "\(m / 60) h \(m % 60) m" : "\(m) m"
    }

    /// Capped below int4 so "the very end" reaches the database's own clamp instead of overflowing it.
    public static func wirePosition(_ seconds: Int) -> Int { min(max(seconds, 0), 2_000_000_000) }

    private static func isLevel(_ text: String) -> Bool {
        let lower = text.lowercased()
        return lower.count == 2 && "abc".contains(lower.first!) && "12".contains(lower.last!)
    }

    /// The CEFR level named by any segment of the folder's path (slug or title), or nil.
    public static func level(of folderID: String, in folders: [PodcastFolder]) -> String? {
        let byID = Dictionary(folders.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var current = byID[folderID]
        var depth = 0
        while let folder = current, depth < 64 {
            for candidate in [folder.slug, folder.title.trimmingCharacters(in: .whitespaces)]
            where isLevel(candidate) {
                return candidate.uppercased()
            }
            current = folder.parentID.flatMap { byID[$0] }
            depth += 1
        }
        return nil
    }

    private static let keywords: [(String, String)] = [
        ("book|librar|read|stor", "library"), ("kitchen|cook|food|recipe", "kitchen"),
        ("market|shop|buy", "market"), ("sea|beach|travel|holiday", "seaside"),
        ("station|train|transport", "station"), ("garden|nature|farm", "garden"),
        ("class|school|study", "classroom"), ("bank|money|post", "bank"),
        ("cafe|café|coffee|chat", "coffee"),
    ]

    /// A folder's room: by subject when the name says, otherwise a stable pick from its slug.
    public static func room(for folder: PodcastFolder) -> String {
        for (pattern, room) in keywords {
            for text in [folder.slug, folder.title]
            where text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil {
                return room
            }
        }
        var h: UInt32 = 0
        for scalar in folder.slug.unicodeScalars { h = h &* 31 &+ scalar.value }
        return rooms[Int(h) % rooms.count]
    }

    public static func course(of folderID: String, in folders: [PodcastFolder]) -> String? {
        let byID = Dictionary(folders.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var current = byID[folderID]
        var depth = 0
        while let folder = current, depth < 64 {
            if folder.parentID == nil { return folder.course }
            current = folder.parentID.flatMap { byID[$0] }
            depth += 1
        }
        return nil
    }

    /// One shelf per folder that directly holds episodes of `course`; empty folders are not shelves.
    public static func shelves(
        folders: [PodcastFolder],
        episodes: [PodcastEpisode],
        progress: [ListenProgress],
        course: String
    ) -> [ListenShelfFolder] {
        let prog = Dictionary(progress.map { ($0.episodeID, $0) }, uniquingKeysWith: { a, _ in a })
        var byFolder: [String: [PodcastEpisode]] = [:]
        for e in episodes where (e.course ?? Self.course(of: e.folderID, in: folders)) == course {
            byFolder[e.folderID, default: []].append(e)
        }
        var out: [ListenShelfFolder] = []
        for folder in folders {
            guard let eps = byFolder[folder.id], !eps.isEmpty else { continue }
            let done = eps.filter { state(prog[$0.id]) == .done }.count
            let total = eps.reduce(0.0) { $0 + fraction($1, prog[$1.id]) }
            out.append(ListenShelfFolder(
                folder: folder,
                level: level(of: folder.id, in: folders),
                room: room(for: folder),
                episodes: eps,
                doneCount: done,
                percent: done == eps.count ? 100 : Int((total / Double(eps.count) * 100).rounded(.down)),
                totalSeconds: eps.reduce(0) { $0 + $1.durationSeconds }
            ))
        }
        return out.enumerated()
            .sorted { a, b in
                a.element.folder.sortOrder != b.element.folder.sortOrder
                    ? a.element.folder.sortOrder < b.element.folder.sortOrder : a.offset < b.offset
            }
            .map(\.element)
    }

    /// Levels that actually have a shelf, A1 first.
    public static func levels(_ shelves: [ListenShelfFolder]) -> [String] {
        Array(Set(shelves.compactMap(\.level))).sorted()
    }

    public struct ContinueTarget: Sendable, Equatable {
        public let shelf: ListenShelfFolder
        public let episode: PodcastEpisode
        public let progress: ListenProgress?
    }

    /// The most recently touched part-way episode; failing that the first unheard episode of the shelf last
    /// touched. Nil when the learner has never listened (the card is then not drawn).
    public static func continueListening(
        _ shelves: [ListenShelfFolder],
        progress: [ListenProgress]
    ) -> ContinueTarget? {
        let prog = Dictionary(progress.map { ($0.episodeID, $0) }, uniquingKeysWith: { a, _ in a })
        let touched = shelves
            .flatMap { shelf in shelf.episodes.map { (shelf, $0) } }
            .compactMap { pair in prog[pair.1.id].map { (pair.0, pair.1, $0) } }
            .sorted { $0.2.updatedAt > $1.2.updatedAt }
        if let partial = touched.first(where: { state($0.2) == .inProgress }) {
            return ContinueTarget(shelf: partial.0, episode: partial.1, progress: partial.2)
        }
        guard let last = touched.first,
              let next = last.0.episodes.first(where: { state(prog[$0.id]) == .new })
        else { return nil }
        return ContinueTarget(shelf: last.0, episode: next, progress: nil)
    }
}
