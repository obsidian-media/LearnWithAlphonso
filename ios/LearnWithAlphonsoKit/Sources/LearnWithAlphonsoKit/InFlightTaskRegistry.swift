import Foundation

/// Coalesces concurrent requests with the same key onto one asynchronous operation.
/// All callers observe the same success or failure; a later call can retry after failure.
public actor InFlightTaskRegistry<Key: Hashable & Sendable> {
    private var tasks: [Key: Task<Void, Error>] = [:]

    public init() {}

    public func run(
        key: Key,
        operation: @escaping @Sendable () async throws -> Void
    ) async throws {
        if let task = tasks[key] {
            try await task.value
            return
        }

        let task = Task { try await operation() }
        tasks[key] = task
        do {
            try await task.value
            tasks[key] = nil
        } catch {
            tasks[key] = nil
            throw error
        }
    }
}
