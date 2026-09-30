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
        let captured = TestCapture<URLRequest?>(nil)
        let payload = try! JSONSerialization.data(withJSONObject: [
            "exported_at": "2026-09-25T00:00:00.000Z",
            "user_id": "user-1",
            "review_items": [["item_key": "u1l1:q1"]],
        ])
        let client = makeClient { request in
            captured.value = request
            return (payload, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        let result = try await client.exportMyData()

        XCTAssertEqual(result, payload)
        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["deleted": true])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        try await client.deleteMyAccount()

        let request = try XCTUnwrap(captured.value)
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
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["linked": true])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }

        try await client.linkAppleAuthorization(code: "c-123")

        let request = try XCTUnwrap(captured.value)
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


    // MARK: - 401 retry (linkAppleAuthorization only --
    // see AIConversationClient's own "401 retry" tests for the shared
    // root cause this works around).

    func testLinkAppleAuthorizationRetriesOnceAfter401WithARefreshedToken() async throws {
        let capturedAuthHeaders = TestCapture<[String?]>([])
        let callCount = TestCapture(0)
        let client = AccountClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                callCount.value += 1
                capturedAuthHeaders.value.append(request.value(forHTTPHeaderField: "Authorization"))
                if callCount.value == 1 {
                    return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
                }
                let body = try! JSONSerialization.data(withJSONObject: ["linked": true])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )

        try await client.linkAppleAuthorization(code: "c-123")

        XCTAssertEqual(callCount.value, 2)
        XCTAssertEqual(capturedAuthHeaders.value, ["Bearer stale-token", "Bearer fresh-token"])
    }

    func testLinkAppleAuthorizationDoesNotRetryWhenNoRefreshHandlerIsProvided() async {
        let callCount = TestCapture(0)
        let client = makeClient { request in
            callCount.value += 1
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }

        do {
            try await client.linkAppleAuthorization(code: "c-123")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 401, message: nil))
        }
        XCTAssertEqual(callCount.value, 1)
    }

    // Pre-submission audit (2026-09-29): export and delete now get the
    // same one-retry-after-401 as linkAppleAuthorization. Deletion is the
    // one screen an App Store reviewer always exercises, usually last,
    // after the session's first access token has long expired.
    func testExportMyDataRetriesOnceAfter401WithARefreshedToken() async throws {
        let capturedAuthHeaders = TestCapture<[String?]>([])
        let client = AccountClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                capturedAuthHeaders.value.append(request.value(forHTTPHeaderField: "Authorization"))
                let status = capturedAuthHeaders.value.count == 1 ? 401 : 200
                return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        )

        _ = try await client.exportMyData()

        XCTAssertEqual(capturedAuthHeaders.value, ["Bearer stale-token", "Bearer fresh-token"])
    }

    func testDeleteMyAccountRetriesOnceAfter401WithARefreshedToken() async throws {
        let captured = TestCapture<[(auth: String?, body: Data?)]>([])
        let client = AccountClient(
            baseURL: baseURL,
            accessToken: { "stale-token" },
            refreshAccessToken: { "fresh-token" },
            requester: { request in
                captured.value.append((request.value(forHTTPHeaderField: "Authorization"), request.httpBody))
                let status = captured.value.count == 1 ? 401 : 200
                return (Data("{\"deleted\":true}".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        )

        try await client.deleteMyAccount()

        XCTAssertEqual(captured.value.map(\.auth), ["Bearer stale-token", "Bearer fresh-token"])
        // The retry must still carry the DELETE confirmation -- the server
        // rejects a deletion without it.
        let retryBody = try XCTUnwrap(captured.value.last?.body)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: retryBody) as? [String: String])
        XCTAssertEqual(json["confirm"], "DELETE")
    }

    func testExportMyDataDoesNotRetryOn401WhenNoRefreshHandlerIsProvided() async {
        let callCount = TestCapture(0)
        let client = makeClient { request in
            callCount.value += 1
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }

        do {
            _ = try await client.exportMyData()
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? AccountError, .server(status: 401, message: nil))
        }
        XCTAssertEqual(callCount.value, 1)
    }
}
