import Foundation

/// V3 pkg 4b -- "in-lesson reinforcement." Picks one extra question testing
/// the same concept as a question the learner just missed, for immediate
/// retrieval practice, right there in the lesson rather than only later in
/// spaced review. Mirrors src/data/bank-engine.ts's
/// `pickReinforcementQuestion` exactly (same doc comment reasoning for why
/// `doingWell` skews between the two pools, and why callers must exclude
/// the current lesson's own questions from both pools before calling this
/// -- `Question` ids are only unique *within* a lesson).
///
/// `Swift.String.hashValue` is randomized per process launch (a security
/// feature), so it can't back a deterministic, testable pick the way
/// bank-engine.ts's `hash()` does -- `fnv1aHash` below is a small,
/// self-contained deterministic hash used only for this selection.
public func fnv1aHash(_ s: String) -> UInt32 {
    var h: UInt32 = 2_166_136_261
    for byte in s.utf8 {
        h ^= UInt32(byte)
        h = h.multipliedReportingOverflow(by: 16_777_619).partialValue
    }
    return h
}

public func pickReinforcementQuestion(
    siblingQuestions: [Question],
    levelQuestions: [Question],
    doingWell: Bool,
    seed: String
) -> Question? {
    let primary = doingWell ? levelQuestions : siblingQuestions
    let fallback = doingWell ? siblingQuestions : levelQuestions
    let pool = primary.isEmpty ? fallback : primary
    guard !pool.isEmpty else { return nil }
    let index = Int(fnv1aHash(seed) % UInt32(pool.count))
    return pool[index]
}
