import Foundation

/// Exponential backoff for queued items. One flaky item no longer retries on every foreground, and an item
/// that has failed `maxAttempts` times is moved out of the queue (dead-lettered).
public struct SyncRetryPolicy: Sendable, Equatable {
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval
    public let maxAttempts: Int

    public init(baseDelay: TimeInterval, maxDelay: TimeInterval, maxAttempts: Int) {
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
        self.maxAttempts = maxAttempts
    }

    public static let standard = SyncRetryPolicy(baseDelay: 30, maxDelay: 6 * 60 * 60, maxAttempts: 8)

    public func delay(afterAttempt attempt: Int) -> TimeInterval {
        min(maxDelay, baseDelay * pow(2, Double(max(0, attempt - 1))))
    }
}

/// An item that will never succeed, with a stable reason for the dead-letter store.
public struct DeadLetter<Item: Sendable & Equatable>: Sendable, Equatable {
    public let item: Item
    public let reason: String
    public init(item: Item, reason: String) { self.item = item; self.reason = reason }
}
