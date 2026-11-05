import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarLipSyncTests: XCTestCase {
    func testCuesAreContiguousAndCoverTheWholeDuration() {
        let plan = AvatarLipSync.plan(text: "Hello there, how are you?", course: .english, duration: 3.0)
        XCTAssertFalse(plan.cues.isEmpty)
        XCTAssertEqual(plan.cues.first?.start ?? -1, 0, accuracy: 1e-9)
        XCTAssertEqual(plan.cues.last?.end ?? -1, 3.0, accuracy: 1e-9)
        for (a, b) in zip(plan.cues, plan.cues.dropFirst()) {
            XCTAssertEqual(a.end, b.start, accuracy: 1e-9)
        }
        for cue in plan.cues { XCTAssertGreaterThan(cue.end, cue.start) }
    }

    func testEveryOpenShapeIsHeldAtLeastTheMinimum() {
        let plan = AvatarLipSync.plan(
            text: "Hello there, how are you doing today my friend?", course: .english, duration: 4.0)
        for cue in plan.cues where cue.viseme != .closed {
            XCTAssertGreaterThanOrEqual(cue.end - cue.start, AvatarLipSync.minimumHold - 1e-9, "\(cue)")
        }
    }

    func testALongWordInAShortTimeDropsShapesInsteadOfFlickering() {
        let plan = AvatarLipSync.plan(text: "extraordinarily", course: .english, duration: 0.3)
        XCTAssertLessThanOrEqual(plan.cues.count, 4)
        for cue in plan.cues { XCTAssertGreaterThanOrEqual(cue.end - cue.start, AvatarLipSync.minimumHold - 1e-9) }
        XCTAssertEqual(plan.cues.last?.end ?? -1, 0.3, accuracy: 1e-9)
    }

    func testWordsGetTheirShapesAndGapsCloseTheMouth() {
        let plain = AvatarLipSync.plan(text: "ab cd", course: .english, duration: 5)
        XCTAssertEqual(plain.viseme(at: 0.5), .ah)
        XCTAssertEqual(plain.viseme(at: 1.5), .closed)
        XCTAssertEqual(plain.viseme(at: 2.5), .closed)
        XCTAssertEqual(plain.viseme(at: 3.5), .half)
        XCTAssertEqual(plain.viseme(at: 4.5), .talk)

        // A comma lengthens the gap: 2 + 4 + 2 = 8 units.
        let comma = AvatarLipSync.plan(text: "ab, cd", course: .english, duration: 8)
        XCTAssertEqual(comma.viseme(at: 0.5), .ah)
        XCTAssertEqual(comma.viseme(at: 4.0), .closed)
        XCTAssertEqual(comma.viseme(at: 6.5), .half)
    }

    func testOutsideThePlanTheMouthIsClosed() {
        let plan = AvatarLipSync.plan(text: "ab cd", course: .english, duration: 5)
        XCTAssertEqual(plan.viseme(at: -1), .closed)
        XCTAssertEqual(plan.viseme(at: 5.0), .closed)
        XCTAssertEqual(plan.viseme(at: 99), .closed)
    }

    func testNothingToSayOrNoTimeGivesAnEmptyPlan() {
        XCTAssertTrue(AvatarLipSync.plan(text: "", course: .english, duration: 2).cues.isEmpty)
        XCTAssertTrue(AvatarLipSync.plan(text: "?!", course: .english, duration: 2).cues.isEmpty)
        XCTAssertTrue(AvatarLipSync.plan(text: "hello", course: .english, duration: 0).cues.isEmpty)
        XCTAssertEqual(AvatarLipSync.plan(text: "", course: .english, duration: 2).viseme(at: 1), .closed)
    }

    func testAQuestionRaisesTheBrowsOnItsLastWordsOnly() {
        let plan = AvatarLipSync.plan(text: "Tell me more about where you are from?", course: .english, duration: 4)
        XCTAssertEqual(plan.brows(at: 0.3), .neutral)
        XCTAssertEqual(plan.brows(at: 1.5), .neutral)
        XCTAssertEqual(plan.brows(at: 3.8), .raised)
    }

    func testOnlyTheQuestionSentenceRaisesTheBrows() {
        let plan = AvatarLipSync.plan(text: "I like it. Do you like it?", course: .english, duration: 4)
        XCTAssertEqual(plan.brows(at: 0.5), .neutral)
        XCTAssertEqual(plan.brows(at: 3.9), .raised)
    }

    func testSpanishQuestionWithInvertedMarks() {
        let plan = AvatarLipSync.plan(text: "Muy bien. ¿Cómo estás hoy?", course: .spanish, duration: 3)
        XCTAssertEqual(plan.brows(at: 0.2), .neutral)
        XCTAssertEqual(plan.brows(at: 2.9), .raised)
    }

    func testAGreetingRaisesTheBrowsBrieflyAtTheStart() {
        let plan = AvatarLipSync.plan(text: "Hello! Let us talk about food today.", course: .english, duration: 4)
        XCTAssertEqual(plan.brows(at: 0.2), .raised)
        XCTAssertEqual(plan.brows(at: 2.0), .neutral)
        let french = AvatarLipSync.plan(text: "Bonjour, on commence maintenant avec la leçon.", course: .french, duration: 3)
        XCTAssertEqual(french.brows(at: 0.2), .raised)
    }

    func testAPlainStatementNeverRaisesTheBrows() {
        let plan = AvatarLipSync.plan(text: "I went to the market and bought bread.", course: .english, duration: 4)
        var t = 0.0
        while t < 4 {
            XCTAssertEqual(plan.brows(at: t), .neutral)
            t += 0.05
        }
    }
}
