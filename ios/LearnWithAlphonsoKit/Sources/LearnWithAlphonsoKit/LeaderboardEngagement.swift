import Foundation

/// A minimal, locally-cacheable snapshot of one leaderboard row -- just
/// enough to detect a rank change between two fetches. Codable so the app
/// target can persist the last-known snapshot (UserDefaults or similar)
/// between launches.
public struct LeaderboardSnapshotEntry: Sendable, Equatable, Codable {
    public let userID: String
    public let xp: Int

    public init(userID: String, xp: Int) {
        self.userID = userID
        self.xp = xp
    }
}

/// Approximates a "you've been overtaken" event by diffing two leaderboard
/// snapshots (docs/v2-kickoffs/03-leaderboards.md's "Deepened feature 1",
/// Option A) -- **not** a true push: this only ever runs while the app is
/// foregrounded and re-fetches, so it structurally cannot catch someone
/// passing the user while the app is closed. True for anyone who was
/// ranked below `me` in `previous` and is now ranked above `me` in
/// `current`; someone new to `current` (not present in `previous` at all)
/// doesn't count -- there's no earlier state to say they were "below" the
/// user in a comparable sense.
public func wasOvertaken(previous: [LeaderboardSnapshotEntry], current: [LeaderboardSnapshotEntry], me: String) -> Bool {
    guard let myPreviousRank = previous.firstIndex(where: { $0.userID == me }),
          let myCurrentRank = current.firstIndex(where: { $0.userID == me }) else {
        return false
    }
    for (currentRank, entry) in current.enumerated() where entry.userID != me && currentRank < myCurrentRank {
        if let previousRank = previous.firstIndex(where: { $0.userID == entry.userID }), previousRank > myPreviousRank {
            return true
        }
    }
    return false
}

/// The next occurrence of Monday at `hour` local time -- when the weekly
/// recap notification (docs/v2-kickoffs/03-leaderboards.md's "Deepened
/// feature 2") should fire, shortly after `get_leaderboard`'s own weekly
/// period resets (ISO week, Monday start). If `now` is already Monday
/// past `hour`, returns *next* week's Monday, not today -- this is always
/// rescheduled after each fire (or on next app launch after a fire date
/// has passed), so a user who first opens the app mid-week simply waits
/// until the next real reset rather than getting an immediate "catch-up"
/// recap for a partial week.
public func nextWeeklyRecapDate(now: Date, hour: Int = 9, calendar: Calendar = Calendar.current) -> Date {
    var cal = calendar
    cal.firstWeekday = 2 // Monday, matching ISO week / get_leaderboard's `wk`
    let nowWeekday = cal.component(.weekday, from: now)
    let isMonday = nowWeekday == 2
    let todayAtHour = cal.date(bySettingHour: hour, minute: 0, second: 0, of: now) ?? now

    if isMonday && now < todayAtHour {
        return todayAtHour
    }

    let daysUntilNextMonday = isMonday ? 7 : (2 - nowWeekday + 7) % 7
    let nextMonday = cal.date(byAdding: .day, value: daysUntilNextMonday, to: now) ?? now
    return cal.date(bySettingHour: hour, minute: 0, second: 0, of: nextMonday) ?? nextMonday
}
