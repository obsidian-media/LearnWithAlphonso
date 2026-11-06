import XCTest
@testable import LearnWithAlphonsoKit

/// The lesson flow's rules (visual round 6, part 2), with the same vectors as the web's src/lib/lesson-xp.test.ts,
/// lesson-time.test.ts, lesson-stage.test.ts and confetti.test.ts.
final class LessonFlowTests: XCTestCase {
    // MARK: - XP per answer

    /// The server's replay rule (complete-lesson's computeLessonReplayXp): a replay pays only past the best.
    private func award(existing: (correct: Int, xpEarned: Int)?, correct: Int, total: Int) -> Int {
        let bestCorrect = max(existing?.correct ?? 0, correct)
        return max(0, computeXpGain(correct: bestCorrect, total: total) - (existing?.xpEarned ?? 0))
    }

    func testAFirstTryShowsTenOnEveryRightAnswer() {
        for right in 1...8 {
            XCTAssertEqual(LessonXP.answerChip(rightSoFar: right, previousBest: .firstTry), 10)
        }
    }

    func testAReplayShowsNothingUntilTheLearnerPassesTheirBest() {
        XCTAssertNil(LessonXP.answerChip(rightSoFar: 5, previousBest: .best(6)))
        XCTAssertNil(LessonXP.answerChip(rightSoFar: 6, previousBest: .best(6)))
        XCTAssertEqual(LessonXP.answerChip(rightSoFar: 7, previousBest: .best(6)), 10)
        XCTAssertNil(LessonXP.answerChip(rightSoFar: 8, previousBest: .best(8)))
    }

    func testUnknownHistoryNeverPromisesXP() {
        // Offline at the start, the app cannot know whether this is a replay, so it promises nothing.
        XCTAssertNil(LessonXP.answerChip(rightSoFar: 1, previousBest: .unknown))
    }

    /// Every answer pattern of a 6-question lesson against every earlier best: the chips the learner saw add up to
    /// the award less any perfect bonus (the complete screen lists that on its own line). Never more.
    func testOverEveryPatternAndEarlierBestTheChipsAddUpToTheAwardsPerAnswerPart() {
        let total = 6
        for best in -1...total {
            let existing: (correct: Int, xpEarned: Int)? = best < 0 ? nil : (best, computeXpGain(correct: best, total: total))
            let previous: LessonPreviousBest = best < 0 ? .firstTry : .best(best)
            for mask in 0..<(1 << total) {
                var right = 0
                var shown = 0
                for i in 0..<total where mask & (1 << i) != 0 {
                    right += 1
                    shown += LessonXP.answerChip(rightSoFar: right, previousBest: previous) ?? 0
                }
                let awarded = award(existing: existing, correct: right, total: total)
                let perfectPaid = right == total && (existing?.correct ?? -1) < total ? LessonXP.perfectBonus : 0
                XCTAssertEqual(shown, awarded - perfectPaid, "best \(best), mask \(mask)")
            }
        }
    }

    func testStartsUpToIsTheFormulasMaximum() {
        XCTAssertEqual(LessonXP.maxXp(total: 8), 100)
        XCTAssertEqual(LessonXP.maxXp(total: 5), computeXpGain(correct: 5, total: 5))
    }

    // MARK: - XP lines on the complete screen

    func testTheLinesAddUpToTheServersAward() {
        let cases: [(existing: (correct: Int, xpEarned: Int)?, correct: Int, total: Int)] = [
            (nil, 7, 8), (nil, 8, 8), (nil, 0, 8), ((5, 50), 8, 8), ((8, 100), 6, 8), ((6, 60), 6, 8), ((7, 0), 2, 8),
        ]
        for c in cases {
            let awarded = award(existing: c.existing, correct: c.correct, total: c.total)
            let lines = LessonXP.breakdown(correct: c.correct, total: c.total, awarded: awarded)
            XCTAssertEqual(lines.reduce(0) { $0 + $1.xp }, awarded)
            // The sum alone cannot fail (a reconciling line absorbs any gap), so pin the parts too.
            XCTAssertEqual(lines[0], LessonXP.Line(kind: .answers, label: "\(c.correct) right answer\(c.correct == 1 ? "" : "s")", xp: c.correct * 10))
            if c.existing == nil {
                XCTAssertEqual(lines.map(\.kind), c.correct == c.total ? [.answers, .perfect] : [.answers])
            }
        }
    }

