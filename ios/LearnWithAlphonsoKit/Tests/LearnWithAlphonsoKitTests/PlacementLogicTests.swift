import XCTest
@testable import LearnWithAlphonsoKit

/// Mirrors src/data/placement.test.ts's scenarios one-for-one, so the two
/// ports can't quietly drift into different answers for the same input.

private func mc(_ id: String, level: String, choices: [String], answer: Int) -> PlacementQuestion {
    .multipleChoice(PlacementQuestion.MultipleChoice(id: id, level: level, prompt: "p", choices: choices, answer: answer))
}

private func fullPoolFixture() -> [PlacementQuestion] {
    placementOrder.flatMap { level in
        (0..<5).map { i in mc("\(level)-\(i)", level: level, choices: ["a", "b"], answer: 0) }
    }
}

final class PlacementLogicTests: XCTestCase {
    // MARK: - pickPlacementSet

    func testPickPlacementSetPicksExactly3PerBandInBandOrder() {
        var rng = SystemRandomNumberGenerator()
        let set = pickPlacementSet(fullPoolFixture(), using: &rng)
        XCTAssertEqual(set.count, placementOrder.count * 3)
        XCTAssertEqual(set.map(\.level), placementOrder.flatMap { [$0, $0, $0] })
    }

    func testPickPlacementSetOnlyPicksQuestionsFromTheGivenPool() {
        let pool = fullPoolFixture()
        let poolIDs = Set(pool.map(\.id))
        var rng = SystemRandomNumberGenerator()
        let set = pickPlacementSet(pool, using: &rng)
        for q in set {
            XCTAssertTrue(poolIDs.contains(q.id))
        }
    }

    func testPickPlacementSetNeverPicksDuplicates() {
        var rng = SystemRandomNumberGenerator()
        let set = pickPlacementSet(fullPoolFixture(), using: &rng)
        XCTAssertEqual(Set(set.map(\.id)).count, set.count)
    }

    func testPickPlacementSetHandlesABandWithFewerThan3CandidatesByTakingAllOfThem() {
        let pool = [mc("a", level: "A1", choices: ["a"], answer: 0), mc("b", level: "A1", choices: ["a"], answer: 0)]
        var rng = SystemRandomNumberGenerator()
        let set = pickPlacementSet(pool, using: &rng)
        XCTAssertEqual(set.count, 2)
    }

    // MARK: - scorePlacement

    private let zero: [String: Int] = ["A1": 0, "A2": 0, "B1": 0, "B2": 0, "C1": 0]

    func testScorePlacementPlacesAtA1WithNoPassedBandsWhenNothingIsCorrect() {
        let result = scorePlacement(correctByLevel: zero)
        XCTAssertEqual(result.level, "A1")
        XCTAssertEqual(result.passed, [])
    }

    func testScorePlacementRequiresAtLeast2Of3CorrectToPassABand() {
        var oneCorrect = zero
        oneCorrect["A1"] = 1
        XCTAssertEqual(scorePlacement(correctByLevel: oneCorrect).level, "A1")
        XCTAssertEqual(scorePlacement(correctByLevel: oneCorrect).passed, [])

        var twoCorrect = zero
        twoCorrect["A1"] = 2
        XCTAssertEqual(scorePlacement(correctByLevel: twoCorrect).level, "A2")
        XCTAssertEqual(scorePlacement(correctByLevel: twoCorrect).passed, ["A1"])
    }

    func testScorePlacementStopsAtTheFirstBandNotPassed() {
        let result = scorePlacement(correctByLevel: ["A1": 3, "A2": 3, "B1": 1])
        XCTAssertEqual(result.level, "B1")
        XCTAssertEqual(result.passed, ["A1", "A2"])
    }

    func testScorePlacementCapsAtC1WhenEveryBandIsPassed() {
        let result = scorePlacement(correctByLevel: ["A1": 3, "A2": 3, "B1": 3, "B2": 3, "C1": 3])
        XCTAssertEqual(result.level, "C1")
        XCTAssertEqual(result.passed, ["A1", "A2", "B1", "B2", "C1"])
    }

    func testScorePlacementTreatsAMissingLevelEntryAsZeroCorrect() {
        let result = scorePlacement(correctByLevel: [:])
        XCTAssertEqual(result.level, "A1")
        XCTAssertEqual(result.passed, [])
    }

    // MARK: - groupByBand

