import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import LearnWithAlphonsoKit

final class AppUpdateGateTests: XCTestCase {
    private let base = URL(string: "https://learn.example")!

    private func body(_ ios: String) -> Data {
        Data(#"{"ios":\#(ios),"android":{"minBuild":null,"storeUrl":null}}"#.utf8)
    }

    private func responder(_ status: Int, _ data: Data) -> AppUpdateGate.Requester {
        { request in
            (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    func testOnlyAKnownBuildBelowASetMinimumNeedsAnUpdate() {
        XCTAssertTrue(AppUpdateGate.needsUpdate(currentBuild: 58, minBuild: 59))
        XCTAssertFalse(AppUpdateGate.needsUpdate(currentBuild: 59, minBuild: 59))
        XCTAssertFalse(AppUpdateGate.needsUpdate(currentBuild: 60, minBuild: 59))
        XCTAssertFalse(AppUpdateGate.needsUpdate(currentBuild: 58, minBuild: nil))
        XCTAssertFalse(AppUpdateGate.needsUpdate(currentBuild: nil, minBuild: 59))
    }

    func testReadsTheBuildNumberFromCFBundleVersion() {
        XCTAssertEqual(AppUpdateGate.build(fromBundleVersion: "58"), 58)
        XCTAssertNil(AppUpdateGate.build(fromBundleVersion: "1.0.3"))
        XCTAssertNil(AppUpdateGate.build(fromBundleVersion: ""))
        XCTAssertNil(AppUpdateGate.build(fromBundleVersion: nil))
    }

    func testOffByDefault() async {
        let r = await AppUpdateGate.check(
            baseURL: base, currentBuild: 1, requester: responder(200, body(#"{"minBuild":null,"storeUrl":null}"#)))
        XCTAssertNil(r)
    }

    func testABuildBelowTheMinimumIsSentToTheStore() async {
        let r = await AppUpdateGate.check(
            baseURL: base, currentBuild: 58,
            requester: responder(200, body(#"{"minBuild":59,"storeUrl":"https://apps.apple.com/app/id1"}"#)))
        XCTAssertEqual(r, .init(storeURL: URL(string: "https://apps.apple.com/app/id1")))
    }

    func testANonHttpsStoreLinkIsDroppedButTheGateStillHolds() async {
        let r = await AppUpdateGate.check(
            baseURL: base, currentBuild: 58,
            requester: responder(200, body(#"{"minBuild":59,"storeUrl":"javascript:alert(1)"}"#)))
        XCTAssertEqual(r, .init(storeURL: nil))
    }

    func testAnyFailureOpensTheAppNormally() async {
        let ok = body(#"{"minBuild":59,"storeUrl":null}"#)
        let r500 = await AppUpdateGate.check(baseURL: base, currentBuild: 58, requester: responder(500, ok))
        XCTAssertNil(r500)
        let garbage = await AppUpdateGate.check(baseURL: base, currentBuild: 58, requester: responder(200, Data("<html>".utf8)))
        XCTAssertNil(garbage)
        let offline = await AppUpdateGate.check(baseURL: base, currentBuild: 58) { _ in throw URLError(.notConnectedToInternet) }
        XCTAssertNil(offline)
        let unknownBuild = await AppUpdateGate.check(baseURL: base, currentBuild: nil, requester: responder(200, ok))
        XCTAssertNil(unknownBuild)
    }

    func testAsksTheAppConfigRoute() async {
        let seen = SeenURL()
        _ = await AppUpdateGate.check(baseURL: base, currentBuild: 58) { request in
            await seen.set(request.url)
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
        }
        let url = await seen.url
        XCTAssertEqual(url?.absoluteString, "https://learn.example/api/app-config")
    }
}

private actor SeenURL {
    var url: URL?
    func set(_ value: URL?) { url = value }
}
