import Foundation

/// Runs at most one `operation` at a time: a caller arriving while one is in flight awaits that same run and gets
/// its result, instead of starting a second one.
///
/// Session's token refresh goes through this. Supabase rotates refresh tokens, so two overlapping refreshes send
/// the same refresh token twice; the second is rejected as already used, and a rejected refresh signs the learner
/// out. Several screens ask for a fresh token at once on foreground (sync, the header, a voice screen), which is
/// exactly when that happened.
@MainActor
public final class SingleFlight<Value: Sendable> {
    private var inFlight: Task<Value, Never>?

    public init() {}

    public var isRunning: Bool { inFlight != nil }

    public func run(_ operation: @escaping @MainActor () async -> Value) async -> Value {
        if let inFlight { return await inFlight.value }
        let task = Task { @MainActor [weak self] () -> Value in
            let value = await operation()
            // Cleared inside the task, before any awaiter resumes, so a caller that resumes and asks again starts
            // a new run rather than reading this finished one.
            self?.inFlight = nil
            return value
        }
        inFlight = task
        return await task.value
    }
}