    func testGroupByBandGroupsAFlatSetByLevelKeepingEveryBandsKeyEvenWhenEmpty() {
        var rng = SystemRandomNumberGenerator()
        let grouped = groupByBand(pickPlacementSet(fullPoolFixture(), using: &rng))
        XCTAssertEqual(Set(grouped.keys), Set(placementOrder))
        for lvl in placementOrder {
            XCTAssertTrue(grouped[lvl]!.allSatisfy { $0.level == lvl })
        }
    }

    func testGroupByBandReturnsAnEmptyArrayForABandWithNoCandidates() {
        let a1Only = fullPoolFixture().filter { $0.level == "A1" }
        let grouped = groupByBand(a1Only)
        // Compares count rather than the array: PlacementQuestion is not
        // Equatable, and making it so purely to satisfy a test would put
        // the requirement in the model instead of the assertion. `?.count`
        // still distinguishes a MISSING key (nil) from a present-but-empty
        // one, which is the property this test is named for.
        XCTAssertEqual(grouped["B1"]?.count, 0)
    }

    // MARK: - nextAdaptiveBand

    private func makeFullPool() -> [String: [PlacementQuestion]] {
        var rng = SystemRandomNumberGenerator()
        return groupByBand(pickPlacementSet(fullPoolFixture(), using: &rng))
    }

    func testNextAdaptiveBandStopsImmediatelyWhenEveryQuestionInTheBandIsWrong() {
        let decision = nextAdaptiveBand(bandPool: makeFullPool(), currentIdx: 0, correctInBand: 0)
        XCTAssertEqual(decision, AdaptiveBandDecision(stop: true, skipped: nil, nextIdx: 0))
    }

    func testNextAdaptiveBandStopsImmediatelyWhenTheBandHasNoCandidatesAtAll() {
        let emptyPool = groupByBand([])
        let decision = nextAdaptiveBand(bandPool: emptyPool, currentIdx: 0, correctInBand: 0)
        XCTAssertEqual(decision, AdaptiveBandDecision(stop: true, skipped: nil, nextIdx: 0))
    }

