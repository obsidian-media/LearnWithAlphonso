import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class AccountClientTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> AccountClient {
        AccountClient(baseURL: baseURL, accessToken: { "user-access-token" }, requester: response)
    }

    // MARK: - exportMyData

    func testExportMyDataPostsWithBearerTokenAndReturnsTheRawBody() async throws {
        var captured: URLRequest?
        let payload = try! JSONSerialization.data(withJSONObject: [
            "exported_at": "2026-09-25T00:00:00.000Z",
            "user_id": "user-1",
            "review_items": [["item_key": "u1l1:q1"]],
        ])
        let client = makeClient { request in
            captured = request
            return (payload, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let result = try await client.exportMyData()

        XCTAssertEqual(result, payload)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/account-export"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
    }

    func testExportMyDataSurfacesAnAuthError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Unauthorized: Invalid token"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.exportMyData()
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 401, message: "Unauthorized: Invalid token"))
        }
    }

    // MARK: - deleteMyAccount

    func testDeleteMyAccountPostsTheConfirmLiteralWithBearerToken() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["deleted": true])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        try await client.deleteMyAccount()

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/account-delete"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["confirm"] as? String, "DELETE")
    }

    func testDeleteMyAccountSurfacesAServerError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Something went wrong"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
        }

        do {
            try await client.deleteMyAccount()
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 500, message: "Something went wrong"))
        }
    }

    // MARK: - linkAppleAuthorization

    func testLinkAppleAuthorizationPostsTheCodeWithBearerToken() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["linked": true])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        try await client.linkAppleAuthorization(code: "c-123")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/apple-link"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["authorizationCode"] as? String, "c-123")
    }

    /// The server answers 200 with {linked:false, reason:"not-configured"}
    /// when Apple's secrets aren't set (see project memory: currently
    /// always) -- that's a success from this client's perspective (2xx,
    /// no throw), which is exactly what lets the caller fire-and-forget
    /// this without inspecting the body at all.
    func testLinkAppleAuthorizationDoesNotThrowWhenNotConfigured() async throws {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["linked": false, "reason": "not-configured"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await client.linkAppleAuthorization(code: "c-123")
    }

    func testLinkAppleAuthorizationSurfacesAServerError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Unauthorized"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }
        do {
            try await client.linkAppleAuthorization(code: "c-123")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 401, message: "Unauthorized"))
        }
    }

    // MARK: - linkHectorAccount

    func testLinkHectorAccountPostsTheCloudVoiceUserIDWithBearerToken() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let body = try! JSONSerialization.data(withJSONObject: ["linked": true])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        try await client.linkHectorAccount(cloudVoiceUserID: "cv-user-1")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/hector-link"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["cloudVoiceUserId"] as? String, "cv-user-1")
    }

    func testLinkHectorAccountSurfacesAServerError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "bad-request"])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!)
        }
        do {
            try await client.linkHectorAccount(cloudVoiceUserID: "cv-user-1")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 400, message: "bad-request"))
        }
    }
}
