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
        XCTAssertLessThanOrEqual(report.message.utf8.count, 8192 - AIResponseReport.contextStructureBytes)
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

    /// What the database measures: the JSON text of the context. Spaces after colons and commas are added generously.
    private func storedContextBytes(_ report: AIResponseReport) throws -> Int {
        let context = try XCTUnwrap(report.jsonObject()["context"] as? [String: Any])
        let data = try JSONSerialization.data(withJSONObject: context)
        // jsonb writes ": " and ", " (one extra byte each) and does not escape "/" (one fewer); count the spaces.
        return data.count + context.count * 2
    }

    func testTheWholeContextStaysUnderTheDatabaseLimitForEscapeHeavyText() throws {
        let samples: [String] = [
            String(repeating: "\"", count: 2600),
            String(repeating: "\n", count: 2600),
            String(repeating: "\"\n\\", count: 900),
            String(repeating: "\u{01}", count: 2600),  // each is six bytes once written as \u0001
            String(repeating: "\u{1F600}", count: 2600),
            "a\u{0301}" + String(repeating: "x", count: 5000),
        ]
        for (index, sample) in samples.enumerated() {
            let report = AIResponseReport(
                message: sample, surface: .conversation, course: "en", reason: .other, scenarioID: "coffee")
            XCTAssertLessThanOrEqual(try storedContextBytes(report), 8192, "sample \(index)")
        }
    }

    func testControlCharactersAreCutByTheirEncodedSizeNotTheirRawOne() {
        let report = AIResponseReport(
            message: String(repeating: "\u{01}", count: 2500), surface: .hector, course: "en", reason: .other)
        // Raw, 2500 of them is 2500 bytes and would pass a raw count; encoded it is 15000.
        XCTAssertLessThan(report.message.unicodeScalars.count, 1400)
    }

    func testLongIdentifiersTakeTheirShareOfTheBudget() throws {
        let report = AIResponseReport(
            message: String(repeating: "\u{1F600}", count: 2500), surface: .campaign, course: "en", reason: .other,
            scenarioID: String(repeating: "s", count: 2000), campaignID: String(repeating: "c", count: 1000),
            sceneIndex: 3)
        XCTAssertLessThanOrEqual(try storedContextBytes(report), 8192)
        XCTAssertGreaterThan(report.message.unicodeScalars.count, 0)
    }
}
