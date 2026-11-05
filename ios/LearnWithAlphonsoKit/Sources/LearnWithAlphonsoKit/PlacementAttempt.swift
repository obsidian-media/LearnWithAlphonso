import Foundation

/// State for one placement attempt, and the band-to-band glue of the exam --
/// mirrors placement.tsx's local `Session` type plus the "this band just
/// finished" half of its `submit()`.
///
/// It lives in the Kit rather than in PlacementView.swift because that glue
/// is exam logic, not UI: the view can only be compiled on macOS CI and can
/// never be exercised by a test, so anything left in it is unchecked. Here
/// `PlacementLogicTests` plays whole sittings through `completeBand` the way
/// the view does, which is how the "a skipped band's credit must never
/// place a learner above what they answered" rule is pinned end to end.
public struct PlacementAttempt {
    /// The questions drawn for this attempt, grouped by band. Every band is
    /// drawn up front; a band the exam skips is simply not shown (yet).
    public let bandPool: [String: [PlacementQuestion]]
    /// Questions actually decided-on so far, in display order -- grows band
    /// by band as the test adapts.
    public private(set) var shown: [PlacementQuestion]
    /// `placementOrder` index of the band currently being asked.
    public private(set) var bandIdx: Int
    /// Index into `shown` where the current band's questions begin.
    public private(set) var bandStart: Int
    /// The credit so far -- see `resolveBand`.
    public private(set) var tally: PlacementTally

    /// Always starts at A1 and walks forward to the first band that
    /// actually has candidate questions -- defensive only (every shipped
    /// course has content in every band), so a thin/misconfigured pool
    /// degrades to "test whatever exists" instead of crashing on a
    /// missing first question. Mirrors placement.tsx's `startSession`.
    public init(bandPool: [String: [PlacementQuestion]]) {
        var idx = 0
        while idx < placementOrder.count && (bandPool[placementOrder[idx]]?.isEmpty ?? true) {
            idx += 1
        }
        self.bandPool = bandPool
        self.shown = idx < placementOrder.count ? (bandPool[placementOrder[idx]] ?? []) : []
        self.bandIdx = idx
        self.bandStart = 0
        self.tally = PlacementTally()
    }

    /// Draws three questions per band from `pool`, like every real attempt.
    public init(pool: [PlacementQuestion]) {
        self.init(bandPool: groupByBand(pickPlacementSet(pool)))
    }

    /// Where the exam places the learner on the credit so far.
    public var level: String {
        scorePlacement(correctByLevel: tally.correctByLevel).level
    }

    /// True when no band beyond the current one has any content left, so
    /// even the "keep going" adaptive path would end the exam anyway.
    public var noBandsAhead: Bool {
        placementOrder.dropFirst(bandIdx + 1).allSatisfy { bandPool[$0]?.isEmpty ?? true }
    }

    /// Whether finishing the question at `step` is *guaranteed*, whatever
    /// the answer: it is the last one shown and either nothing lies beyond
    /// it, or it belongs to a skipped band the exam went back to, which is
    /// always the last band it asks. Anything else stays "Continue" -- the
    /// real next step (skip, advance, go back or stop) depends on whether
    /// that last answer is correct, which isn't known until it's submitted.
    public func isFinalQuestion(step: Int) -> Bool {
        step + 1 == shown.count && (noBandsAhead || tally.revisiting)
    }

    /// Call once the learner has answered the last question of the band
    /// being asked. `answers` is every answer so far, in order, so
    /// `answers[bandStart...]` are this band's. Tallies the band, lets
    /// `resolveBand` decide what comes next (which can be a band behind
    /// this one, when a skip's credit has just been withdrawn), and either
    /// queues that band's questions or reports the exam over.
    ///
    /// - Returns: true when the exam is over.
    public mutating func completeBand(answers: [Bool]) -> Bool {
        let correctInBand = answers[bandStart...].filter { $0 }.count
        let resolution = resolveBand(
            bandPool: bandPool, currentIdx: bandIdx, correctInBand: correctInBand, tally: tally)
        tally = resolution.tally

        let nextBand = resolution.nextIdx < placementOrder.count
            ? (bandPool[placementOrder[resolution.nextIdx]] ?? [])
            : []
        if resolution.stop || nextBand.isEmpty { return true }

        bandStart = shown.count
        shown.append(contentsOf: nextBand)
        bandIdx = resolution.nextIdx
        return false
    }
}
