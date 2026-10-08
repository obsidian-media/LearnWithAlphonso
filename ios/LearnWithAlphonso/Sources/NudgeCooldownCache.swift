import Foundation
import LearnWithAlphonsoKit

/// A soft, client-side cooldown on nudging the same friend again -- fast,
/// no round trip needed to grey out the button. As of
/// 20260930070000_nudge_push_rate_limit.sql the SAME 24h window is also
/// enforced server-side, in the push trigger itself (found missing in a
/// 2026-09-29 audit, once a nudge started firing a real push instead of
/// just an in-app banner) -- this cache is the fast path, not the only
/// backstop anymore.
enum NudgeCooldownCache {
    private static let key = AccountCacheKeys.nudgeCooldowns
    private static let cooldown: TimeInterval = 24 * 60 * 60

    static func canNudge(friendID: String, now: Date = Date()) -> Bool {
        guard let lastNudgedAt = timestamps[friendID] else { return true }
        return now.timeIntervalSince(lastNudgedAt) >= cooldown
    }

    static func recordNudge(friendID: String, at date: Date = Date()) {
        var current = timestamps
        current[friendID] = date
        save(current)
    }

    private static var timestamps: [String: Date] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let raw = try? JSONDecoder().decode([String: Double].self, from: data) else {
            return [:]
        }
        return raw.mapValues { Date(timeIntervalSince1970: $0) }
    }

    private static func save(_ dict: [String: Date]) {
        let raw = dict.mapValues(\.timeIntervalSince1970)
        guard let data = try? JSONEncoder().encode(raw) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
