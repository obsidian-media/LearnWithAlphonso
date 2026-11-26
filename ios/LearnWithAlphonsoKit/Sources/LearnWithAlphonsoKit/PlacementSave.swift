import Foundation

/// Saving a placement result, awaited. The results screen used to fire the save and drop the error (`try?` in a
/// detached Task): when the call failed the screen still said "Your level: B1" while the server stayed at A1, and the
/// learner never found out. The save is now tried a bounded number of times and the caller learns whether it landed,
/// so the screen can say "couldn't save, try again". Mirrors src/lib/placement-save.ts.
public enum PlacementSave {
    /// Tries in all, the first included.
    public static let attempts = 3
    /// Waits before the second and third tries, in seconds.
    public static let delays: [TimeInterval] = [0.6, 1.8]

    /// True when one of the tries succeeded; false after the last one failed. A cancelled task stops at once.
    public static func run(
        attempts: Int = PlacementSave.attempts,
        delays: [TimeInterval] = PlacementSave.delays,
        sleep: (TimeInterval) async -> Void = { try? await Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) },
        operation: () async throws -> Void
    ) async -> Bool {
        let total = max(1, attempts)
        for attempt in 0..<total {
            if Task.isCancelled { return false }
            do {
                try await operation()
                return true
            } catch {
                if attempt == total - 1 { return false }
                await sleep(delays.isEmpty ? 0 : delays[min(attempt, delays.count - 1)])
            }
        }
        return false
    }
}
