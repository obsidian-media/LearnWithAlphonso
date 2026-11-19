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

    /// The cached progress as it will read once the queued lesson syncs: studied today, with the streak and the
    /// freezes the server's own step gives (StreakRule: +1 the next day, +1 and one freeze spent after one missed
    /// day, the one-time UTC bridge, a restart after that). The header, the widget and the 8 pm reminder then agree
    /// with what the learner just did. XP waits for the server (the queued estimate is an upper bound, not a value).
    /// The next real sync overwrites all of it.
    public static func optimisticProgress(
        after cached: LessonCompletionProgress, now: Date, timeZone: TimeZone = .current
    ) -> LessonCompletionProgress {
        let today = localDateString(now, timeZone: timeZone)
        let outcome = StreakRule.next(
            streak: cached.streak, longestStreak: cached.longestStreak, lastActiveDate: cached.lastActiveDate,
            today: today, freezes: cached.streakFreezes, dayBasis: cached.dayBasis)
        return LessonCompletionProgress(
            xp: cached.xp, streak: outcome.streak, longestStreak: outcome.longestStreak,
            lastActiveDate: max(cached.lastActiveDate, today), hearts: cached.hearts, heartsRefillAt: cached.heartsRefillAt,
            // A completion always leaves the account on local days.
            streakFreezes: outcome.freezes, leagueTier: cached.leagueTier, dayBasis: "local")
    }

    /// Progress from the server (a fetch, or an older queued lesson that just synced) while this account still
    /// has lessons queued has not seen those yet. Writing it over the cache as is would undo the optimistic
    /// "studied today" above, and the widget and the reminder with it. So while lessons wait, a local day newer than
    /// the server's keeps its day, streak and freezes; everything else (XP, hearts, league) is the server's.
    public static func merge(
        fetched: LessonCompletionProgress, local: LessonCompletionProgress?, hasPendingLessons: Bool
    ) -> LessonCompletionProgress {
        guard hasPendingLessons, let local, local.lastActiveDate > fetched.lastActiveDate else { return fetched }
        return LessonCompletionProgress(
            xp: fetched.xp, streak: local.streak, longestStreak: max(fetched.longestStreak, local.longestStreak),
            lastActiveDate: local.lastActiveDate, hearts: fetched.hearts, heartsRefillAt: fetched.heartsRefillAt,
            streakFreezes: local.streakFreezes, leagueTier: fetched.leagueTier, dayBasis: local.dayBasis ?? fetched.dayBasis)
    }

    /// The queued lessons of `userID` that a live finish must wait behind: every one not parked (a parked lesson
    /// ran out of retries and waits for the learner's "Try again", so it holds nothing up). Unowned rows count.
    public static func blockingLessons(
        _ lessons: [PendingLessonCompletion], userID: String, policy: SyncRetryPolicy = .standard
    ) -> Int {
        lessons.filter { ($0.ownerUserID == nil || $0.ownerUserID == userID) && !policy.isParked($0) }.count
    }

    /// The finish screen when the server refused the token while the learner is still signed in: the attempt is
    /// queued and the next sync refreshes the session, so there is nothing to sign in to.
    public static let authRetryMessage = "Saved. We couldn't confirm your sign-in just now, so it will sync automatically."

    /// The Learn-tab line for lessons that ran out of automatic retries (SyncRetryPolicy.isParked). They stay on
    /// this iPhone; "Try again" sends them once more.
    public static func parkedMessage(count: Int) -> String? {
        guard count > 0 else { return nil }
        return count == 1
            ? "1 lesson hasn't synced after many tries. It's still saved on this iPhone."
            : "\(count) lessons haven't synced after many tries. They're still saved on this iPhone."
    }

    public static let retryTitle = "Try again"
}
