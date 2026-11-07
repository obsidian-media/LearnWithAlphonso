import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import LearnWithAlphonsoKit

final class ProfileOverviewReadTests: XCTestCase {
    private final class Log: @unchecked Sendable {
        private let lock = NSLock()
        private var items: [String] = []
        func add(_ s: String) { lock.lock(); items.append(s); lock.unlock() }
        var all: [String] { lock.lock(); defer { lock.unlock() }; return items }
    }

    func testOneBatchedReadWithOneRequestPerSourceAndCourseScopedFilters() async throws {
        let log = Log()
        let client = ProgressSyncClient(supabaseURL: URL(string: "https://x.test")!, anonKey: "k", accessToken: "t") { request in
            log.add(request.url!.path + "?" + (request.url!.query ?? ""))
            var headers: [String: String] = [:]
            var body: Any = [[String: Any]]()
            switch request.url!.path {
            case "/rest/v1/profiles": body = [["display_name": "Ada", "avatar_seed": "animal:fox", "country": "FR"]]
            case "/rest/v1/language_progress": body = [["language": "en", "xp": 120, "cefr_level": "A2", "league_tier": "silver"], ["language": "fr", "xp": 900, "cefr_level": "A1", "league_tier": "sapphire"]]
            case "/rest/v1/user_progress": body = [["streak": 4, "longest_streak": 9, "streak_freezes": 1]]
            case "/rest/v1/review_items":
                if request.url!.query!.contains("saved_word") { headers["Content-Range"] = "0-0/7" }
            default: break
            }
            let data = try JSONSerialization.data(withJSONObject: body)
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!)
        }
        let o = try await client.fetchProfileOverview(userID: "u1", course: "en", now: Date(timeIntervalSince1970: 1_793_000_000))
        XCTAssertEqual(o.displayName, "Ada")
        XCTAssertEqual(o.country, "FR")
        XCTAssertEqual(o.savedWords, 7)
        XCTAssertEqual(o.streak, 4)
        XCTAssertEqual(o.longestStreak, 9)
        XCTAssertEqual(o.courses.count, 2)
        // No N+1: 11 table reads plus the friends rpc, each exactly once.
        let calls = log.all
        XCTAssertEqual(calls.count, 12)
        XCTAssertEqual(calls.filter { $0.contains("weakness_label") && $0.contains("language=eq.en") }.count, 1)
        XCTAssertTrue(calls.contains { $0.hasPrefix("/rest/v1/rpc/get_friends_progress") })
    }
}
