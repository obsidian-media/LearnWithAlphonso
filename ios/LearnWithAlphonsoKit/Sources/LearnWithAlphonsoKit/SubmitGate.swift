import Foundation

/// A one-at-a-time guard for a button whose work is async. `begin()` must be called synchronously in the tap
/// handler, before the Task starts: setting the busy flag inside the Task left a window in which a second tap
/// started a second submission (Review's "Next" graded the same card twice and skipped the next one).
public struct SubmitGate: Sendable, Equatable {
    public private(set) var isBusy = false

    public init() {}

    /// True when the caller may go ahead; false while a submission is already running.
    public mutating func begin() -> Bool {
        guard !isBusy else { return false }
        isBusy = true
        return true
    }

    public mutating func end() {
        isBusy = false
    }
}