    func testNextAdaptiveBandAdvancesOneBandNormallyOnPartialCredit() {
        let pool = makeFullPool()
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 0, correctInBand: 1), AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: 1))
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 0, correctInBand: 2), AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: 1))
    }

    func testNextAdaptiveBandSkipsTheNextBandOnAPerfectScoreWhenARealBandLiesTwoStepsAhead() {
        let pool = makeFullPool()
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 0, correctInBand: 3), AdaptiveBandDecision(stop: false, skipped: "A2", nextIdx: 2))
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 2, correctInBand: 3), AdaptiveBandDecision(stop: false, skipped: "B2", nextIdx: 4))
    }

    func testNextAdaptiveBandNeverSkipsIntoTheFinalBand() {
        // B2 (idx 3) acing would land on idx 5, past the end -- no skip.
        let decision = nextAdaptiveBand(bandPool: makeFullPool(), currentIdx: 3, correctInBand: 3)
        XCTAssertEqual(decision, AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: 4))
    }

    func testNextAdaptiveBandDoesNotStopOrSkipDifferentlyAtTheTrueFinalBandC1() {
        let pool = makeFullPool()
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 4, correctInBand: 3), AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: 5))
        XCTAssertEqual(nextAdaptiveBand(bandPool: pool, currentIdx: 4, correctInBand: 0), AdaptiveBandDecision(stop: true, skipped: nil, nextIdx: 4))
    }

    func testNextAdaptiveBandDeclinesToSkipWhenTheLandingBandHasNoRealContentEvenOnAPerfectScore() {
        let a1Only = groupByBand(Array(fullPoolFixture().filter { $0.level == "A1" }.prefix(3)))
        let decision = nextAdaptiveBand(bandPool: a1Only, currentIdx: 0, correctInBand: 3)
        XCTAssertEqual(decision, AdaptiveBandDecision(stop: false, skipped: nil, nextIdx: 1))
    }

    // MARK: - resolveBand

    private func bands(_ levels: [String], size: Int = 3) -> [String: [PlacementQuestion]] {
        groupByBand(levels.flatMap { level in
            (0..<size).map { mc("\(level)-\($0)", level: level, choices: ["a", "b"], answer: 0) }
        })
    }

    /// A tally with the given real counts and standing skips, everything else zero.
    private func tally(_ correct: [String: Int], skipped: [String] = [], revisiting: Bool = false) -> PlacementTally {
        var counts = zero
        for (level, n) in correct { counts[level] = n }
        return PlacementTally(correctByLevel: counts, skippedLevels: skipped, revisiting: revisiting)
    }

    /// The state right after acing A1: A2 skipped on credit, B1 about to be asked.
    private var afterSkip: PlacementTally { tally(["A1": 3, "A2": placementPassMark], skipped: ["A2"]) }

    func testResolveBandAgreesWithNextAdaptiveBandWhenNoSkipIsInPlayAndRecordsTheRealCount() {
        let full = bands(placementOrder)
        XCTAssertEqual(
            resolveBand(bandPool: full, currentIdx: 0, correctInBand: 0, tally: PlacementTally()),
            BandResolution(stop: true, nextIdx: 0, tally: tally(["A1": 0])))
        XCTAssertEqual(
            resolveBand(bandPool: full, currentIdx: 0, correctInBand: 1, tally: PlacementTally()),
            BandResolution(stop: false, nextIdx: 1, tally: tally(["A1": 1])))
        XCTAssertEqual(
            resolveBand(bandPool: full, currentIdx: 0, correctInBand: 2, tally: PlacementTally()),
            BandResolution(stop: false, nextIdx: 1, tally: tally(["A1": 2])))
    }

    func testResolveBandSkipsABandOnAPerfectScoreAndCreditsItAsAProvisionalSkip() {
        XCTAssertEqual(
            resolveBand(bandPool: bands(placementOrder), currentIdx: 0, correctInBand: 3, tally: PlacementTally()),
            BandResolution(stop: false, nextIdx: 2, tally: afterSkip))
    }

    func testResolveBandDoesNotTreatAFailedBandAsALostBetUnlessItIsTheBandAfterASkip() {
        // A1 2 of 3 is a pass, so A2 is asked normally; A2 then 1 of 3. Nothing was skipped, nothing to withdraw.
        XCTAssertEqual(
            resolveBand(bandPool: bands(placementOrder), currentIdx: 1, correctInBand: 1, tally: tally(["A1": 2])),
            BandResolution(stop: false, nextIdx: 2, tally: tally(["A1": 2, "A2": 1])))
    }

    func testResolveBandWithdrawsTheCreditAndGoesBackToTheSkippedBandWhenTheBandAfterTheSkipIsFailed() {
        let full = bands(placementOrder)
        for correct in [0, 1] {
            XCTAssertEqual(
                resolveBand(bandPool: full, currentIdx: 2, correctInBand: correct, tally: afterSkip),
                // nextIdx 1 is BACKWARDS: A2, the band that was skipped.
                BandResolution(stop: false, nextIdx: 1, tally: tally(["A1": 3, "A2": 0, "B1": correct], revisiting: true)),
                "B1 \(correct) of 3")
        }
    }

    func testResolveBandJudgesAFailByThePassMarkNotByAnythingButZero() {
        // 1 of 3 is not a pass, so it is a fail here -- even though nextAdaptiveBand calls it "partial credit".
        let full = bands(placementOrder)
        XCTAssertEqual(placementPassMark, 2)
        XCTAssertEqual(nextAdaptiveBand(bandPool: full, currentIdx: 2, correctInBand: 1).nextIdx, 3)
        XCTAssertEqual(resolveBand(bandPool: full, currentIdx: 2, correctInBand: 1, tally: afterSkip).nextIdx, 1)
    }

    func testResolveBandEndsAfterTheBandItWentBackToAndPlacesOnThatBandsRealAnswers() {
        let full = bands(placementOrder)
        let wentBack = resolveBand(bandPool: full, currentIdx: 2, correctInBand: 0, tally: afterSkip).tally
        XCTAssertTrue(wentBack.revisiting)
        let expected = [0: "A2", 1: "A2", 2: "B1", 3: "B1"]
        for correct in 0...3 {
            let end = resolveBand(bandPool: full, currentIdx: 1, correctInBand: correct, tally: wentBack)
            XCTAssertTrue(end.stop, "A2 \(correct) of 3")
            XCTAssertFalse(end.tally.revisiting)
            XCTAssertEqual(end.tally.skippedLevels, [])
            XCTAssertEqual(end.tally.correctByLevel["A2"], correct)
            XCTAssertEqual(scorePlacement(correctByLevel: end.tally.correctByLevel).level, expected[correct], "A2 \(correct) of 3")
        }
    }

    func testResolveBandWithdrawsTheCreditAndEndsPlacingAtTheSkippedBandWhenThatBandHasNoQuestions() {
        // A1, B1, C1 only: A2 can be skipped (B1 lies beyond it) but never asked.
        let thin = bands(["A1", "B1", "C1"])
        let skipped = resolveBand(bandPool: thin, currentIdx: 0, correctInBand: 3, tally: PlacementTally())
        XCTAssertEqual(skipped.tally.skippedLevels, ["A2"])
        let failed = resolveBand(bandPool: thin, currentIdx: 2, correctInBand: 0, tally: skipped.tally)
        XCTAssertEqual(failed, BandResolution(stop: true, nextIdx: 2, tally: tally(["A1": 3, "A2": 0, "B1": 0])))
        XCTAssertEqual(scorePlacement(correctByLevel: failed.tally.correctByLevel).level, "A2")
    }

    func testResolveBandKeepsTheCreditAndCarriesOnWhenTheBandAfterTheSkipIsPassed() {
        let full = bands(placementOrder)
        XCTAssertEqual(
            resolveBand(bandPool: full, currentIdx: 2, correctInBand: 2, tally: afterSkip),
            BandResolution(stop: false, nextIdx: 3, tally: tally(["A1": 3, "A2": 2, "B1": 2], skipped: ["A2"])))
        XCTAssertEqual(
            resolveBand(bandPool: full, currentIdx: 2, correctInBand: 3, tally: afterSkip),
            BandResolution(stop: false, nextIdx: 4, tally: tally(["A1": 3, "A2": 2, "B1": 3, "B2": 2], skipped: ["A2", "B2"])))
        let doubleSkip = tally(["A1": 3, "A2": 2, "B1": 3, "B2": 2], skipped: ["A2", "B2"])
        let end = resolveBand(bandPool: full, currentIdx: 4, correctInBand: 2, tally: doubleSkip)
        XCTAssertEqual(end.nextIdx, 5) // past C1: nothing left to ask
        XCTAssertEqual(end.tally.skippedLevels, ["A2", "B2"])
        XCTAssertEqual(scorePlacement(correctByLevel: end.tally.correctByLevel).level, "C1")
    }

    func testResolveBandGoesBackToTheRightBandAfterASkipHigherUpAndKeepsAnEarlierSkipThatStillStands() {
        // A1 and B1 aced: A2 and B2 skipped, C1 next. C1 failed: B2's credit goes, A2's stays (B1 backs it).
        let doubleSkip = tally(["A1": 3, "A2": 2, "B1": 3, "B2": 2], skipped: ["A2", "B2"])
        XCTAssertEqual(
            resolveBand(bandPool: bands(placementOrder), currentIdx: 4, correctInBand: 0, tally: doubleSkip),
            BandResolution(
                stop: false, nextIdx: 3,
                tally: tally(["A1": 3, "A2": 2, "B1": 3, "B2": 0, "C1": 0], skipped: ["A2"], revisiting: true)))
    }

    // MARK: - every sitting

    private struct Sitting {
        /// The bands the exam asked, in order.
        var asked: [String]
        /// Correct answers in each band that was asked.
        var real: [String: Int]
        var tally: PlacementTally
    }

    /// Every sitting the exam can produce from this pool: each band it asks gets every possible score.
    private func allSittings(_ pool: [String: [PlacementQuestion]]) -> [Sitting] {
        var sittings: [Sitting] = []
        func walk(_ idx: Int, _ tally: PlacementTally, _ asked: [String], _ real: [String: Int]) {
            let level = placementOrder[idx]
            for correct in 0...(pool[level]?.count ?? 0) {
                let resolution = resolveBand(bandPool: pool, currentIdx: idx, correctInBand: correct, tally: tally)
                var nextReal = real
                nextReal[level] = correct
                let nextBand = placementOrder.indices.contains(resolution.nextIdx)
                    ? (pool[placementOrder[resolution.nextIdx]] ?? [])
                    : []
                if resolution.stop || nextBand.isEmpty {
                    sittings.append(Sitting(asked: asked + [level], real: nextReal, tally: resolution.tally))
                } else {
                    walk(resolution.nextIdx, resolution.tally, asked + [level], nextReal)
                }
            }
        }
        walk(0, PlacementTally(), [], [:])
        return sittings
    }

    /// The property the whole skip mechanism has to keep, stated once and checked over EVERY possible sitting rather
    /// than a handful of examples: a placement is never higher than the learner's real answers support. The bug this
    /// pins -- ace A1, fail B1, get placed at B1 on a credit for an A2 nobody asked -- is one sitting out of
    /// hundreds; the examples above name the ones that matter, this proves there is not another one like it.
    func testASkippedBandsCreditNeverPlacesALearnerAboveWhatTheyReallyAnswered() {
        let pools: [(name: String, pool: [String: [PlacementQuestion]], floor: Int)] = [
            ("a full pool", bands(placementOrder), 100),
            ("a pool with no A2 or B2", bands(["A1", "B1", "C1"]), 5),
            ("a pool with a one-question B1", {
                var pool = bands(placementOrder)
                pool["B1"] = bands(["B1"], size: 1)["B1"]
                return pool
            }(), 30),
        ]
        for (name, pool, floor) in pools {
            let sittings = allSittings(pool)
            // The floor is far under the real count (214, 10 and 79 when this was written) and is only there so an
            // enumeration that quietly stopped enumerating cannot pass.
            XCTAssertGreaterThanOrEqual(sittings.count, floor, name)

            for s in sittings {
                let story = "\(name): asked " + s.asked.map { "\($0):\(s.real[$0] ?? -1)" }.joined(separator: " ")

                // A band is asked at most once, so a sitting never exceeds the 15 questions the exam advertises.
                XCTAssertEqual(Set(s.asked).count, s.asked.count, story)

                // Every credit still standing at the end rests on a REAL pass of the band above it -- and the band
                // itself was not asked.
                for skipped in s.tally.skippedLevels {
                    guard let i = placementOrder.firstIndex(of: skipped), i + 1 < placementOrder.count else {
                        XCTFail("\(story): \(skipped) can never be a skipped band")
                        continue
                    }
                    let above = placementOrder[i + 1]
                    XCTAssertFalse(s.asked.contains(skipped), story)
                    XCTAssertGreaterThanOrEqual(s.real[above] ?? 0, placementPassMark, story)
                }

                // The tally is the real counts, plus the pass mark for each standing skip, and nothing else.
                for level in placementOrder {
                    let expected = s.tally.skippedLevels.contains(level) ? placementPassMark : (s.real[level] ?? 0)
                    XCTAssertEqual(s.tally.correctByLevel[level], expected, "\(story) / \(level)")
                }

                // The headline claim: placed no higher than one band above the highest band really passed.
                let reallyPassed = s.asked
                    .filter { (s.real[$0] ?? 0) >= placementPassMark }
                    .compactMap { placementOrder.firstIndex(of: $0) }
                let highest = reallyPassed.max() ?? -1
                let placed = placementOrder.firstIndex(of: scorePlacement(correctByLevel: s.tally.correctByLevel).level)!
                XCTAssertLessThanOrEqual(placed, min(placementOrder.count - 1, highest + 1), story)
            }
        }
    }

    func testTheSittingFromTheBugReportIsInTheEnumerationAndEndsAtA2AtMost() {
        // A1 3/3 (A2 skipped), B1 0/3 (fail), then A2 asked: the old exam ended at B1 here, after two bands.
        let bug = allSittings(bands(placementOrder)).filter {
            $0.asked == ["A1", "B1", "A2"] && $0.real["A1"] == 3 && $0.real["B1"] == 0
        }
        XCTAssertEqual(bug.count, 4) // A2 asked, 0...3 correct
        for s in bug {
            let a2 = s.real["A2"] ?? 0
            XCTAssertEqual(scorePlacement(correctByLevel: s.tally.correctByLevel).level, a2 >= 2 ? "B1" : "A2", "A2 answered \(a2) of 3")
        }
    }

    // MARK: - PlacementAttempt plays a whole sitting

    /// Plays an attempt the way PlacementView does: one verdict per question, completing a band when its last
    /// question has been answered.
    private struct Play {
        var attempt: PlacementAttempt
        var answers: [Bool] = []
        var finished = false

        init(_ attempt: PlacementAttempt) { self.attempt = attempt }

        /// The band of the question on screen, nil when there is none.
        var currentLevel: String? {
            attempt.shown.indices.contains(answers.count) ? attempt.shown[answers.count].level : nil
        }

        var correct: Int { answers.filter { $0 }.count }

        mutating func answer(_ right: Bool) {
            // A failed expectation, not a trap: if the exam ends early (the very regression these tests exist for)
            // a precondition here would kill the whole test process and take every other Kit test down with it.
            guard !finished else {
                XCTFail("answered a question after the exam had already ended")
                return
            }
            answers.append(right)
            if answers.count == attempt.shown.count {
                finished = attempt.completeBand(answers: answers)
            }
        }

        mutating func play(_ verdicts: Bool...) {
            for v in verdicts { answer(v) }
        }
    }

    private func newPlay(_ levels: [String] = placementOrder) -> Play {
        Play(PlacementAttempt(bandPool: bands(levels)))
    }

    func testAFailedB1AfterTheA2SkipGoesBackAndAsksA2ThenPlacesAtA2WhenA2IsFailedToo() {
        var p = newPlay()
        p.play(true, true, true) // A1 perfect: A2 skipped
        XCTAssertEqual(p.currentLevel, "B1")
        p.play(false, false, false) // B1 failed outright

        XCTAssertFalse(p.finished, "the exam must not end on the credit it gave A2")
        XCTAssertEqual(p.currentLevel, "A2")
        XCTAssertEqual(p.attempt.shown.count, 9)
        XCTAssertFalse(p.attempt.isFinalQuestion(step: p.answers.count))
        p.play(false, false)
        // The sent-back band is the last one asked, so its final question already reads "See my level".
        XCTAssertTrue(p.attempt.isFinalQuestion(step: p.answers.count))
        p.play(false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "A2")
        XCTAssertEqual(p.correct, 3)
        // Nothing was fast-tracked: the one band that was skipped has been asked after all.
        XCTAssertEqual(p.attempt.tally.skippedLevels, [])
    }

    func testItPlacesAtB1OnceTheBandItWentBackToIsReallyPassed() {
        var p = newPlay()
        p.play(true, true, true, false, false, false) // A1 perfect, B1 failed outright
        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "A2")
        p.play(true, true, false) // A2 really passed, 2 of 3

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "B1")
        XCTAssertEqual(p.correct, 5)
        XCTAssertEqual(p.attempt.tally.skippedLevels, [])
    }

    func testOneOfThreeOnB1AfterASkipIsAFailTooAndGoesBackToA2InsteadOfOnToB2() {
        var p = newPlay()
        p.play(true, true, true)
        p.play(true, false, false) // B1: 1 of 3, under the 2-of-3 pass mark

        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "A2")
        XCTAssertEqual(p.attempt.shown.count, 9)
        p.play(false, false, false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "A2")
        XCTAssertEqual(p.correct, 4)
        XCTAssertEqual(p.attempt.tally.skippedLevels, [])
    }

    func testTwoOfThreeOnB1AfterASkipKeepsTheFastTrackAndCarriesOnToB2() {
        var p = newPlay()
        p.play(true, true, true)
        p.play(true, true, false) // B1 passed, not perfect

        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "B2")
        XCTAssertEqual(p.attempt.tally.skippedLevels, ["A2"])
        p.play(false, false, false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "B2") // A1 and B1 passed, A2 stands on B1, B2 failed
        XCTAssertEqual(p.correct, 5)
        XCTAssertEqual(p.attempt.tally.skippedLevels, ["A2"])
    }

    func testThreeOfThreeOnB1AfterASkipSkipsB2TooAndBothCreditsStandOnceC1IsPassed() {
        var p = newPlay()
        p.play(true, true, true, true, true, true)

        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "C1")
        XCTAssertEqual(p.attempt.tally.skippedLevels, ["A2", "B2"])
        p.play(true, true, true)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "C1")
        XCTAssertEqual(p.correct, 9)
        XCTAssertEqual(p.attempt.tally.skippedLevels, ["A2", "B2"])
    }

    func testAFailedC1AfterADoubleSkipGoesBackToB2AndKeepsTheA2CreditThatB1Backs() {
        var p = newPlay()
        p.play(true, true, true, true, true, true, false, false, false) // C1 failed outright

        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "B2")
        p.play(false, false, false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "B2")
        XCTAssertEqual(p.correct, 6)
        XCTAssertEqual(p.attempt.shown.count, 12)
        XCTAssertEqual(p.attempt.tally.skippedLevels, ["A2"])
    }

    func testTheSameRuleHigherUpA2PerfectSkipsB1AndAFailedB2SendsTheExamBackToB1() {
        var p = newPlay()
        p.play(true, true, false) // A1: 2 of 3 is a pass but not perfect, so A2 is asked
        XCTAssertEqual(p.currentLevel, "A2")
        p.play(true, true, true) // A2 perfect: B1 skipped
        XCTAssertEqual(p.currentLevel, "B2")
        p.play(false, false, false) // B2 failed outright

        XCTAssertFalse(p.finished)
        XCTAssertEqual(p.currentLevel, "B1")
        p.play(false, false, false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "B1")
        XCTAssertEqual(p.correct, 5)
        XCTAssertEqual(p.attempt.shown.count, 12)
        XCTAssertEqual(p.attempt.tally.skippedLevels, [])
    }

    func testAnAttemptWithNoQuestionsInTheSkippedBandPlacesAtThatBandAtMost() {
        var p = newPlay(["A1", "B1", "C1"]) // no A2 to go back to
        p.play(true, true, true, false, false, false)

        XCTAssertTrue(p.finished)
        XCTAssertEqual(p.attempt.level, "A2")
        XCTAssertEqual(p.correct, 3)
        XCTAssertEqual(p.attempt.tally.skippedLevels, [])
    }

    func testAnAttemptStartsAtTheFirstBandThatHasQuestionsAndNeverCrashesOnAnEmptyPool() {
        XCTAssertEqual(newPlay(["B1", "C1"]).currentLevel, "B1")
        let empty = PlacementAttempt(bandPool: groupByBand([]))
        XCTAssertTrue(empty.shown.isEmpty)
        XCTAssertTrue(empty.noBandsAhead) // bandIdx is past the last band: nothing ahead, and no out-of-range slice
        XCTAssertEqual(empty.level, "A1")
    }

    // MARK: - playablePlacementPool

    func testPlayablePlacementPoolDropsListeningWhenAudioIsUnavailable() {
        let listening = PlacementQuestion.listening(
            PlacementQuestion.Listening(id: "l1", level: "A1", prompt: "p", audioText: "hi", choices: ["hi"], answer: "hi")
        )
        let pool = [mc("m1", level: "A1", choices: ["a"], answer: 0), listening]
        XCTAssertEqual(playablePlacementPool(pool, canPlayAudio: false).map(\.id), ["m1"])
        XCTAssertEqual(playablePlacementPool(pool, canPlayAudio: true).map(\.id), ["m1", "l1"])
    }

    // MARK: - isPlacementAnswerCorrect

    func testIsPlacementAnswerCorrectForMultipleChoice() {
        let q = mc("m1", level: "A1", choices: ["a", "b", "c"], answer: 1)
        XCTAssertTrue(isPlacementAnswerCorrect(q, answer: "b"))
        XCTAssertFalse(isPlacementAnswerCorrect(q, answer: "a"))
        XCTAssertFalse(isPlacementAnswerCorrect(q, answer: nil))
        XCTAssertFalse(isPlacementAnswerCorrect(q, answer: ""))
    }

    func testIsPlacementAnswerCorrectForListeningComparesTheChoiceTextNotAnIndex() {
        let q = PlacementQuestion.listening(
            PlacementQuestion.Listening(id: "l1", level: "A1", prompt: "p", audioText: "The shop shuts at six.", choices: ["The shop shuts at six.", "The shop shuts at seven."], answer: "The shop shuts at six.")
        )
        XCTAssertTrue(isPlacementAnswerCorrect(q, answer: "The shop shuts at six."))
        XCTAssertFalse(isPlacementAnswerCorrect(q, answer: "The shop shuts at seven."))
    }

    func testIsPlacementAnswerCorrectForTranslateUsesTheSameToleranceAsLessonTranslation() {
        let q = PlacementQuestion.translate(
            PlacementQuestion.Translate(id: "t1", level: "A1", prompt: "p", acceptableAnswers: ["Good morning.", "Morning."])
        )
        XCTAssertTrue(isPlacementAnswerCorrect(q, answer: "Good morning."))
        // TranslationAnswer.matches already tolerates case/punctuation --
        // this just confirms placement grading actually calls through to
        // it rather than doing a stricter exact-string comparison.
        XCTAssertTrue(isPlacementAnswerCorrect(q, answer: "good morning"))
        XCTAssertFalse(isPlacementAnswerCorrect(q, answer: "Good evening."))
    }
}
