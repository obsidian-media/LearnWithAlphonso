import Foundation

/// What the device does locally around a lesson completion that goes into the offline queue instead of
/// reaching the server.
public enum QueuedLessonPolicy {
    /// A finished lesson goes to the server live only when this account has nothing older still queued.
    /// `complete-lesson` books the day it is told about as `max(last_active_date, day)`, so a live completion
    /// that overtakes an older queued one moves last_active_date past it, and the older day is then lost for
    /// the streak. The player drains the queue first and queues behind whatever is still waiting.
    public static func mustQueueBehindPending(pendingLessons: Int) -> Bool {
        pendingLessons > 0
    }

    /// The finish screen's headline for a queued lesson. When the queue could not be written to disk (the
    /// store opened in memory, or the save failed) the usual "Saved" would be a lie: the lesson exists only
    /// until the app closes.
    public static func finishMessage(reason: LessonCompletionError, isDurable: Bool) -> String {
        isDurable ? reason.userMessage : notDurableMessage
    }

    /// The headline when a lesson was finished online but queued behind older lessons still waiting to sync.
    public static let queuedBehindMessage = "Saved. It will sync right after your earlier lessons."

    /// The save-failure screen when the session ended before the lesson could be sent, but the attempt was
    /// kept in the queue for this account. Signing back in sends it; nothing is cleared on the way.
    public static let keptForSignInMessage =
        "You've been signed out, so this lesson couldn't be sent yet. It's kept on this iPhone and will sync when you sign in again."

    public static let notDurableMessage =
        "This lesson couldn't be stored on your iPhone. Keep the app open and reconnect to the internet, or it will be lost."

    /// The cached progress as it will most likely read once the queued lesson syncs: studied today, so the
    /// header, the widget and the 8 pm streak reminder agree with what the learner just did. Only the day and
    /// the streak move; XP waits for the server (the queued estimate is an upper bound, not a value). The next
    /// real sync overwrites all of it.
    public static func optimisticProgress(
        after cached: LessonCompletionProgress, now: Date, timeZone: TimeZone = .current
    ) -> LessonCompletionProgress {
        let today = localDateString(now, timeZone: timeZone)
        let yesterday = localDateString(previousLocalDay(before: now, timeZone: timeZone), timeZone: timeZone)
        let streak: Int
        if cached.lastActiveDate >= today {
            streak = max(cached.streak, 1)
        } else if cached.lastActiveDate == yesterday {
            streak = cached.streak + 1
        } else {
            // A gap: the server may still save it with a freeze, but 1 is the honest guess until it answers.
            streak = 1
        }
        let lastActive = max(cached.lastActiveDate, today)
        return LessonCompletionProgress(
            xp: cached.xp, streak: streak, longestStreak: max(cached.longestStreak, streak),
            lastActiveDate: lastActive, hearts: cached.hearts, heartsRefillAt: cached.heartsRefillAt,
            streakFreezes: cached.streakFreezes, leagueTier: cached.leagueTier)
    }

    /// A progress row read from the server while this account still has lessons queued has not seen them yet.
    /// Writing it over the cache as is would undo the optimistic "studied today" above, and the widget and the
    /// reminder with it. So while lessons wait, a local day newer than the server's keeps its day and streak;
    /// everything else (XP, hearts, freezes, league) is the server's.
    public static func merge(
        fetched: LessonCompletionProgress, local: LessonCompletionProgress?, hasPendingLessons: Bool
    ) -> LessonCompletionProgress {
        guard hasPendingLessons, let local, local.lastActiveDate > fetched.lastActiveDate else { return fetched }
        return LessonCompletionProgress(
            xp: fetched.xp, streak: local.streak, longestStreak: max(fetched.longestStreak, local.longestStreak),
            lastActiveDate: local.lastActiveDate, hearts: fetched.hearts, heartsRefillAt: fetched.heartsRefillAt,
            streakFreezes: fetched.streakFreezes, leagueTier: fetched.leagueTier)
    }
}

/// The streak as it should read right now. The `streak` column is only rewritten when the learner next studies,
/// so after a missed day it still holds the old run: the header and widget showed "12" to a learner whose
/// streak had already ended. A last active day older than yesterday (local) means the run is over.
public enum StreakDisplay {
    public static func visibleStreak(
        streak: Int, lastActiveDate: String?, now: Date, timeZone: TimeZone = .current
    ) -> Int {
        guard let lastActiveDate else { return streak }
        let yesterday = localDateString(previousLocalDay(before: now, timeZone: timeZone), timeZone: timeZone)
        return lastActiveDate >= yesterday ? streak : 0
    }
}

/// Noon of the previous local calendar day: safe across DST changes, unlike `now - 86_400`.
func previousLocalDay(before date: Date, timeZone: TimeZone) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: date) ?? date
    return calendar.date(byAdding: .day, value: -1, to: noon) ?? date.addingTimeInterval(-24 * 60 * 60)
}
