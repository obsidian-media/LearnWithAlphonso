import Foundation

/// A soft, client-side-only cooldown on nudging the same friend again --
/// see supabase/migrations/20260920020000_nudges.sql's comment for why
/// this is deliberately not a server-enforced rate limit for this V2
/// slice.
enum NudgeCooldownCache {
    private static let key = "nudgeCooldowns"
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
