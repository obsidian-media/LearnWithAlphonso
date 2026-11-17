import XCTest
@testable import LearnWithAlphonsoKit

/// The same cases as src/lib/ai-usage-view.test.ts: the states, the clamp, hide-on-unknown, the reset date, no dollars.
final class AiUsageTests: XCTestCase {
    private let reset = "2026-12-01T00:00:00.000Z"

    private func view(_ json: String) -> AiUsageView? { AiUsage.parse(data: Data(json.utf8)) }

    func testEachKnownStateGetsItsWordAndThePercentIsClamped() {
        let ok = view(#"{"state":"ok","percentUsed":37,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)
        XCTAssertEqual(ok?.percent, 37)
        XCTAssertEqual(ok?.label, "Plenty left")
        XCTAssertEqual(ok?.resetLine, "Resets on 1 December")
        XCTAssertEqual(ok?.valueText, "37 percent used, plenty left")
        XCTAssertEqual(view(#"{"state":"warn","percentUsed":85,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)?.label, "Getting close")
        XCTAssertEqual(view(#"{"state":"ok","percentUsed":250,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)?.percent, 100)
        XCTAssertEqual(view(#"{"state":"ok","percentUsed":-4,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)?.percent, 0)
        XCTAssertEqual(view(#"{"state":"ok","percentUsed":37.9,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)?.percent, 37)
    }

    func testACappedLearnerIsAlwaysAtTheEndOfTheMeter() {
        let v = view(#"{"state":"capped","percentUsed":0,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)
        XCTAssertEqual(v?.percent, 100)
        XCTAssertEqual(v?.label, "Limit reached")
    }

    func testUnknownAndAnythingMalformedIsNilSoTheCardDrawsNothing() {
        for bad in [
            #"{"state":"unknown","percentUsed":0,"resetsAt":"2026-12-01T00:00:00.000Z"}"#,
            #"{"state":"okay","percentUsed":10,"resetsAt":"2026-12-01T00:00:00.000Z"}"#,
            #"{"state":"ok","percentUsed":"10","resetsAt":"2026-12-01T00:00:00.000Z"}"#,
            #"{"state":"ok","percentUsed":true,"resetsAt":"2026-12-01T00:00:00.000Z"}"#,
            #"{"state":"ok"}"#, #"{"error":"x"}"#, "null", #""ok""#, "42", "not json", "",
        ] {
            XCTAssertNil(view(bad), bad)
        }
    }

    func testResetLineUsesTheUtcDayAndFallsBackWhenTheInstantIsUnreadable() {
        XCTAssertEqual(AiUsage.resetDateLabel("2026-12-01T00:00:00Z"), "1 December")
        XCTAssertEqual(AiUsage.resetDateLabel("2027-01-01T00:00:00.000Z"), "1 January")
        XCTAssertEqual(AiUsage.resetDateLabel("2026-03-31T23:59:59.999Z"), "31 March")
        XCTAssertNil(AiUsage.resetDateLabel("soon"))
        XCTAssertEqual(view(#"{"state":"ok","percentUsed":1,"resetsAt":"soon"}"#)?.resetLine,
                       "Resets at the start of next month")
        XCTAssertEqual(view(#"{"state":"ok","percentUsed":1}"#)?.resetLine, "Resets at the start of next month")
    }

    func testTheNoteSaysLessonsStillWorkOnlyWhenNotOk() {
        let ok = view(#"{"state":"ok","percentUsed":1,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)
        let warn = view(#"{"state":"warn","percentUsed":90,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)
        let capped = view(#"{"state":"capped","percentUsed":100,"resetsAt":"2026-12-01T00:00:00.000Z"}"#)
        XCTAssertFalse(ok!.summary.contains("Lessons and review always work."))
        XCTAssertTrue(warn!.summary.contains("Lessons and review always work."))
        XCTAssertEqual(capped?.summary, "AI practice is paused for now. Lessons and review always work. Resets on 1 December.")
    }

    func testNoDollarsOrMoneyWordsAnywhereInWhatTheLearnerSees() {
        var shown = [AiUsageCopy.title, AiUsageCopy.explain, AiUsageCopy.stillWorks, AiUsageCopy.resetFallback]
        for state in ["ok", "warn", "capped"] {
            // Even if a future route sent a dollar field, the view has nowhere to carry it.
            let json = #"{"state":"\#(state)","percentUsed":50,"costUsd":4.2,"capUsd":5,"resetsAt":"2026-12-01T00:00:00.000Z"}"#
            let v = view(json)!
            shown += [v.label, v.message, v.valueText, v.resetLine, v.summary]
        }
        for text in shown {
            XCTAssertNil(text.range(of: #"[$€£]|\bdollar|\bUSD\b|\bcost\b|\bprice\b"#, options: [.regularExpression, .caseInsensitive]), text)
        }
    }

    func testFetchIsNilOnAnyFailureAndRetriesOnceAfterA401() async {
        let base = URL(string: "https://example.test")!
        func response(_ code: Int) -> HTTPURLResponse {
            HTTPURLResponse(url: base, statusCode: code, httpVersion: nil, headerFields: nil)!
        }
        let good = Data(#"{"state":"warn","percentUsed":90,"resetsAt":"2026-12-01T00:00:00Z"}"#.utf8)
        let ok = await AiUsage.fetch(baseURL: base, accessToken: { "t" }, requester: { r in
            XCTAssertEqual(r.url?.path, "/api/ai-usage")
            XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer t")
            return (good, response(200))
        })
        XCTAssertEqual(ok?.state, .warn)
        let server = await AiUsage.fetch(baseURL: base, accessToken: { "t" }, requester: { _ in (good, response(500)) })
        XCTAssertNil(server)
        let offline = await AiUsage.fetch(baseURL: base, accessToken: { "t" }, requester: { _ in throw URLError(.notConnectedToInternet) })
        XCTAssertNil(offline)
        let unknown = await AiUsage.fetch(baseURL: base, accessToken: { "t" }, requester: { _ in
            (Data(#"{"state":"unknown","percentUsed":0}"#.utf8), response(200))
        })
        XCTAssertNil(unknown)
        let retried = await AiUsage.fetch(baseURL: base, accessToken: { "old" }, refreshAccessToken: { "new" }, requester: { r in
            r.value(forHTTPHeaderField: "Authorization") == "Bearer new" ? (good, response(200)) : (Data(), response(401))
        })
        XCTAssertEqual(retried?.percent, 90)
    }
}
