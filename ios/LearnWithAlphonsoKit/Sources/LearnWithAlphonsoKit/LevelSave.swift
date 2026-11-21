import Foundation

/// The Learn level picker's save (set_cefr_level). The stored level is what start-lesson-session opens lessons from
/// (src/lib/lesson-unlock.ts), so a lost save leaves the map offering lessons the server refuses. The save is retried,
/// and the caller learns whether it landed so it can put the picker back on the stored level (LevelSave.kt).
public enum LevelSave {
    public static let attempts = 3
    public static let failedMessage = "Couldn't save your level. Check your connection and try again."

    /// Runs `save` up to `attempts` times, calling `pause` with the try that failed (1-based) between them. False when
    /// none landed, or when the task was cancelled (a newer pick replaced this one).
    public static func run(
        attempts: Int = attempts,
        pause: (Int) async -> Void = { try? await Task.sleep(nanoseconds: UInt64($0) * 1_000_000_000) },
        _ save: () async throws -> Void
    ) async -> Bool {
        for tryNumber in 1...max(attempts, 1) {
            if Task.isCancelled { return false }
            do {
                try await save()
                return true
            } catch {
                if tryNumber < attempts { await pause(tryNumber) }
            }
        }
        return false
    }
}
