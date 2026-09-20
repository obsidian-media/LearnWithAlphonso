import Foundation
import LearnWithAlphonsoKit

/// Caches the last-seen global-weekly leaderboard snapshot, so the next
/// fetch can diff against it via `wasOvertaken` (docs/v2-kickoffs/
/// 03-leaderboards.md's "Deepened feature 1", Option A: local polling,
/// not real push). Scoped to a single fixed (global, weekly) board rather
/// than whatever scope/period the user currently has picked in
/// LeaderboardView -- overtake detection runs independently of the
/// picker's own live selection.
enum LeaderboardSnapshotCache {
    private static let key = "lastGlobalWeeklyLeaderboardSnapshot"

    static var lastSnapshot: [LeaderboardSnapshotEntry]? {
        get {
            guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
            return try? JSONDecoder().decode([LeaderboardSnapshotEntry].self, from: data)
        }
        set {
            guard let newValue, let data = try? JSONEncoder().encode(newValue) else {
                UserDefaults.standard.removeObject(forKey: key)
                return
            }
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
