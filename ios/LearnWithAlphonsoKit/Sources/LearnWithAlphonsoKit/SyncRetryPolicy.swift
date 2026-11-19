import Foundation

/// Exponential backoff for queued items that failed for a reason waiting can fix (timeout, server trouble, rate
/// limit), never faster than `baseDelay` and never slower than `maxDelay`.
///
/// Both queues are strictly ordered (SyncEngine.sync), so an item that fails forever would hold every item behind
/// it forever: one review answer the server kept answering 5xx stopped every later grade from ever syncing. So a
/// transient failure is retried only up to `maxAttempts` failures, or until the item is `maxAge` old with at
/// least `minAttemptsBeforeAgeOut` failures (`hasExhaustedRetries`). Then:
/// - a review grade is dead-lettered (`exhaustedReason`): the card simply comes back in Review;
/// - a lesson is **parked** (`isParked`): it stays in the queue, holds nothing up, and waits for the learner's
///   "Try again" on the Learn tab (`retryParked`). A finished lesson is never thrown away for being unlucky.
///
/// Having no connection is not a failure and never counts (SyncEngine leaves attemptCount alone for `.offline`).
/// A timeout counts as an attempt but never toward the age rule: a phone on a weak signal for a week times out
/// without the server ever having seen the item.
public struct SyncRetryPolicy: Sendable, Equatable {
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval
    public let maxAttempts: Int
    public let maxAge: TimeInterval
    public let minAttemptsBeforeAgeOut: Int

    public init(
        baseDelay: TimeInterval, maxDelay: TimeInterval,
        maxAttempts: Int = 20, maxAge: TimeInterval = 7 * 24 * 60 * 60, minAttemptsBeforeAgeOut: Int = 3
    ) {
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
        self.maxAttempts = maxAttempts
        self.maxAge = maxAge
        self.minAttemptsBeforeAgeOut = minAttemptsBeforeAgeOut
    }

    public static let standard = SyncRetryPolicy(baseDelay: 30, maxDelay: 6 * 60 * 60)

    /// The dead-letter reason for a review grade whose retries ran out.
    public static let exhaustedReason = "gave-up-after-retries"

    /// `attempt` is the number of failures so far (1 after the first).
    public func delay(afterAttempt attempt: Int) -> TimeInterval {
        min(maxDelay, baseDelay * pow(2, Double(min(max(0, attempt - 1), 30))))
    }

    /// `failures` counts the failure that just happened; `isTimeout` is whether that failure was a timeout.
    public func hasExhaustedRetries(failures: Int, queuedAt: Date, now: Date, isTimeout: Bool = false) -> Bool {
        if failures >= maxAttempts { return true }
        guard !isTimeout else { return false }
        return failures >= minAttemptsBeforeAgeOut && now.timeIntervalSince(queuedAt) >= maxAge
    }

    /// A lesson that ran out of automatic retries. SyncEngine skips it (it holds nothing up) until `retryParked`.
    public func isParked(_ lesson: PendingLessonCompletion) -> Bool {
        lesson.attemptCount >= maxAttempts
    }

    /// The learner's "Try again": one more automatic try, now. Failing transiently again parks it again; it is
    /// never dropped.
    public func retryParked(_ lesson: PendingLessonCompletion) -> PendingLessonCompletion {
        guard isParked(lesson) else { return lesson }
        return PendingLessonCompletion(
            lessonID: lesson.lessonID, total: lesson.total, answers: lesson.answers, course: lesson.course,
            queuedAt: lesson.queuedAt, optimisticXpEstimate: lesson.optimisticXpEstimate, ownerUserID: lesson.ownerUserID,
            sessionToken: lesson.sessionToken, attemptCount: maxAttempts - 1, nextAttemptAt: nil)
    }

    /// A stored retry time as `sync` should read it. Every retry time this policy writes is at most `maxDelay`
    /// after the moment it was written, so one further ahead than `now + maxDelay` was written by a clock that
    /// was wrong (set days ahead, then corrected). It is read as due now: otherwise it held the item, and in an
    /// ordered queue everything behind it, until that date.
    public func clampedNextAttempt(_ nextAttemptAt: Date?, now: Date) -> Date? {
        guard let nextAttemptAt else { return nil }
        return nextAttemptAt > now.addingTimeInterval(maxDelay) ? now : nextAttemptAt
    }
}

/// An item that will never succeed, with a stable reason for the dead-letter store.
public struct DeadLetter<Item: Sendable & Equatable>: Sendable, Equatable {
    public let item: Item
    public let reason: String
    public init(item: Item, reason: String) { self.item = item; self.reason = reason }
}
