import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class DeviceEnrollmentClientTests: XCTestCase {
    private let respondEndpoint = URL(string: "https://voice.obsidianmedia.online/v1/voice/respond")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> DeviceEnrollmentClient {
        DeviceEnrollmentClient(respondEndpoint: respondEndpoint, requester: response)
    }

    func testEnrollPostsToTheDerivedEnrollEndpointWithDeviceIdAndAuth() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(), response)
        }

        try await client.enroll(deviceID: "device-1", displayName: "iPhone", accessToken: "token-1")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url!.absoluteString, "https://voice.obsidianmedia.online/v1/voice/devices/enroll")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token-1")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["device_id"] as? String, "device-1")
        XCTAssertEqual(payload["display_name"] as? String, "iPhone")
    }

    func testEnrollThrowsAReadableErrorOnFailure() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["detail": "This device is not permitted to enroll"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            try await client.enroll(deviceID: "device-1", displayName: "iPhone", accessToken: "token-1")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? DeviceEnrollmentError, .server(status: 403, message: "This device is not permitted to enroll"))
        }
    }
}
