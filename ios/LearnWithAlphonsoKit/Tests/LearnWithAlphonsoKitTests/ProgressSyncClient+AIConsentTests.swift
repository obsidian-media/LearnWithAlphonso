import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientAIConsentTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func client(status: Int = 200, body: String, capture: TestCapture<URLRequest?>? = nil) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "pk", accessToken: "tok") { request in
            capture?.value = request
            let http = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), http)
        }
    }

    func testFetchCallsTheRpcAndParsesAPostgresTimestamp() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let date = try await client(body: "\"2026-10-09T10:00:00.123456+00:00\"", capture: captured).fetchAIConsent()
        XCTAssertNotNil(date)
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/get_ai_consent"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }

    func testFetchReturnsNilForNull() async throws {
        let date = try await client(body: "null").fetchAIConsent()
        XCTAssertNil(date)
    }

    func testFetchParsesATimestampWithoutFraction() async throws {
        let date = try await client(body: "\"2026-10-09T10:00:00+00:00\"").fetchAIConsent()
        XCTAssertEqual(date, ISO8601DateFormatter().date(from: "2026-10-09T10:00:00Z"))
    }

    func testSetSendsTheChoice() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        _ = try await client(body: "\"2026-10-09T10:00:00+00:00\"", capture: captured).setAIConsent(true)
        let request = try XCTUnwrap(captured.value)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/set_ai_consent"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body["_granted"] as? Bool, true)
    }

    func testWithdrawReturnsNil() async throws {
        let date = try await client(body: "null").setAIConsent(false)
        XCTAssertNil(date)
    }

    func testServerErrorSurfaces() async {
        do {
            _ = try await client(status: 401, body: "{\"message\":\"JWT expired\"}").fetchAIConsent()
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 401, message: "JWT expired"))
        }
    }

    func testGatewayErrorSurfacesAsAnErrorNotAsNoConsent() async {
        do {
            _ = try await client(status: 503, body: "{\"message\":\"unavailable\"}").fetchAIConsent()
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 503, message: "unavailable"))
        }
    }

    func testGarbageIsInvalidPayload() async {
        do {
            _ = try await client(body: "{\"x\":1}").fetchAIConsent()
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .invalidPayload)
        }
    }
}
