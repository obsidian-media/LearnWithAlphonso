import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import LearnWithAlphonsoKit

final class SubscriptionLoginTests: XCTestCase {
    private let base = URL(string: "https://learn.example")!
    private let account = "00000000-0000-4000-8000-000000000001"
    private let sub = "sub_0123456789abcdef0123456789abcdef"

    private func answer(_ status: Int, _ json: String) -> SubscriptionLogin.Requester {
        { request in
            (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    func testLogsInWithTheServersSubscriptionIdentifier() async {
        let id = await SubscriptionLogin.resolve(
            baseURL: base, accountID: account, accessToken: "t", requester: answer(200, #"{"appUserId":"\#(sub)"}"#))
        XCTAssertEqual(id, sub)
    }

    func testKeepsTheAccountIdWhenTheServerSaysSo() async {
        let id = await SubscriptionLogin.resolve(
            baseURL: base, accountID: account, accessToken: "t", requester: answer(200, #"{"appUserId":"\#(account)"}"#))
        XCTAssertEqual(id, account)
    }

    func testAnyFailureFallsBackToTheAccountId() async {
        let outage = await SubscriptionLogin.resolve(
            baseURL: base, accountID: account, accessToken: "t", requester: answer(503, #"{"error":"x"}"#))
        XCTAssertEqual(outage, account)
        let offline = await SubscriptionLogin.resolve(baseURL: base, accountID: account, accessToken: "t") { _ in
            throw URLError(.notConnectedToInternet)
        }
        XCTAssertEqual(offline, account)
        let noToken = await SubscriptionLogin.resolve(
            baseURL: base, accountID: account, accessToken: nil, requester: answer(200, #"{"appUserId":"\#(sub)"}"#))
        XCTAssertEqual(noToken, account)
    }

    func testNeverUsesAnUnexpectedId() async {
        for bad in ["someone-else", "sub_XYZ", "sub_0123", "$RCAnonymousID:abc", ""] {
            let id = await SubscriptionLogin.resolve(
                baseURL: base, accountID: account, accessToken: "t", requester: answer(200, #"{"appUserId":"\#(bad)"}"#))
            XCTAssertEqual(id, account, bad)
        }
    }

    func testSendsTheSessionToTheSubscriptionLoginRoute() async {
        let box = RequestBox()
        _ = await SubscriptionLogin.resolve(baseURL: base, accountID: account, accessToken: "tok") { request in
            await box.set(request)
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
        }
        let request = await box.request
        XCTAssertEqual(request?.url?.absoluteString, "https://learn.example/api/subscription-login")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }
}

private actor RequestBox {
    var request: URLRequest?
    func set(_ value: URLRequest) { request = value }
}
