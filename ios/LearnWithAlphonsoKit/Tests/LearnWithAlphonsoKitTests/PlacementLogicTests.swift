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
        XCTAssertEqual(grouped["B1"], [])
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
