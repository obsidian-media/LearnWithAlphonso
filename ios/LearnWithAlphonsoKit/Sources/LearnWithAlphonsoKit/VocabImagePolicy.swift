import Foundation

/// Whether a vocab image slot takes space at all. There is no "blank" case:
/// a slot either shows (placeholder while loading, then the image) or
/// collapses (App Store review fix, 2026-10).
public enum VocabImageSlot: Sendable, Equatable {
    case visible
    case collapsed
}

/// Mirrors src/lib/vocab-images/url-policy.ts. Only self-hosted images in
/// the project's `vocab-images` bucket ever render. A stale bundle carrying a
/// provider URL (an expiring pixabay.com/get link) shows nothing rather than
/// an empty box.
public enum VocabImagePolicy {
    public static let allowedURLPrefix =
        "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/"

    public static func isRenderable(_ url: String) -> Bool {
        url.hasPrefix(allowedURLPrefix) && URL(string: url) != nil
    }

    /// `failedURL` is the URL whose load failed, not a Bool: SwiftUI reuses a
    /// view's @State when ReviewQueueView moves to the next card, and a Bool
    /// would keep collapsing every later image too.
    public static func slot(url: String, failedURL: String?) -> VocabImageSlot {
        guard isRenderable(url), failedURL != url else { return .collapsed }
        return .visible
    }
}
