import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class SupabaseAuthClientTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> SupabaseAuthClient {
        SupabaseAuthClient(supabaseURL: supabaseURL, publishableKey: "publishable-key", requester: response)
    }

    private func response(for url: URL, body: [String: Any], status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    // MARK: - requestEmailOTP

    func testRequestEmailOTPPostsToTheCorrectEndpointWithTheApiKeyHeader() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.response(for: request.url!, body: [:])
        }

        try await client.requestEmailOTP(email: "learner@example.com")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.url?.absoluteString, "https://example.supabase.co/auth/v1/otp")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")

        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["email"] as? String, "learner@example.com")
        XCTAssertEqual(payload["create_user"] as? Bool, true)
    }

    func testRequestEmailOTPThrowsOnAServerError() async {
        let client = makeClient { request in
            self.response(for: request.url!, body: ["msg": "rate limited"], status: 429)
        }

        do {
            try await client.requestEmailOTP(email: "learner@example.com")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? SupabaseAuthError, .server(status: 429, message: "rate limited"))
        }
    }

    // MARK: - verifyEmailOTP

    func testVerifyEmailOTPPostsTheCodeAndDecodesARealSession() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.response(for: request.url!, body: [
                "access_token": "at-1", "refresh_token": "rt-1", "expires_in": 3600,
            ])
        }

        let session = try await client.verifyEmailOTP(email: "learner@example.com", code: "123456")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.url?.absoluteString, "https://example.supabase.co/auth/v1/verify")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["email"] as? String, "learner@example.com")
        XCTAssertEqual(payload["token"] as? String, "123456")
        XCTAssertEqual(payload["type"] as? String, "email")

        XCTAssertEqual(session.accessToken, "at-1")
        XCTAssertEqual(session.refreshToken, "rt-1")
        XCTAssertGreaterThan(session.expiresAt.timeIntervalSinceNow, 3500)
    }

    func testVerifyEmailOTPThrowsOnAnInvalidCode() async {
        let client = makeClient { request in
            self.response(for: request.url!, body: ["msg": "Token has expired or is invalid"], status: 403)
        }

        do {
            _ = try await client.verifyEmailOTP(email: "learner@example.com", code: "000000")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? SupabaseAuthError, .server(status: 403, message: "Token has expired or is invalid"))
        }
    }

    // MARK: - refresh

    func testRefreshPostsTheRefreshTokenAndDecodesANewSession() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.response(for: request.url!, body: [
                "access_token": "at-2", "refresh_token": "rt-2", "expires_in": 3600,
            ])
        }

        let oldSession = SupabaseSession(accessToken: "at-1", refreshToken: "rt-1", expiresAt: Date())
        let newSession = try await client.refresh(oldSession)

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.url?.absoluteString, "https://example.supabase.co/auth/v1/token?grant_type=refresh_token")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["refresh_token"] as? String, "rt-1")

        XCTAssertEqual(newSession.accessToken, "at-2")
        XCTAssertEqual(newSession.refreshToken, "rt-2")
    }

    func testRefreshThrowsWhenTheRefreshTokenIsRejected() async {
        let client = makeClient { request in
            self.response(for: request.url!, body: ["msg": "Invalid Refresh Token"], status: 401)
        }
        let oldSession = SupabaseSession(accessToken: "at-1", refreshToken: "rt-1", expiresAt: Date())

        do {
            _ = try await client.refresh(oldSession)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? SupabaseAuthError, .server(status: 401, message: "Invalid Refresh Token"))
        }
    }
}
