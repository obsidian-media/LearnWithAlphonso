import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientNameOnboardingTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(_ respond: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: respond)
    }

    private func reply(_ request: URLRequest, _ body: String, status: Int = 200) -> (Data, URLResponse) {
        (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func testFetchNameStatusCallsTheOwnRowRPC() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/get_my_name_status")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
            return self.reply(request, #"[{"display_name":"Learner-4F2A","name_confirmed_at":null}]"#)
        }
        let status = try await client.fetchNameStatus()
        XCTAssertEqual(status, NameStatus(displayName: "Learner-4F2A", nameConfirmedAt: nil))
        XCTAssertEqual(status?.needsPrompt, true)
    }

    func testAConfirmedStatusParsesPostgresFractionalSeconds() async throws {
        let client = makeClient { request in
            self.reply(request, #"[{"display_name":"Ana","name_confirmed_at":"2026-10-08T10:00:00.123456+00:00"}]"#)
        }
        let status = try await client.fetchNameStatus()
        XCTAssertNotNil(status?.nameConfirmedAt)
        XCTAssertEqual(status?.needsPrompt, false)
    }

    func testAnUnparseableConfirmationTimestampStillCountsAsConfirmed() async throws {
        // Confirmed is decided by the column holding a value, not by this client understanding its format:
        // a format change must never send a learner who already chose a name back to the prompt.
        let client = makeClient { request in
            self.reply(request, #"[{"display_name":"Ana","name_confirmed_at":"not a timestamp"}]"#)
        }
        let status = try await client.fetchNameStatus()
        XCTAssertEqual(status?.needsPrompt, false)
        XCTAssertNil(status?.nameConfirmedAt)
    }

    func testNoProfileRowIsNil() async throws {
        let client = makeClient { request in self.reply(request, "[]") }
        let status = try await client.fetchNameStatus()
        XCTAssertNil(status)
    }

    func testDisplayNameProblemReturnsTheCodeOrNil() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/display_name_problem")
            let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            let name = body?["_name"] as? String
            return self.reply(request, name == "Shithead" ? #""blocked-content""# : "null")
        }
        let blocked = try await client.displayNameProblem("Shithead")
        let fine = try await client.displayNameProblem("Furaha")
        XCTAssertEqual(blocked, "blocked-content")
        XCTAssertNil(fine)
    }

    func testSkipReturnsTheStoredHandle() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/skip_display_name_prompt")
            return self.reply(request, #""Learner-9C0D""#)
        }
        let stored = try await client.skipDisplayNamePrompt()
        XCTAssertEqual(stored, "Learner-9C0D")
    }

    func testAFailedSkipSurfacesTheServerCode() async {
        let client = makeClient { request in
            self.reply(request, #"{"code":"P0001","message":"unauthenticated"}"#, status: 400)
        }
        do {
            _ = try await client.skipDisplayNamePrompt()
            XCTFail("must throw")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "unauthenticated"))
        }
    }
}
