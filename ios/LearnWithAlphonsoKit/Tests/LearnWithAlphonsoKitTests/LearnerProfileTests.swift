import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class LearnerProfileTests: XCTestCase {
    func testParseKeepsGoodValuesAndDropsBadOnesFieldByField() {
        let profile = LearnerProfile.parse([
            "name": "Sam", "goal": "work", "ageRange": "under-13", "country": "CA", "showFlag": "yes",
            "dailyMinutes": 12, "interests": ["food", 3, "nope"], "completedAt": "2026-11-06T10:00:00.000Z",
            "dismissedAt": "yesterday",
        ])
        XCTAssertEqual(profile.answers.name, "Sam")
        XCTAssertEqual(profile.answers.goal, "work")
        XCTAssertNil(profile.answers.ageRange)
        XCTAssertEqual(profile.answers.country, "CA")
        XCTAssertEqual(profile.answers.showFlag, false, "only a real true turns the flag on")
        XCTAssertNil(profile.answers.dailyMinutes)
        XCTAssertEqual(profile.answers.interests, ["food"])
        XCTAssertEqual(profile.completedAt, "2026-11-06T10:00:00.000Z")
        XCTAssertNil(profile.dismissedAt)
        XCTAssertFalse(profile.needsCompleteProfile)
    }

    func testCompleteYourProfileShowsUntilFinishedOrDismissed() {
        XCTAssertTrue(LearnerProfile.parse(nil).needsCompleteProfile)
        XCTAssertTrue(LearnerProfile.parse(["goal": "work"]).needsCompleteProfile)
        XCTAssertFalse(LearnerProfile.parse(["dismissedAt": "2026-11-06T10:00:00Z"]).needsCompleteProfile)
    }

    func testNamesAreTrimmedAndAtMostFortyCharacters() {
        XCTAssertEqual(LearnerAnswers.cleanName("  Ada "), "Ada")
        XCTAssertNil(LearnerAnswers.cleanName(String(repeating: "a", count: 41)))
        XCTAssertNil(LearnerAnswers.cleanName("   "))
    }
}

final class ProfileAvatarsTests: XCTestCase {
    func testSixteenAnimalsWithTheWebsIds() {
        XCTAssertEqual(ProfileAvatars.all.map(\.id), [
            "llama-rose", "llama-cocoa", "alpaca", "fox", "owl", "cat", "panda", "bear", "rabbit", "penguin",
            "parrot", "koala", "lion", "hedgehog", "corgi", "deer",
        ])
    }

    func testSeedsRoundTripAndAnythingElseIsInitials() {
        XCTAssertEqual(ProfileAvatars.seed(for: "fox"), "animal:fox")
        XCTAssertEqual(ProfileAvatars.animal(fromSeed: "animal:fox")?.label, "Fox")
        XCTAssertNil(ProfileAvatars.animal(fromSeed: "animal:dragon"))
        XCTAssertNil(ProfileAvatars.animal(fromSeed: "3f9a2c1d"))
        XCTAssertNil(ProfileAvatars.animal(fromSeed: nil))
    }

    func testOnlyAnimalsFromTheListOrPlainColourSeedsMayBeWritten() {
        XCTAssertTrue(ProfileAvatars.isAllowedSeed("animal:owl"))
        XCTAssertTrue(ProfileAvatars.isAllowedSeed("3f9a2c1d"))
        XCTAssertFalse(ProfileAvatars.isAllowedSeed("animal:dragon"))
        XCTAssertFalse(ProfileAvatars.isAllowedSeed("https://example.com/a.png"))
        XCTAssertFalse(ProfileAvatars.isAllowedSeed(""))
        XCTAssertFalse(ProfileAvatars.isAllowedSeed(String(repeating: "a", count: 33)))
    }

    func testMyInitialKeepsTheOldColourSeed() {
        XCTAssertEqual(ProfileAvatars.initialsSeed(current: "3f9a2c1d"), "3f9a2c1d")
        XCTAssertEqual(ProfileAvatars.initialsSeed(current: "animal:fox"), "a")
        XCTAssertEqual(ProfileAvatars.initialsSeed(current: nil), "a")
        XCTAssertEqual(ProfileAvatars.initial(of: " sam"), "S")
        XCTAssertEqual(ProfileAvatars.initial(of: ""), "?")
    }
}

