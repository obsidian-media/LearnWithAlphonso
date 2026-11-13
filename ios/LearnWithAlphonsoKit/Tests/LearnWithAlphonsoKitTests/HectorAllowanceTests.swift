import XCTest
@testable import LearnWithAlphonsoKit

/// BACKLOG 0.0-bq #5. The same cases as src/lib/hector-allowance.test.ts.
final class HectorAllowanceTests: XCTestCase {
    func testNoRowIsNotUsedUp() {
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: []))
    }

    func testOneShortOfTheLimitStillAllowsTheTurn() {
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: [HectorAllowance.dailyLimit - 1]))
    }

    func testAtAndPastTheLimitIsUsedUp() {
        XCTAssertTrue(HectorAllowance.isUsedUp(counts: [HectorAllowance.dailyLimit]))
        XCTAssertTrue(HectorAllowance.isUsedUp(counts: [HectorAllowance.dailyLimit + 3]))
    }

    func testTheLimitMatchesTheDatabase() {
        XCTAssertEqual(HectorAllowance.dailyLimit, 150)
    }

    func testTheDayIsTheUTCDate() {
        let f = ISO8601DateFormatter()
        XCTAssertEqual(HectorAllowance.utcDay(f.date(from: "2026-11-12T23:59:59Z")!), "2026-11-12")
        XCTAssertEqual(HectorAllowance.utcDay(f.date(from: "2026-11-13T00:00:00Z")!), "2026-11-13")
    }

    func testOutForTodayIsTheServersQuotaCopy() {
        XCTAssertEqual(HectorAllowance.outForToday, TutorError.quotaExceeded(resetsAt: nil).userMessage())
    }
}
