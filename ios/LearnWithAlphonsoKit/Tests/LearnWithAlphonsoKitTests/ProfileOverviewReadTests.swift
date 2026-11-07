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
            case "/rest/v1/mastered_words": headers["Content-Range"] = "0-0/12"
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
        // No N+1: 15 table reads plus the friends and league rpcs, each exactly once.
        let calls = log.all
        XCTAssertEqual(calls.count, 17)
        XCTAssertEqual(calls.filter { $0.contains("weakness_label") && $0.contains("language=eq.en") }.count, 1)
        XCTAssertTrue(calls.contains { $0.hasPrefix("/rest/v1/rpc/get_friends_progress") })
    }

    private func profileDataClient(failLeague: Bool) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: URL(string: "https://x.test")!, anonKey: "k", accessToken: "t") { request in
            var headers: [String: String] = [:]
            var body: Any = [[String: Any]]()
            var status = 200
            switch request.url!.path {
            case "/rest/v1/profiles": body = [["display_name": "Ada"]]
            case "/rest/v1/mastered_words": headers["Content-Range"] = "0-0/12"
            case "/rest/v1/rpc/get_my_league_standing":
                if failLeague { status = 500 } else {
                    XCTAssertEqual(String(data: request.httpBody ?? Data(), encoding: .utf8), "{\"_course\":\"en\"}")
                    body = [["league_tier": "silver", "rank": 3, "size": 20, "week_start": "2026-11-02", "week_end": "2026-11-08", "week_xp": 150]]
                }
            case "/rest/v1/learning_days": body = [["day": "2026-11-07", "lesson_seconds": 600, "practice_seconds": 90]]
            case "/rest/v1/learner_time_zones": body = [["time_zone": "Europe/Paris"]]
            case "/rest/v1/skill_days": body = [["day": "2026-11-07", "skill": "grammar", "right_answers": 3, "total_answers": 4]]
            default: break
            }
            let data = try JSONSerialization.data(withJSONObject: body)
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!)
        }
    }

    func testProfileDataReadsAreMapped() async throws {
        let o = try await profileDataClient(failLeague: false).fetchProfileOverview(userID: "u1", course: "en", now: Date(timeIntervalSince1970: 1_793_000_000))
        XCTAssertEqual(o.learning, [ProfileLearningDay(day: "2026-11-07", lessonSeconds: 600, practiceSeconds: 90)])
        XCTAssertEqual(o.masteredWords, 12)
        XCTAssertEqual(o.league, ProfileLeagueStanding(leagueTier: "silver", rank: 3, size: 20, weekStart: "2026-11-02", weekEnd: "2026-11-08", weekXP: 150))
        XCTAssertEqual(o.timeZone, "Europe/Paris")
        XCTAssertEqual(o.skills, [ProfileSkillDay(day: "2026-11-07", skill: "grammar", right: 3, total: 4)])
    }

    func testFailingLeagueRpcLeavesTheRestOfTheOverviewIntact() async throws {
        let o = try await profileDataClient(failLeague: true).fetchProfileOverview(userID: "u1", course: "en", now: Date(timeIntervalSince1970: 1_793_000_000))
        XCTAssertNil(o.league)
        XCTAssertEqual(o.displayName, "Ada")
        XCTAssertEqual(o.masteredWords, 12)
        XCTAssertEqual(o.learning.count, 1)
        XCTAssertEqual(o.timeZone, "Europe/Paris")
    }
}
