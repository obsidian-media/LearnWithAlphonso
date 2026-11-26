import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class WeeklyQuestsTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func json(_ request: URLRequest, _ body: Any) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    func testQuestIDsAreTheWeeklyQuestsIDsNotChallengeTemplateIDs() {
        XCTAssertTrue(WeeklyQuests.isQuestID("weekly_lessons_5"))
        // The ids a weekly challenge carries; claim_weekly_quest answers unknown-quest for these.
        for id in ["lessons_5", "xp_300", "t1", ""] {
            XCTAssertFalse(WeeklyQuests.isQuestID(id), id)
        }
    }

    func testClaimWithAChallengeTemplateIDNeverReachesTheServer() async {
        let hits = TestCapture<Int>(0)
        let client = makeClient { request in
            hits.value += 1
            return self.json(request, [["ok": false, "reason": "unknown-quest"]])
        }
        do {
            _ = try await client.claimWeeklyQuest(questID: "lessons_5", course: "en", weekStart: "2026-09-28")
            XCTFail("a challenge id must be refused before the request")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, ProgressSyncError.invalidPayload)
        }
        XCTAssertEqual(hits.value, 0)
    }

    func testProgressIsBuiltFromTheWeeksXPLessonsAndClaims() async throws {
        let seen = TestCapture<[URLRequest]>([])
        let client = makeClient { request in
            seen.value.append(request)
            let path = request.url!.path
            if path.hasSuffix("activity_days") { return self.json(request, [["xp_earned": 300], ["xp_earned": 250]]) }
            if path.hasSuffix("lesson_completions") { return self.json(request, [["id": "a"], ["id": "b"]]) }
            return self.json(request, [["quest_id": "weekly_xp_150"]])
        }
        let quests = try await client.getWeeklyQuests(course: "fr", weekStart: "2026-09-28")
        XCTAssertEqual(quests.map(\.progress), [550, 550, 2])
        XCTAssertEqual(quests.map(\.claimed), [true, false, false])
        XCTAssertEqual(quests.map(\.claimable), [false, true, false])
        let lessonQuery = seen.value[1].url!.query ?? ""
        XCTAssertTrue(lessonQuery.contains("language=eq.fr"))
        XCTAssertTrue(seen.value[0].url!.query!.contains("day=lt.2026-10-05"))
    }

    func testAFailedReadThrowsInsteadOfShowingZeroProgress() async {
        let client = makeClient { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
        }
        do {
            _ = try await client.getWeeklyQuests(course: "en", weekStart: "2026-09-28")
            XCTFail("expected a throw")
        } catch {}
    }

    func testWeekStartIsTheUTCMondayAndEveryRefusalHasItsOwnLine() {
        // Wed 2026-09-30 12:00 UTC.
        XCTAssertEqual(WeeklyQuests.weekStart(now: Date(timeIntervalSince1970: 1_790_769_600)), "2026-09-28")
        // Sunday still belongs to the week that began the Monday before.
        XCTAssertEqual(WeeklyQuests.weekStart(now: Date(timeIntervalSince1970: 1_791_115_200)), "2026-09-28")
        for reason in ["not-yet-completed", "already-claimed", "invalid-week", "no-course-progress", "unknown-quest", nil] {
            XCTAssertFalse(WeeklyQuests.claimMessage(reason: reason).lowercased().contains("connection"))
        }
    }

    func testTheCatalogueMatchesTheSeedMigration() throws {
        // Walk up from this file to the repo root, where supabase/migrations lives.
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: dir.appendingPathComponent("supabase/migrations").path) {
            let parent = dir.deletingLastPathComponent()
            guard parent != dir else { return XCTFail("repo root not found") }
            dir = parent
        }
        let sql = try String(contentsOf: dir.appendingPathComponent("supabase/migrations/20260920060000_v3_engagement_mechanics.sql"), encoding: .utf8)
        let regex = try NSRegularExpression(pattern: "\\('(weekly_\\w+)', '[^']*', '[^']*', '[^']*', '(\\w+)', (\\d+), (\\d+), \\d+\\)")
        let ns = sql as NSString
        let seeded = regex.matches(in: sql, range: NSRange(location: 0, length: ns.length)).map { m in
            [ns.substring(with: m.range(at: 1)), ns.substring(with: m.range(at: 2)), ns.substring(with: m.range(at: 3)), ns.substring(with: m.range(at: 4))]
        }
        let mirrored = WeeklyQuests.defs.map { [$0.id, $0.metric == .xpEarned ? "xp_earned" : "lessons_completed", String($0.target), String($0.xpReward)] }
        XCTAssertEqual(seeded.count, 3)
        XCTAssertEqual(seeded, mirrored)
    }

    func testTheWeeklyCardSaysCouldntLoadOnlyWhenAReadFailedAndNothingEarlierIsShown() {
        XCTAssertEqual(WeeklyQuests.railValue(challengesDone: 0, challengesTotal: 0, questCount: 0, failed: true), "Couldn't load")
        // A failed refresh keeps what the card already had.
        XCTAssertEqual(WeeklyQuests.railValue(challengesDone: 1, challengesTotal: 3, questCount: 3, failed: true), "1 of 3 done")
        XCTAssertEqual(WeeklyQuests.railValue(challengesDone: 0, challengesTotal: 0, questCount: 3, failed: true), "3 quests")
        XCTAssertEqual(WeeklyQuests.railValue(challengesDone: 2, challengesTotal: 3, questCount: 0, failed: false), "2 of 3 done")
    }
}
