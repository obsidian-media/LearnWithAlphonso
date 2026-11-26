import XCTest
@testable import LearnWithAlphonsoKit

private struct SaveFailure: Error {}

private actor Counter {
    private(set) var calls = 0
    private(set) var waits: [TimeInterval] = []
    func call() -> Int { calls += 1; return calls }
    func wait(_ s: TimeInterval) { waits.append(s) }
}

final class PlacementSaveTests: XCTestCase {
    func testSucceedsOnTheFirstTryWithoutWaiting() async {
        let c = Counter()
        let ok = await PlacementSave.run(sleep: { await c.wait($0) }, operation: { _ = await c.call() })
        XCTAssertTrue(ok)
        let calls = await c.calls
        let waits = await c.waits
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(waits, [])
    }

    func testRetriesAFailureAndReportsSuccess() async {
        let c = Counter()
        let ok = await PlacementSave.run(sleep: { await c.wait($0) }, operation: {
            if await c.call() < 2 { throw SaveFailure() }
        })
        XCTAssertTrue(ok)
        let calls = await c.calls
        XCTAssertEqual(calls, 2)
    }

    func testGivesUpAfterThreeTriesAndReportsFailure() async {
        let c = Counter()
        let ok = await PlacementSave.run(sleep: { await c.wait($0) }, operation: {
            _ = await c.call()
            throw SaveFailure()
        })
        XCTAssertFalse(ok)
        let calls = await c.calls
        let waits = await c.waits
        XCTAssertEqual(calls, 3)
        XCTAssertEqual(waits, [0.6, 1.8])
    }
}
