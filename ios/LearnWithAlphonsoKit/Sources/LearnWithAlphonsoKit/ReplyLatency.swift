import Foundation

/// How long the learner took to start answering, one value per reply, for a rehearsal call. The clock starts when the
/// partner's voice finishes playing (the opener or a reply) and stops at the first sign the learner is speaking: the
/// hold-to-talk press, or in hands-free the first voice activity. Times are milliseconds on a monotonic clock
/// (`MonotonicClock.nowMs()`), never wall-clock time, so a changed clock or a sleeping phone cannot bend a gap.
///
/// A gap is only kept when the reply is actually transcribed and sent (`replySent()`): a failed, empty or too-short
/// recording leaves the partner's clock running (`attemptFailed()`), so the retry measures its own start. A reply with
/// no partner voice before it (typed, or the partner's audio failed) records nothing (`clearPartnerClock()`), so the
/// list can be shorter than the number of replies.
public struct ReplyLatencyTracker: Equatable, Sendable {
    public static let maxMs = 60_000
    public static let maxEntries = 60

    private var partnerDoneAtMs: Int?
    private var learnerStartedAtMs: Int?
    private var recorded: [Int] = []

    public init() {}

    /// The partner's voice just finished at `atMs`. Starts a fresh clock for the next learner reply.
    public mutating func partnerFinished(atMs: Int) {
        partnerDoneAtMs = atMs
        learnerStartedAtMs = nil
    }

    /// The learner started speaking at `atMs`. Only the first start of an attempt counts (hands-free can report voice
    /// activity more than once in one turn); a start with no partner voice before it is ignored.
    public mutating func learnerStarted(atMs: Int) {
        guard partnerDoneAtMs != nil, learnerStartedAtMs == nil else { return }
        learnerStartedAtMs = atMs
    }

    /// The attempt that started did not become a reply (too short, empty transcript, a failed request). The partner's
    /// clock keeps running; the next attempt gets its own start.
    public mutating func attemptFailed() { learnerStartedAtMs = nil }

    /// The learner's words were transcribed and sent: keep the gap, and close the clock until the partner speaks again.
    public mutating func replySent() {
        defer { partnerDoneAtMs = nil; learnerStartedAtMs = nil }
        guard let done = partnerDoneAtMs, let started = learnerStartedAtMs else { return }
        recorded.append(started - done)
    }

    /// No partner audio follows (a typed reply, or the reply's audio failed): a later voice press must not measure a gap.
    public mutating func clearPartnerClock() {
        partnerDoneAtMs = nil
        learnerStartedAtMs = nil
    }

    public mutating func reset() { self = ReplyLatencyTracker() }

    /// In the order they happened, each clamped to 0...maxMs, at most `maxEntries`.
    public var values: [Int] { Self.sanitize(recorded) }

    public static func sanitize(_ raw: [Int]) -> [Int] {
        raw.prefix(maxEntries).map { min(max($0, 0), maxMs) }
    }
}

/// Milliseconds on a clock that only moves forward, including while the phone sleeps.
public enum MonotonicClock {
    private static let origin = ContinuousClock.now

    public static func nowMs() -> Int {
        let d = ContinuousClock.now - origin
        return Int(d.components.seconds) * 1000 + Int(d.components.attoseconds / 1_000_000_000_000_000)
    }
}
