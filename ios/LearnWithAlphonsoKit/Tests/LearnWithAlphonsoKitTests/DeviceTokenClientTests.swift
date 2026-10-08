import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class DeviceTokenClientTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(_ respond: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: respond)
    }

    private func reply(_ request: URLRequest, _ body: String = "", status: Int = 200) -> (Data, URLResponse) {
        (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func testRegisteringClaimsTheTokenThroughTheServerFunction() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.reply(request)
        }
        try await client.registerDeviceToken("apns-hex")
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/rest/v1/rpc/claim_device_token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String])
        XCTAssertEqual(body, ["_token": "apns-hex", "_platform": "ios"])
    }

    func testAFailedClaimSurfacesTheServerError() async {
        let client = makeClient { request in
            self.reply(request, #"{"code":"P0001","message":"unauthenticated"}"#, status: 400)
        }
        do {
            try await client.registerDeviceToken("apns-hex")
            XCTFail("must throw")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "unauthenticated"))
        }
    }

    func testUnregisteringIsBoundedSoAnOfflineSignOutCannotHoldTheNextSignIn() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.reply(request, status: 204)
        }
        try await client.unregisterDeviceToken("apns-hex")
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.timeoutInterval, 8)
    }
}
