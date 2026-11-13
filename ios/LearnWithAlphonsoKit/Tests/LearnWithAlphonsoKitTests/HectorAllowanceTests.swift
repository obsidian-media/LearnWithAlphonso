import XCTest
@testable import LearnWithAlphonsoKit

/// BACKLOG 0.0-bq #5. The same cases as src/lib/hector-allowance.test.ts. The limit comes from the server; nothing
/// here pins a number the app holds.
final class HectorAllowanceTests: XCTestCase {
    func testNoRowIsNotUsedUp() {
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: [], limit: 150))
    }

    func testOneShortOfTheLimitStillAllowsTheTurn() {
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: [149], limit: 150))
    }

    func testAtAndPastTheLimitIsUsedUpWhateverTheServerSays() {
        XCTAssertTrue(HectorAllowance.isUsedUp(counts: [150], limit: 150))
        XCTAssertTrue(HectorAllowance.isUsedUp(counts: [153], limit: 150))
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: [150], limit: 200))
        XCTAssertTrue(HectorAllowance.isUsedUp(counts: [40], limit: 40))
    }

    func testWithNoLimitFromTheServerNothingIsUsedUp() {
        XCTAssertFalse(HectorAllowance.isUsedUp(counts: [99_999], limit: nil))
    }

    func testTheLimitIsReadFromTheAppConfigAnswerOnlyWhenItIsAPositiveWholeNumber() {
        func limit(_ json: String) -> Int? { HectorAllowance.limit(from: Data(json.utf8)) }
        XCTAssertEqual(limit(#"{"limits":{"hectorDaily":150}}"#), 150)
        XCTAssertEqual(limit(#"{"ios":{},"limits":{"hectorDaily":120}}"#), 120)
        for bad in ["{}", #"{"limits":{}}"#, #"{"limits":{"hectorDaily":0}}"#, #"{"limits":{"hectorDaily":-3}}"#,
                    #"{"limits":{"hectorDaily":1.5}}"#, #"{"limits":{"hectorDaily":"150"}}"#, "nope"] {
            XCTAssertNil(limit(bad), bad)
        }
    }

    func testFetchLimitAsksAppConfigAndFailsOpen() async {
        final class Box: @unchecked Sendable { var url = "" }
        let box = Box()
        let ok: HectorAllowance.Requester = { request in
            box.url = request.url!.absoluteString
            let body = Data(#"{"limits":{"hectorDaily":150}}"#.utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let base = URL(string: "https://example.test")!
        let got = await HectorAllowance.fetchLimit(baseURL: base, requester: ok)
        XCTAssertEqual(got, 150)
        XCTAssertEqual(box.url, "https://example.test/api/app-config")
        let server500: HectorAllowance.Requester = { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
        }
        let failed = await HectorAllowance.fetchLimit(baseURL: base, requester: server500)
        XCTAssertNil(failed)
        let offline: HectorAllowance.Requester = { _ in throw URLError(.notConnectedToInternet) }
        let offlineLimit = await HectorAllowance.fetchLimit(baseURL: base, requester: offline)
        XCTAssertNil(offlineLimit)
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
