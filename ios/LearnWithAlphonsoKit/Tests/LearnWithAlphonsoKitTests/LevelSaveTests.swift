import XCTest
@testable import LearnWithAlphonsoKit

private struct Offline: Error {}

/// Counts across the async closures (a plain captured var cannot be mutated from them).
private final class Counter: @unchecked Sendable {
    var tries = 0
    var pauses: [Int] = []
}

final class LevelSaveTests: XCTestCase {
    func testAFailingSaveIsRetriedThenReportsSavedWhenItLands() async {
        let c = Counter()
        let saved = await LevelSave.run(pause: { c.pauses.append($0) }) {
            c.tries += 1
            if c.tries < 3 { throw Offline() }
        }
        XCTAssertTrue(saved)
        XCTAssertEqual(c.tries, 3)
        XCTAssertEqual(c.pauses, [1, 2])
    }

    func testASaveThatNeverLandsStopsAfterThreeTriesWithNoPauseAfterTheLast() async {
        let c = Counter()
        let saved = await LevelSave.run(pause: { c.pauses.append($0) }) {
            c.tries += 1
            throw Offline()
        }
        XCTAssertFalse(saved)
        XCTAssertEqual(c.tries, LevelSave.attempts)
        XCTAssertEqual(c.pauses, [1, 2])
    }

    func testASaveThatLandsFirstTimeIsTriedOnce() async {
        let c = Counter()
        let saved = await LevelSave.run(pause: { _ in XCTFail("no pause expected") }) { c.tries += 1 }
        XCTAssertTrue(saved)
        XCTAssertEqual(c.tries, 1)
    }
}
