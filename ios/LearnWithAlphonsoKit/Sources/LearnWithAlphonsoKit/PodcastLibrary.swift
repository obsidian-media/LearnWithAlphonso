import Foundation

/// What Listen shows for the active course.
///
/// Root folders carry a course; a root with no course is shown to every course. Within
/// the course, a folder is shown only if at least one published episode sits somewhere
/// beneath it, so unpublishing never leaves an empty folder to tap into.
public enum PodcastLibrary {
    public static func visibleFolders(
        _ folders: [PodcastFolder],
        publishedFolderIDs: Set<String>,
        courseCode: String
    ) -> [PodcastFolder] {
        let childrenByParent = Dictionary(grouping: folders, by: { $0.parentID })
        var nonEmpty = Set<String>()

        func hasContent(_ folder: PodcastFolder, depth: Int) -> Bool {
            // Roots have nil parents, and cycle members never do, so a cycle is unreachable
            // from here; the depth bound is belt-and-braces.
            guard depth < 64 else { return false }
            var found = publishedFolderIDs.contains(folder.id)
            for child in childrenByParent[folder.id] ?? [] where hasContent(child, depth: depth + 1) {
                found = true
            }
            if found { nonEmpty.insert(folder.id) }
            return found
        }

        let rootKey: String? = nil
        for root in childrenByParent[rootKey] ?? [] where root.course == nil || root.course == courseCode {
            _ = hasContent(root, depth: 0)
        }
        return folders.filter { nonEmpty.contains($0.id) }
    }

    public static func episodes(_ episodes: [PodcastEpisode], inFolders folders: [PodcastFolder]) -> [PodcastEpisode] {
        let visible = Set(folders.map(\.id))
        return episodes.filter { visible.contains($0.folderID) }
    }

    /// Whether a successful read may be used to remove downloads of unpublished episodes.
    /// A read that returns no folders at all is a role or policy problem (the library is
    /// never genuinely folder-less), so it says nothing about what is published.
    public static func canPruneDownloads(afterLoading folders: [PodcastFolder]) -> Bool {
        !folders.isEmpty
    }

    public static func unpublishedDownloads(
        entries: [PodcastCacheEntry],
        publishedEpisodeIDs: Set<String>,
        keeping playingEpisodeID: String?
    ) -> [String] {
        entries
            .map(\.episodeID)
            .filter { !publishedEpisodeIDs.contains($0) && $0 != playingEpisodeID }
    }
}

public enum PodcastLibraryCopy {
    public static let emptyMessage = "New episodes appear here as they're published."

    public static func emptyTitle(courseCode: String) -> String {
        switch courseCode {
        case "en": return "No English episodes yet"
        case "fr": return "No French episodes yet"
        case "es": return "No Spanish episodes yet"
        default: return "No episodes yet"
        }
    }
}