final class LearnerProfileClientTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    private func client(
        status: Int = 200, json: Any = ["profile": [String: Any]()], error: Error? = nil,
        refresh: (@Sendable () async -> String?)? = nil, capture: TestCapture<[URLRequest]>? = nil
    ) -> LearnerProfileClient {
        LearnerProfileClient(
            baseURL: baseURL, accessToken: { "tok" }, refreshAccessToken: refresh,
            requester: { request in
                capture?.value.append(request)
                if let error { throw error }
                let data = try! JSONSerialization.data(withJSONObject: json)
                return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            })
    }

    func testSaveIsAPutOfThePatchAndTheMarkWithTheBearerToken() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(json: ["profile": ["goal": "travel", "completedAt": "2026-11-06T10:00:00.000Z"]], capture: captured)
        let saved = try await c.save(LearnerAnswers(goal: "travel", dailyMinutes: 10), mark: .completed)
        let request = try XCTUnwrap(captured.value.first)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.url?.path, "/api/learner-profile")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["mark"] as? String, "completed")
        let patch = try XCTUnwrap(body["patch"] as? [String: Any])
        XCTAssertEqual(Set(patch.keys), ["goal", "dailyMinutes"])
        XCTAssertEqual(saved.answers.goal, "travel")
        XCTAssertFalse(saved.needsCompleteProfile)
    }

    func testNotNowSendsAnEmptyPatchAndTheDismissedMark() async throws {
        let captured = TestCapture<[URLRequest]>([])
        try await client(capture: captured).save(LearnerAnswers(), mark: .dismissed)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(captured.value.first?.httpBody)) as? [String: Any])
        XCTAssertEqual((body["patch"] as? [String: Any])?.count, 0)
        XCTAssertEqual(body["mark"] as? String, "dismissed")
    }

    func testFetchReadsTheProfile() async throws {
        let profile = try await client(json: ["profile": ["goal": "exam", "showFlag": true]]).fetch()
        XCTAssertEqual(profile.answers.goal, "exam")
        XCTAssertEqual(profile.answers.showFlag, true)
    }

    func testFailuresMapToTheirErrors() async {
        await assertThrows(client(status: 400, json: ["error": "x"]), .invalid)
        await assertThrows(client(status: 401, json: [:]), .notSignedIn)
        await assertThrows(client(status: 500, json: ["error": "Couldn't save your answers. Try again."]),
                           .failed("Couldn't save your answers. Try again."))
        await assertThrows(client(error: URLError(.notConnectedToInternet)), .offline)
    }

    func testA401RetriesOnceWithAFreshToken() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = LearnerProfileClient(
            baseURL: baseURL, accessToken: { "old" }, refreshAccessToken: { "new" },
            requester: { request in
                captured.value.append(request)
                let ok = request.value(forHTTPHeaderField: "Authorization") == "Bearer new"
                let data = try! JSONSerialization.data(withJSONObject: ["profile": [String: Any]()])
                return (data, HTTPURLResponse(url: request.url!, statusCode: ok ? 200 : 401, httpVersion: nil, headerFields: nil)!)
            })
        _ = try await c.fetch()
        XCTAssertEqual(captured.value.count, 2)
    }

    private func assertThrows(_ c: LearnerProfileClient, _ expected: LearnerProfileError, line: UInt = #line) async {
        do {
            _ = try await c.fetch()
            XCTFail("expected \(expected)", line: line)
        } catch {
            XCTAssertEqual(error as? LearnerProfileError, expected, line: line)
        }
    }
}

final class ProgressSyncClientCountryTests: XCTestCase {
    private func client(_ body: Any) -> ProgressSyncClient {
        ProgressSyncClient(
            supabaseURL: URL(string: "https://example.supabase.co")!, anonKey: "k", accessToken: "t",
            requester: { request in
                let data = try! JSONSerialization.data(withJSONObject: body)
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
    }

    func testReadsTheLeaderboardCountryAndIgnoresAnythingElse() async throws {
        let shown = try await client([["country": "CA"]]).fetchProfileCountry(userID: "u")
        XCTAssertEqual(shown, "CA")
        let none = try await client([["country": NSNull()]]).fetchProfileCountry(userID: "u")
        XCTAssertNil(none)
        let bad = try await client([["country": "Canada"]]).fetchProfileCountry(userID: "u")
        XCTAssertNil(bad)
    }
}
