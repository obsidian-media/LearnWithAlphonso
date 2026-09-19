import Foundation

/// Tracks the user's league tier across lesson completions, purely as a
/// local signal for whether the *next* completion is a promotion --
/// LessonPlayerView has no other way to know "what tier were they in
/// before this attempt" (see docs/v2-kickoffs/06-achievements-and-leagues.md's
/// "deepened" feature -- verify that doc is still the source if revisiting
/// this). Not a source of truth for anything else; the server's own
/// `progress.leagueTier` on each completion response is that.
enum LeagueTierCache {
    private static let key = "lastKnownLeagueTier"

    static var lastKnownTier: String? {
        get { UserDefaults.standard.string(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
