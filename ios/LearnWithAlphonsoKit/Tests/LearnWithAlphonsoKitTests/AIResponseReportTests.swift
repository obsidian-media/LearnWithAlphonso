import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class AIResponseReportTests: XCTestCase {
    func testReportInsertsAnAIResponseRowWithTheMessageInContext() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = ProgressSyncClient(
            supabaseURL: URL(string: "https://example.supabase.co")!, anonKey: "pk", accessToken: "tok"
        ) { request in
            captured.value = request
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
        }
        let report = AIResponseReport(
            message: String(repeating: "x", count: 5000), surface: .conversation, course: "en",
            reason: .harmful, scenarioID: "coffee")
        try await client.reportAIResponse(report)

        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/content_reports"))
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "return=minimal")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["kind"] as? String, "ai_response")
        XCTAssertEqual(body["reason"] as? String, "ai_harmful")
        XCTAssertNil(body["reported"], "an AI message has no reported user (reported IS NULL for ai_response)")
        let context = try XCTUnwrap(body["context"] as? [String: Any])
        XCTAssertEqual((context["message"] as? String)?.count, AIResponseReport.maxMessageLength)
        XCTAssertEqual(context["surface"] as? String, "conversation")
        XCTAssertEqual(context["course"] as? String, "en")
        XCTAssertEqual(context["scenario_id"] as? String, "coffee")
        XCTAssertEqual(context["platform"] as? String, "ios")
    }

    func testTheCapIsTheSameAsTheWeb() {
        XCTAssertEqual(AIResponseReport.maxMessageLength, 2500)
    }

    func testTheMessageIsCutByCodePointNeverInsideAnEmoji() {
        let report = AIResponseReport(
            message: String(repeating: "\u{1F600}", count: 2600), surface: .hector, course: "en", reason: .other)
        // Every kept character is a whole emoji, and the stored text stays far below the database's 8192-byte limit.
        XCTAssertTrue(report.message.unicodeScalars.allSatisfy { $0 == "\u{1F600}" })
        XCTAssertLessThanOrEqual(report.message.utf8.count, 6000)
        XCTAssertLessThanOrEqual(report.message.unicodeScalars.count, AIResponseReport.maxMessageLength)
    }

    func testAShortMessageIsKeptWhole() {
        let report = AIResponseReport(message: "Bonjour, ca va ?", surface: .campaign, course: "fr", reason: .incorrect,
                                      campaignID: "city-day", sceneIndex: 1)
        XCTAssertEqual(report.message, "Bonjour, ca va ?")
    }

    func testReasonsMatchTheWebCodes() {
        XCTAssertEqual(
            AIResponseReportReason.allCases.map(\.rawValue),
            ["ai_inappropriate", "ai_harmful", "ai_incorrect", "ai_other"])
    }
}
