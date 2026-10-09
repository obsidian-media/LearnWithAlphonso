import Foundation

/// Bookkeeping for resume-position saves, kept out of the app target so it can be tested.
///
/// The client guards each write on the `updated_at` it last observed (optimistic
/// concurrency, see `PodcastClient.savePlaybackPosition`). This type decides what that
/// observation is and when saving is pointless:
/// - `lastSeenUpdatedAt == nil` means "no row known": the client upserts.
/// - After a save, the observation is what the SERVER stored. It used to be the device
///   clock, which never matched, so every second save looked stale.
/// - A stale write means another device wrote since we read. Saving stops until the learner
///   acts (play, resume), because that action is a fresh observation and may win.
/// - A 401 stops saving until the learner acts, by which time the session may have refreshed.
/// - An account change resets the gate and bumps `epoch`. Each save captures the epoch it
///   started under and only reports back if the gate still `accepts` it, so a save chained
///   from the previous account can never touch the new account's gate.
public struct PodcastSaveGate: Equatable, Sendable {
    public private(set) var lastSeenUpdatedAt: String?
    public private(set) var isStale = false
    public private(set) var isUnauthorized = false
    /// Bumped by `resetForAccountChange`. A save captures it when it is queued.
    public private(set) var epoch = 0

    public init(lastSeenUpdatedAt: String? = nil) {
        self.lastSeenUpdatedAt = lastSeenUpdatedAt
    }

    public var canSave: Bool { !isStale && !isUnauthorized }

    public func accepts(_ savedUnder: Int) -> Bool { savedUnder == epoch }

    /// Sign-out or account deletion: forget the previous account entirely.
    public mutating func resetForAccountChange() {
        lastSeenUpdatedAt = nil
        isStale = false
        isUnauthorized = false
        epoch += 1
    }

    public mutating func beginEpisode(lastSeenUpdatedAt: String?) {
        self.lastSeenUpdatedAt = lastSeenUpdatedAt
        isStale = false
    }

    public mutating func userStartedPlayback() {
        if isStale {
            isStale = false
            lastSeenUpdatedAt = nil
        }
        isUnauthorized = false
    }

    public mutating func recordSaved(updatedAt: String?) {
        lastSeenUpdatedAt = updatedAt
    }

    public mutating func recordStale() {
        isStale = true
        lastSeenUpdatedAt = nil
    }

    public mutating func recordUnauthorized() {
        isUnauthorized = true
    }
}
