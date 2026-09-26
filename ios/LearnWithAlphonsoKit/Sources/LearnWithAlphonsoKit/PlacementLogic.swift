import Foundation

/// Port of src/data/placement.ts's pure scoring/adaptive-sequencing
/// functions -- kept as free functions over plain data (no Session, no
/// view state) so this can be exercised the same way the TS side's own
/// placement.test.ts does, one behavior at a time. See PlacementView.swift
/// for how these compose into the actual on-device exam flow.

/// Drops listening questions when the device has no speech synthesis --
/// mirrors placement.ts's `playablePool` exactly, same reasoning: a
/// placement listening question's audio text IS its correct answer, so a
/// printed-text fallback would hand out a free mark rather than measuring
/// anything. iOS always has AVSpeechSynthesizer, unlike the web's
/// `"speechSynthesis" in window` check, but the caller may still pass
/// `canPlayAudio: false` (e.g. the device is muted/silent-switched in a
/// way that would make an audio-only question unanswerable) -- see
/// PlacementView's own call site for the actual policy.
public func playablePlacementPool(
    _ pool: [PlacementQuestion], canPlayAudio: Bool
) -> [PlacementQuestion] {
    guard !canPlayAudio else { return pool }
    return pool.filter {
        if case .listening = $0 { return false }
        return true
    }
}

/// Mirrors placement.ts's `pickPlacementSet` exactly: a fresh Fisher-Yates
/// shuffle per band, then the first 3 -- so a retaken test shows a
/// different 15 questions instead of the same fixed set every time.
/// `rng` is injected so tests can assert the real invariants (3 per band,
/// every pick actually from that band, no duplicates) without depending
/// on true randomness; production callers use the no-argument overload
/// below, which is the only one that ships.
public func pickPlacementSet<R: RandomNumberGenerator>(
    _ pool: [PlacementQuestion], using rng: inout R
) -> [PlacementQuestion] {
    var picked: [PlacementQuestion] = []
    for level in placementOrder {
        let candidates = pool.filter { $0.level == level }
        picked.append(contentsOf: candidates.shuffled(using: &rng).prefix(3))
    }
    return picked
}

public func pickPlacementSet(_ pool: [PlacementQuestion]) -> [PlacementQuestion] {
    var rng = SystemRandomNumberGenerator()
    return pickPlacementSet(pool, using: &rng)
}

/// Groups an already-sampled placement set by CEFR band, in
/// `placementOrder` -- mirrors placement.ts's `groupByBand` exactly,
/// including keeping every band's key present (as an empty array) even
/// when nothing landed in it, which `nextAdaptiveBand` below depends on.
public func groupByBand(_ questions: [PlacementQuestion]) -> [String: [PlacementQuestion]] {
    var grouped: [String: [PlacementQuestion]] = Dictionary(
        uniqueKeysWithValues: placementOrder.map { ($0, []) }
    )
    for q in questions {
        grouped[q.level, default: []].append(q)
    }
    return grouped
}

public struct AdaptiveBandDecision: Equatable {
    /// True when the test should end here -- no further bands get tested.
    public let stop: Bool
    /// A band that gets synthetic pass credit without being shown to the learner.
    public let skipped: String?
    /// Which `placementOrder` index to test next (meaningless when `stop` is true).
    public let nextIdx: Int
}

/// Mirrors placement.ts's `nextAdaptiveBand` exactly -- see that file's
/// own doc comment for the full rule set (stop on a zero band, skip one
/// band ahead on a perfect score only when a real band exists two steps
/// out, otherwise advance normally).
public func nextAdaptiveBand(
    bandPool: [String: [PlacementQuestion]], currentIdx: Int, correctInBand: Int
) -> AdaptiveBandDecision {
    let last = placementOrder.count - 1
    let bandSize = bandPool[placementOrder[currentIdx]]?.count ?? 0
    if bandSize == 0 || correctInBand == 0 {
        return AdaptiveBandDecision(stop: true, skipped: nil, nextIdx: currentIdx)
    }
    let landingIdx = currentIdx + 2
    let landingHasContent = landingIdx <= last && (bandPool[placementOrder[landingIdx]]?.count ?? 0) > 0
    if correctInBand == bandSize && landingHasContent {
        return AdaptiveBandDecision(stop: false, skipped: placementOrder[currentIdx + 1], nextIdx: landingIdx)
    }
    return AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: currentIdx + 1)
}

/// Mirrors placement.ts's `scorePlacement` exactly: a band is "passed"
/// with at least 2 of its 3 questions correct, and placement lands one
/// band above the highest *consecutively* passed band (capped at C1).
public func scorePlacement(correctByLevel: [String: Int]) -> (level: String, passed: [String]) {
    var passed: [String] = []
    for lvl in placementOrder {
        if (correctByLevel[lvl] ?? 0) >= 2 {
            passed.append(lvl)
        } else {
            break
        }
    }
    guard let lastPassed = passed.last, let idx = placementOrder.firstIndex(of: lastPassed) else {
        return ("A1", passed)
    }
    let next = placementOrder[min(idx + 1, placementOrder.count - 1)]
    return (next, passed)
}

/// Mirrors placement-grading.ts's `isPlacementAnswerCorrect` exactly: the
/// submitted TEXT rather than an option index (a listening question
/// answers with the choice's text, a translation with a whole sentence),
/// and an empty answer is always wrong rather than an error -- an exam
/// that cannot finish leaves the learner unplaced.
public func isPlacementAnswerCorrect(_ question: PlacementQuestion, answer: String?) -> Bool {
    let given = (answer ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !given.isEmpty else { return false }
    switch question {
    case .multipleChoice(let q):
        return q.choices.indices.contains(q.answer) && q.choices[q.answer] == given
    case .listening(let q):
        return q.answer == given
    case .translate(let q):
        return TranslationAnswer.matches(submission: given, acceptable: q.acceptableAnswers)
    }
}
