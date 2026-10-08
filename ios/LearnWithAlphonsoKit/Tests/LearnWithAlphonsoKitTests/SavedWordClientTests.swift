import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class SavedWordClientTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    private func client(
        status: Int = 200, json: [String: Any] = [:], raw: Data? = nil,
        capture: TestCapture<URLRequest?>? = nil
    ) -> AIConversationClient {
        // `json` is typed [String: Any] (not Any?) on purpose: a mixed-type
        // dictionary literal such as ["alreadySaved": false, "word": "w"]
        // passed to an `Any?` parameter fails to compile ("heterogeneous
        // collection literal could only be inferred to '[String: Any]'").
        AIConversationClient(baseURL: baseURL, accessToken: { "tok" }, requester: { request in
            capture?.value = request
            let data = raw ?? (try! JSONSerialization.data(withJSONObject: json))
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        })
    }

    func testPostsTheWordSentenceAndCourseWithTheBearerToken() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let c = client(
            json: ["alreadySaved": false, "word": "serendipity", "sentence": "It was serendipity.", "explanation": "x"],
            capture: captured)
        _ = try await c.defineWord(word: "serendipity", sentence: "It was serendipity.", course: "en")

        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/define-word"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: String]
        XCTAssertEqual(payload, ["word": "serendipity", "sentence": "It was serendipity.", "course": "en"])
    }

    func testDecodesANewlySavedWord() async throws {
        let c = client(json: ["alreadySaved": false, "word": "w", "sentence": "s w", "explanation": "\"w\" means x."])
        let result = try await c.defineWord(word: "w", sentence: "s w", course: "en")
        XCTAssertEqual(result, SavedWordResult(alreadySaved: false, word: "w", sentence: "s w", explanation: "\"w\" means x."))
    }

    func testDecodesAnAlreadySavedWord() async throws {
        let c = client(json: ["alreadySaved": true, "word": "w", "sentence": "s w", "explanation": "stored"])
        let result = try await c.defineWord(word: "w", sentence: "s w", course: "en")
        XCTAssertTrue(result.alreadySaved)
    }

    func testMapsEachServerStatusToItsOwnError() async {
        let cases: [(Int, SavedWordError)] = [
            (400, .invalid), (401, .notSignedIn), (403, .notSignedIn),
            (409, .limitReached), (429, .quotaExceeded), (502, .unavailable), (500, .unavailable),
        ]
        for (status, expected) in cases {
            let c = client(status: status, json: ["error": "x"])
            do {
                _ = try await c.defineWord(word: "w", sentence: "w", course: "en")
                XCTFail("status \(status) should throw")
            } catch let error as SavedWordError {
                XCTAssertEqual(error, expected, "status \(status)")
            } catch {
                XCTFail("unexpected error \(error)")
            }
        }
    }

    func testConsentRequiredIsNotASignInProblem() async {
        XCTAssertEqual(SavedWordError.from(status: 403, message: "ai-consent-required"), .aiConsentRequired)
        XCTAssertEqual(SavedWordError.from(status: 403, message: nil), .notSignedIn)
        XCTAssertEqual(SavedWordError.from(status: 503, message: "consent-check-failed"), .unavailable)
        XCTAssertFalse(SavedWordError.aiConsentRequired.userMessage.contains("Sign in"))

        let c = client(status: 403, json: ["error": "ai-consent-required"])
        do {
            _ = try await c.defineWord(word: "w", sentence: "w", course: "en")
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error as? SavedWordError, .aiConsentRequired)
        }
    }

    func testAConsentRefusalAnnouncesItselfSoTheAccountStoreFollows() async {
        let heard = TestCapture<Bool>(false)
        let token = NotificationCenter.default.addObserver(
            forName: AIConsentSignal.requiredNotification, object: nil, queue: nil
        ) { _ in heard.value = true }
        defer { NotificationCenter.default.removeObserver(token) }
        _ = try? await client(status: 403, json: ["error": "ai-consent-required"])
            .defineWord(word: "w", sentence: "w", course: "en")
        XCTAssertTrue(heard.value)

        heard.value = false
        _ = try? await client(status: 503, json: ["error": "consent-check-failed"])
            .defineWord(word: "w", sentence: "w", course: "en")
        XCTAssertFalse(heard.value, "a failed consent read is not a refusal")
    }

    func testAMalformedSuccessBodyIsUnavailableNotACrash() async {
        let c = client(status: 200, raw: Data("not json".utf8))
        do {
            _ = try await c.defineWord(word: "w", sentence: "w", course: "en")
            XCTFail("should throw")
        } catch let error as SavedWordError {
            XCTAssertEqual(error, .unavailable)
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }

    func testASuccessBodyMissingAFieldIsUnavailable() async {
        let c = client(json: ["alreadySaved": false, "word": "w", "sentence": "s w"])  // no explanation
        do {
            _ = try await c.defineWord(word: "w", sentence: "s w", course: "en")
            XCTFail("should throw")
        } catch let error as SavedWordError {
            XCTAssertEqual(error, .unavailable)
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }

    func testEveryErrorHasADistinctNonEmptyMessage() {
        let all: [SavedWordError] = [.invalid, .limitReached, .quotaExceeded, .notSignedIn, .unavailable, .offline]
        let messages = all.map(\.userMessage)
        XCTAssertTrue(messages.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(messages).count, all.count)
    }
}
