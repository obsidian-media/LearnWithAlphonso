import Foundation

/// Exponential backoff for queued items that failed for a reason waiting can fix (offline, timeout, server
/// trouble, rate limit). They retry forever, never faster than `baseDelay` and never slower than `maxDelay`, and
/// are never dead-lettered: only a permanent rejection (see LessonCompletionError.shouldQueue) leaves the queue.
public struct SyncRetryPolicy: Sendable, Equatable {
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval

    public init(baseDelay: TimeInterval, maxDelay: TimeInterval) {
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
    }

    public static let standard = SyncRetryPolicy(baseDelay: 30, maxDelay: 6 * 60 * 60)

    /// `attempt` is the number of failures so far (1 after the first).
    public func delay(afterAttempt attempt: Int) -> TimeInterval {
        min(maxDelay, baseDelay * pow(2, Double(min(max(0, attempt - 1), 30))))
    }
}

/// An item that will never succeed, with a stable reason for the dead-letter store.
public struct DeadLetter<Item: Sendable & Equatable>: Sendable, Equatable {
    public let item: Item
    public let reason: String
    public init(item: Item, reason: String) { self.item = item; self.reason = reason }
}
