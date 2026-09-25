import Foundation

/// Folder-tree logic for the podcast library.
///
/// **Port of `src/lib/podcast-tree.ts`; its tests are
/// `src/lib/podcast-tree.test.ts`, and `PodcastTreeTests` here is written
/// from the same cases.** Nothing enforces that the two stay in step, so
/// the cross-reference is how drift becomes visible in review.
///
/// The editorial shape the account owner publishes (Course -> Level ->
/// Series) is a convention for filling the tree, not a constraint in the
/// schema, so everything here handles arbitrary depth.
public enum PodcastTree {
    /// Lowercase kebab-case: safe in a URL path and a storage object key.
    ///
    /// Spelled out rather than written as a regex literal, which this
    /// package's language mode does not accept. Equivalent to the web
    /// side's `/^[a-z0-9]+(-[a-z0-9]+)*$/`: one or more lowercase
    /// alphanumeric groups joined by single hyphens, no leading, trailing
    /// or doubled hyphen.
    public static func isValidSlug(_ slug: String) -> Bool {
        guard !slug.isEmpty else { return false }
        let groups = slug.split(separator: "-", omittingEmptySubsequences: false)
        guard groups.allSatisfy({ !$0.isEmpty }) else { return false }
        return groups.allSatisfy { group in
            group.allSatisfy { character in
                character.isASCII && (character.isLowercase || character.isNumber)
            }
        }
    }

    /// Direct children of `parentID` (pass nil for the roots), ordered the
    /// way the web app orders them: sortOrder, then slug as a tiebreak.
    ///
    /// A folder whose parent is absent from `folders` is simply not
    /// returned by any call -- it is dropped, never promoted to a root.
    /// Surfacing an orphan at top level would misrepresent the tree. That
    /// also bounds a cyclic tree: cycle members all have non-nil parents,
    /// so they never appear among the roots and browsing cannot loop.
    public static func children(of parentID: String?, in folders: [PodcastFolder]) -> [PodcastFolder] {
        folders
            .filter { $0.parentID == parentID }
            .sorted { left, right in
                left.sortOrder == right.sortOrder
                    ? left.slug < right.slug
                    : left.sortOrder < right.sortOrder
            }
    }

    /// Walks a slug path one level at a time.
    ///
    /// Matching on (parentID, slug) rather than slug alone matters: the
    /// same slug can legitimately live under different parents, and a
    /// global lookup would resolve "en/cafe" to a "cafe" folder sitting
    /// somewhere else entirely.
    public static func resolve(path: [String], in folders: [PodcastFolder]) -> PodcastFolder? {
        var parentID: String?
        var current: PodcastFolder?
        for segment in path {
            guard let match = folders.first(where: { $0.parentID == parentID && $0.slug == segment }) else {
                return nil
            }
            current = match
            parentID = match.id
        }
        return current
    }

    /// The ids involved in the first cycle found, or nil if acyclic.
    public static func findCycle(in folders: [PodcastFolder]) -> [String]? {
        let parentOf = Dictionary(uniqueKeysWithValues: folders.map { ($0.id, $0.parentID) })
        for folder in folders {
            var seen: [String] = []
            var cursor: String? = folder.id
            while let id = cursor {
                if let start = seen.firstIndex(of: id) {
                    return Array(seen[start...])
                }
                seen.append(id)
                cursor = parentOf[id] ?? nil
            }
        }
        return nil
    }
}
