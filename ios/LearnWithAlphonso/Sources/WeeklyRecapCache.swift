import Foundation

/// Tracks the league tier as of the last time the weekly recap was viewed,
/// so the *next* viewing can say whether the user moved up since then --
/// distinct from LeagueTierCache.lastKnownTier, which updates on every
/// lesson completion, not just once a week. See docs/v2-kickoffs/
/// 03-leaderboards.md's "Deepened feature 2": "A local UserDefaults/
/// small-file cache of 'league tier as of last recap' is sufficient --
/// don't over-engineer this into a database concern."
enum WeeklyRecapCache {
    private static let key = "lastRecapLeagueTier"

    static var lastRecapLeagueTier: String? {
        get { UserDefaults.standard.string(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
