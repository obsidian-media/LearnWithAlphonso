import XCTest
// URLResponse/HTTPURLResponse live in FoundationNetworking on non-Apple
// platforms, and this suite runs on Windows -- same guard the client itself
// and every other networking file in this package already use.
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

@testable import LearnWithAlphonsoKit

/// `gradeTranslation` is the one client method that returns nil instead of
/// throwing, because there is no useful way for a player to handle a thrown
/// error except to treat it as a wrong answer -- and being offline is not
/// evidence about the learner's English.
final class TranslationGradingClientTests: XCTestCase {
    private func client(
        _ requester: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> AIConversationClient {
        AIConversationClient(
            baseURL: URL(string: "https://example.com")!,
            accessToken: { "test-token" },
            requester: requester)
    }

    private func response(_ status: Int) -> URLResponse {
        // The nils need explicit types: corelibs-foundation's initialiser is
        // generic enough that inference has nothing to go on.
        HTTPURLResponse(
            url: URL(string: "https://example.com/api/grade-translation")!,
            statusCode: status,
            httpVersion: nil as String?,
            headerFields: nil as [String: String]?)!
    }

    func testReadsAVerdict() async {
        let c = client { _ in
            (Data(#"{"correct": true, "reason": "Same meaning."}"#.utf8), self.response(200))
        }
        let verdict = await c.gradeTranslation(
            lessonId: "a1p25l1", questionId: "a1p25q0", submission: "morning to you", course: "en")
        XCTAssertEqual(verdict, TranslationVerdict(correct: true, reason: "Same meaning."))
    }

    func testReadsAVerdictWithNoReason() async {
        let c = client { _ in (Data(#"{"correct": false}"#.utf8), self.response(200)) }
        let verdict = await c.gradeTranslation(
            lessonId: "a1p25l1", questionId: "a1p25q0", submission: "nonsense", course: "en")
        XCTAssertEqual(verdict, TranslationVerdict(correct: false, reason: nil))
    }

    func testReturnsNilOnANonSuccessStatus() async {
        let c = client { _ in (Data(), self.response(500)) }
        let verdict = await c.gradeTranslation(
            lessonId: "a1p25l1", questionId: "a1p25q0", submission: "anything", course: "en")
        XCTAssertNil(verdict)
    }

    func testReturnsNilRatherThanThrowingWhenTheRequestFails() async {
        struct Offline: Error {}
        let c = client { _ in throw Offline() }
        let verdict = await c.gradeTranslation(
            lessonId: "a1p25l1", questionId: "a1p25q0", submission: "anything", course: "en")
        XCTAssertNil(verdict)
    }

    func testReturnsNilWhenTheBodyHasNoVerdictInIt() async {
        let c = client { _ in (Data(#"{"reason": "hmm"}"#.utf8), self.response(200)) }
        let verdict = await c.gradeTranslation(
            lessonId: "a1p25l1", questionId: "a1p25q0", submission: "anything", course: "en")
        XCTAssertNil(verdict)
    }
}
