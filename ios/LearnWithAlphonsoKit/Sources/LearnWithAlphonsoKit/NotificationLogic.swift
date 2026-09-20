import Foundation

/// Pure scheduling logic for local notifications -- same "pure logic
/// separated from I/O" split as SRSEngine.swift/ProgressMath.swift. Neither
/// function here touches UNUserNotificationCenter; NotificationScheduler
/// (app target) is the thin, untested-by-precedent wrapper that calls these
/// and does the actual scheduling.

private let isoDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
}()

/// Matches ProgressMath.swift's date convention: `lastActiveDate` /
/// `dueOn` are UTC-midnight-anchored "yyyy-MM-dd" strings, same as the
/// server. "Today" for the purposes of the streak check (and of
/// dueReviewCount's `today` below) is therefore the UTC calendar date,
/// not the device's local calendar date.
public func utcDateString(_ date: Date) -> String {
    isoDateFormatter.string(from: date)
}

/// nil means "don't schedule a reminder" -- the user already completed a
/// lesson today, so a streak reminder would be noise. Otherwise, the next
/// occurrence of 8pm: later today if `now` is still before 8pm, tomorrow if
/// it's already past. `calendar` defaults to the device's local calendar,
/// since a "remind me tonight" moment is inherently about the user's own
/// clock, unlike the streak's UTC-anchored date comparison above -- but is
/// injectable so tests are deterministic regardless of the machine running
/// them, same reasoning as SRSEngine's injected `addDays`.
public func nextStreakReminderDate(
    lastActiveDate: String?,
    now: Date,
    calendar: Calendar = Calendar.current
) -> Date? {
    if lastActiveDate == utcDateString(now) {
        return nil
    }
    guard let todayAt8pm = calendar.date(
        bySettingHour: 20, minute: 0, second: 0, of: now
    ) else {
        return nil
    }
    if now < todayAt8pm {
        return todayAt8pm
    }
    return calendar.date(byAdding: .day, value: 1, to: todayAt8pm)
}

/// Count of review items due on or before `today` (a "yyyy-MM-dd" string,
/// same UTC convention as above) -- the number the due-review nudge's
/// notification body reports.
public func dueReviewCount(from items: [ReviewItem], today: String) -> Int {
    items.reduce(into: 0) { count, item in
        if item.dueOn <= today {
            count += 1
        }
    }
}

/// V3 package 3b -- "proactive tutor nudges." Copy for the weakness-
/// practice nudge, or `nil` when there's nothing open to nudge about.
/// Names only the single most-open category (callers pass
/// `openCategories` already ordered most-relevant-first, same ordering
/// ProgressSyncClient.fetchWeaknessTrend already returns) to keep the
/// notification short and concrete rather than a generic "you have weak
/// areas" nag.
public func weaknessPracticeNudgeCopy(openCategories: [String]) -> (title: String, body: String)? {
    guard let top = openCategories.first else { return nil }
    let humanized = top.replacingOccurrences(of: "-", with: " ")
    return (
        title: "A quick practice moment",
        body: "You've got a \(humanized) question waiting in your review queue."
    )
}

/// Next occurrence of 10am -- tomorrow if `now` is already at or past
/// 10am today, later today otherwise. A fixed time distinct from the
/// streak reminder's 8pm and the due-review nudge's fixed hours-out, so
/// the notification kinds don't compete for the same moment. Unlike
/// `nextStreakReminderDate`, there's no "already done today" check here:
/// a weakness stays open across days (it's cleared by resolving it in
/// review, not by the passage of a day), so the only signal that matters
/// is whether any category is still open right now.
public func nextWeaknessPracticeNudgeDate(now: Date, calendar: Calendar = .current) -> Date {
    guard let todayAt10am = calendar.date(bySettingHour: 10, minute: 0, second: 0, of: now) else {
        return now
    }
    if now < todayAt10am {
        return todayAt10am
    }
    return calendar.date(byAdding: .day, value: 1, to: todayAt10am) ?? now
}