    func testTheLinesNameEachPart() {
        XCTAssertEqual(LessonXP.breakdown(correct: 8, total: 8, awarded: 100), [
            .init(kind: .answers, label: "8 right answers", xp: 80),
            .init(kind: .perfect, label: "Perfect lesson", xp: 20),
        ])
        XCTAssertEqual(LessonXP.breakdown(correct: 6, total: 8, awarded: 0), [
            .init(kind: .answers, label: "6 right answers", xp: 60),
            .init(kind: .earlier, label: "Already earned on an earlier try", xp: -60),
        ])
        XCTAssertEqual(LessonXP.breakdown(correct: 2, total: 8, awarded: 70).last, .init(kind: .regraded, label: "Topped up to your best score", xp: 50))
        XCTAssertEqual(LessonXP.Line(kind: .earlier, label: "Already earned on an earlier try", xp: -60).text, "Already earned on an earlier try \u{2212}60")
        XCTAssertEqual(LessonXP.Line(kind: .perfect, label: "Perfect lesson", xp: 20).text, "Perfect lesson +20")
    }

    // MARK: - Finish runs once

    func testFinishRunsOnlyOnce() {
        var gate = FinishGate()
        XCTAssertTrue(gate.begin())
        XCTAssertFalse(gate.begin())
        XCTAssertFalse(gate.begin())
        gate.reset()
        XCTAssertTrue(gate.begin())
    }

    // MARK: - Time

    func testTheBundledTimingMatchesTheWebRules() throws {
        let timing = try LessonTiming.bundled()
        XCTAssertEqual(timing.secondsPerQuestion, ["mc": 20, "listening": 25, "fill": 25, "reorder": 30, "speak": 30, "translate": 45])
        XCTAssertEqual(timing.secondsPerNewWord, 8)
    }

    func testEstimateAddsSecondsPerTypeAndWordRoundedUp() throws {
        let timing = try LessonTiming.bundled()
        // 2*20 + 25 + 45 + 3*8 = 134 s -> 3 min
        XCTAssertEqual(timing.estimateMinutes(questionTypes: ["mc", "mc", "fill", "translate"], newWords: 3), 3)
        XCTAssertEqual(timing.estimateMinutes(questionTypes: [], newWords: 0), 1)
        // The real first English lesson: the web's start screen says "About 4 min".
        let lesson = try ContentStore().bundle(for: .english).units[0].lessons[0]
        let words = deriveVocab(lesson: lesson, images: [:]).count
        XCTAssertEqual(timing.estimateMinutes(questionTypes: lesson.questions.map(\.typeKey), newWords: words), 4)
    }

    func testTheTimerLeavesOutPausedTime() {
        var timer = ActiveTimer(now: 100)
        XCTAssertEqual(timer.elapsed(now: 130), 30)
        timer.pause(now: 130)
        XCTAssertEqual(timer.elapsed(now: 500), 30)
        timer.pause(now: 600) // a second pause changes nothing
        timer.resume(now: 1000)
        timer.resume(now: 1005) // nor a second resume
        XCTAssertEqual(timer.elapsed(now: 1010), 40)
    }

    func testFormatElapsed() {
        XCTAssertEqual(formatElapsed(0), "0:00")
        XCTAssertEqual(formatElapsed(9.6), "0:10")
        XCTAssertEqual(formatElapsed(185), "3:05")
        XCTAssertEqual(formatElapsed(3725), "62:05")
        XCTAssertEqual(formatElapsed(-4), "0:00")
    }

    // MARK: - Stage

    func testAlphonsoAsksListensSmilesAndHmms() {
        XCTAssertEqual(LessonStage.expression(picked: false, verdict: nil), .talk)
        XCTAssertEqual(LessonStage.expression(picked: true, verdict: nil), .neutral)
        XCTAssertEqual(LessonStage.expression(picked: true, verdict: true), .happy)
        XCTAssertEqual(LessonStage.expression(picked: true, verdict: false), .hmm)
    }

