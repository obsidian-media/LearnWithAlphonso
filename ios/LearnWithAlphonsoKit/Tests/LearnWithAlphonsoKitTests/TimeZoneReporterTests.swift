import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import LearnWithAlphonsoKit

final class TimeZoneReporterTests: XCTestCase {
    private final class Sent: @unchecked Sendable {
        private let lock = NSLock()
        private var items: [String] = []
        func add(_ s: String) { lock.lock(); items.append(s); lock.unlock() }
        var all: [String] { lock.lock(); defer { lock.unlock() }; return items }
    }

    private final class Captured: @unchecked Sendable {
        private let lock = NSLock()
        private var value: URLRequest?
        func set(_ r: URLRequest) { lock.lock(); value = r; lock.unlock() }
        var request: URLRequest? { lock.lock(); defer { lock.unlock() }; return value }
    }

    private func defaults() -> UserDefaults {
        let name = "tz-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    func testRequestIsTheOwnRpcWithTheZoneAndTheUsersJwt() async throws {
        let captured = Captured()
        let client = ProgressSyncClient(supabaseURL: URL(string: "https://x.test")!, anonKey: "k", accessToken: "jwt") { request in
            captured.set(request)
            return (Data("\"Europe/Paris\"".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await client.setMyTimeZone("Europe/Paris")
        let request = try XCTUnwrap(captured.request)
        XCTAssertEqual(request.url?.path, "/rest/v1/rpc/set_my_time_zone")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt")
        let body = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(body, ["_time_zone": "Europe/Paris"])
    }

    func testServerRefusalThrows() async {
        let client = ProgressSyncClient(supabaseURL: URL(string: "https://x.test")!, anonKey: "k", accessToken: "t") { request in
            (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!)
        }
        do { try await client.setMyTimeZone("Mars/Olympus"); XCTFail("expected a throw") } catch {}
    }

    func testSendsOnceThenOnlyWhenTheZoneChanges() async {
        let reporter = TimeZoneReporter(defaults: defaults())
        let sent = Sent()
        let send: (String) async throws -> Void = { sent.add($0) }
        let first = await reporter.syncIfChanged(userID: "u1", zone: "Europe/Paris", send: send)
        let again = await reporter.syncIfChanged(userID: "u1", zone: "Europe/Paris", send: send)
        let moved = await reporter.syncIfChanged(userID: "u1", zone: "America/Toronto", send: send)
        XCTAssertTrue(first)
        XCTAssertFalse(again)
        XCTAssertTrue(moved)
        XCTAssertEqual(sent.all, ["Europe/Paris", "America/Toronto"])
    }

    func testADifferentAccountOnTheSameDeviceSends() async {
        let reporter = TimeZoneReporter(defaults: defaults())
        let sent = Sent()
        await reporter.syncIfChanged(userID: "u1", zone: "Europe/Paris") { sent.add($0) }
        await reporter.syncIfChanged(userID: "u2", zone: "Europe/Paris") { sent.add($0) }
        XCTAssertEqual(sent.all.count, 2)
    }

    func testAFailedSendIsNotRemembered() async {
        let reporter = TimeZoneReporter(defaults: defaults())
        struct Boom: Error {}
        let failed = await reporter.syncIfChanged(userID: "u1", zone: "Asia/Tokyo") { _ in throw Boom() }
        XCTAssertFalse(failed)
        let sent = Sent()
        let retried = await reporter.syncIfChanged(userID: "u1", zone: "Asia/Tokyo") { sent.add($0) }
        XCTAssertTrue(retried)
    }

    func testSignOutClearsTheMemory() async {
        let d = defaults()
        let reporter = TimeZoneReporter(defaults: d)
        await reporter.syncIfChanged(userID: "u1", zone: "Europe/Paris") { _ in }
        AccountLocalCaches(defaults: d).clear()
        let sent = Sent()
        await reporter.syncIfChanged(userID: "u1", zone: "Europe/Paris") { sent.add($0) }
        XCTAssertEqual(sent.all, ["Europe/Paris"])
    }
}
