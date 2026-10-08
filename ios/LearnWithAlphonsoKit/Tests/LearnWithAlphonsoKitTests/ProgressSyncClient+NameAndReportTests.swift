import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientNameAndReportTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(_ respond: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: respond)
    }

    private func response(_ url: URL, _ body: Data, status: Int = 200) -> (Data, URLResponse) {
        (body, HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private func json(_ request: URLRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]) ?? [:]
    }

    func testConfirmDisplayNameCallsTheRPCAndReturnsTheStoredName() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/confirm_display_name")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
            XCTAssertEqual(self.json(request)["_name"] as? String, "  Ana  Lima ")
            return self.response(request.url!, Data("\"Ana Lima\"".utf8))
        }
        let stored = try await client.confirmDisplayName("  Ana  Lima ")
        XCTAssertEqual(stored, "Ana Lima")
    }

    func testConfirmDisplayNameSurfacesTheServerCode() async {
        let client = makeClient { request in
            self.response(request.url!, Data(#"{"code":"P0001","message":"blocked-content"}"#.utf8), status: 400)
        }
        do {
            _ = try await client.confirmDisplayName("Ｆｕｃｋ")
            XCTFail("a refused name must throw")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "blocked-content"))
            XCTAssertEqual(SocialReasonCopy.nameSaveMessage(for: error), Copy.nameNotAllowed)
        }
    }

    func testReportTeamNameSendsKindAndContextNotAReasonPrefix() async throws {
        let calls = CallLog()
        let client = makeClient { request in
            await calls.append(request)
            if request.url?.path == "/rest/v1/teams" {
                return self.response(request.url!, Data(#"[{"created_by":"creator-1"}]"#.utf8))
            }
            return self.response(request.url!, Data(), status: 201)
        }
        let filed = try await client.reportTeamName(teamID: "team-9", reason: "inappropriate_content")
        XCTAssertTrue(filed)
        let lastRequest = await calls.last
        let insert = try XCTUnwrap(lastRequest)
        XCTAssertEqual(insert.url?.path, "/rest/v1/content_reports")
        let body = json(insert)
        XCTAssertEqual(body["reported"] as? String, "creator-1")
        XCTAssertEqual(body["reason"] as? String, "inappropriate_content")
        XCTAssertEqual(body["kind"] as? String, "team_name")
        XCTAssertEqual((body["context"] as? [String: Any])?["team_id"] as? String, "team-9")
    }
}

private actor CallLog {
    private(set) var requests: [URLRequest] = []
    func append(_ request: URLRequest) { requests.append(request) }
    var last: URLRequest? { requests.last }
}