    func testTheRoomSizes() {
        XCTAssertEqual(LessonStage.layout(viewportHeight: 852, prompt: "Short?"), .init(size: .full, roomHeight: 380, alphonsoWidth: 315))
        XCTAssertEqual(LessonStage.layout(viewportHeight: 852, prompt: String(repeating: "x", count: 61)), .init(size: .long, roomHeight: 300, alphonsoWidth: 255))
        XCTAssertEqual(LessonStage.layout(viewportHeight: 667, prompt: String(repeating: "x", count: 61)), .init(size: .small, roomHeight: 248, alphonsoWidth: 205))
        XCTAssertEqual(LessonStage.layout(viewportHeight: 852, prompt: String(repeating: "x", count: 60)).size, .full)
    }

    func testAlphonsosEarsStayBelowTheHUD() {
        // The expression art is square with his ear tips 5 px from the top of 640; he stands sunk 14 below the room foot.
        for layout in [LessonStage.layout(viewportHeight: 852, prompt: ""), LessonStage.layout(viewportHeight: 852, prompt: String(repeating: "x", count: 61)), LessonStage.layout(viewportHeight: 600, prompt: "")] {
            let top = layout.roomHeight + LessonStage.alphonsoSink - layout.alphonsoWidth
            XCTAssertGreaterThanOrEqual(top + layout.alphonsoWidth * LessonStage.earTop, LessonStage.hudBottom, "\(layout)")
        }
    }

    func testTheUnitsOwnRoomOrTheStudyByDay() throws {
        let map = try UnitRoomMap.bundled()
        let (unit, room) = try XCTUnwrap(map.units.first)
        XCTAssertEqual(LessonStage.roomID(forUnit: unit, map: map), room)
        XCTAssertEqual(LessonStage.roomID(forUnit: "no-such-unit", map: map), "room-light")
        XCTAssertEqual(LessonStage.roomID(forUnit: nil, map: map), "room-light")
    }

    func testAnswerStates() {
        XCTAssertEqual(LessonAnswerState.of(checked: false, isPicked: false, isRight: true), .idle)
        XCTAssertEqual(LessonAnswerState.of(checked: false, isPicked: true, isRight: false), .selected)
        XCTAssertEqual(LessonAnswerState.of(checked: true, isPicked: true, isRight: true), .correct)
        XCTAssertEqual(LessonAnswerState.of(checked: true, isPicked: false, isRight: true), .correct)
        XCTAssertEqual(LessonAnswerState.of(checked: true, isPicked: true, isRight: false), .incorrect)
        XCTAssertEqual(LessonAnswerState.of(checked: true, isPicked: false, isRight: false), .dimmed)
    }

    // MARK: - Confetti

    func testConfettiIsDeterministicAndInTheRobesColours() {
        let a = Confetti.pieces(seed: 7, width: 393)
        XCTAssertEqual(a.count, 90)
        XCTAssertEqual(a, Confetti.pieces(seed: 7, width: 393))
        XCTAssertNotEqual(a, Confetti.pieces(seed: 8, width: 393))
        XCTAssertEqual(a.filter(\.star).count, 10)
        XCTAssertEqual(Set(a.map(\.color)), Set(Confetti.Color.allCases))
        // The same first draw as the web (Park-Miller, seed 7): 7 * 16807 = 117649.
        XCTAssertEqual(a[0].vx, (117_649.0 / 2_147_483_647 - 0.5) * 340, accuracy: 1e-9)
        for p in a {
            XCTAssertTrue((0...393).contains(p.restX))
            XCTAssertTrue((20...320).contains(p.restY))
        }
    }

    func testConfettiFallsUnderGravity() {
        let p = Confetti.pieces(seed: 7, width: 393)[3]
        let start = Confetti.position(of: p, at: 0)
        XCTAssertEqual(start.x, p.x0)
        XCTAssertEqual(start.y, 70)
        let later = Confetti.position(of: p, at: 2)
        XCTAssertEqual(later.y, 70 + p.vy * 2 + 420 * 4, accuracy: 1e-9)
    }
}
