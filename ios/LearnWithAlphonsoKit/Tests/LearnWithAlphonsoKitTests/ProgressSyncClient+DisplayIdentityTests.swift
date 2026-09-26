import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientDisplayIdentityTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!
    private let userID = "11111111-1111-1111-1111-111111111111"

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    func testFetchProfileIdentityDecodesTheRow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["display_name": "Ada", "avatar_seed": "abc12345"]])
        }
        let identity = try await client.fetchProfileIdentity(userID: userID)
        XCTAssertEqual(identity, ProfileIdentity(displayName: "Ada", avatarSeed: "abc12345"))
    }

    func testFetchProfileIdentityReturnsNilWhenNoRowExists() async throws {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: []) }
        let identity = try await client.fetchProfileIdentity(userID: userID)
        XCTAssertNil(identity)
    }

    func testUpdateProfileDisplayNamePatchesTheRow() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }
        try await client.updateProfileDisplayName("Grace", userID: userID)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertTrue(request.url!.absoluteString.contains("id=eq.\(userID)"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["display_name"] as? String, "Grace")
    }

    func testUpdateProfileAvatarSeedPatchesTheRow() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [String: String]())
        }
        try await client.updateProfileAvatarSeed("deadbeef", userID: userID)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "PATCH")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["avatar_seed"] as? String, "deadbeef")
    }
}
