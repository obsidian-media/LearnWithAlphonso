import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Covers the RLS-safe, non-adversarial PostgREST operations (a user's own
/// row, auth.uid() = user_id enforced server-side; see
/// supabase/migrations/20260725012934_..._progress.sql's
/// "user_progress_write_own"/"user_progress_update_own" policies), plus
/// completeLesson, which calls the complete-lesson Edge Function instead
/// of PostgREST directly (see that method's doc comment and
/// supabase/functions/complete-lesson/index.ts for why).
final class ProgressSyncClientTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!
    private let userID = "11111111-1111-1111-1111-111111111111"

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    // MARK: - loseHeart

    // Now calls the lose_heart RPC (supabase/migrations/
    // 20260920050000_revoke_direct_gamification_writes.sql) instead of a
    // direct user_progress read+PATCH -- that table no longer grants
    // direct INSERT/UPDATE to `authenticated`.
    func testLoseHeartPostsToTheRpcAndReturnsTheResolvedHearts() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["hearts": 2, "hearts_refill_at": NSNull()]])
        }

        let result = try await client.loseHeart()

        XCTAssertEqual(result.hearts, 2)
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/lose_heart"))
    }

    func testLoseHeartSurfacesTheServerResolvedZeroHearts() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["hearts": 0, "hearts_refill_at": "2026-09-20T12:30:00+00:00"]])
        }

        let result = try await client.loseHeart()
        XCTAssertEqual(result.hearts, 0)
    }

    // MARK: - setCefrLevel

    // Now calls the set_cefr_level RPC (same migration as loseHeart above)
    // instead of a direct language_progress upsert.
    func testSetCefrLevelPostsToTheRpc() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            let http = HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!
            return (Data(), http)
        }

        try await client.setCefrLevel(course: "en", level: "B1")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/set_cefr_level"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_language"] as? String, "en")
        XCTAssertEqual(payload["_level"] as? String, "B1")
    }

    // MARK: - savePlacementResult

    // Now calls the save_placement_result RPC (same migration as loseHeart
    // above) instead of a direct upsert.
    func testSavePlacementResultPostsLevelAndScoreToTheRpc() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            // PostgREST returns a scalar-returning RPC's result as a bare
            // JSON fragment (here, a quoted timestamptz string) -- this
            // client doesn't decode it, so the exact body doesn't matter.
            let http = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return ("\"2026-09-20T12:00:00+00:00\"".data(using: .utf8)!, http)
        }

        try await client.savePlacementResult(course: "en", level: "A2", score: 73)

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/save_placement_result"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_language"] as? String, "en")
        XCTAssertEqual(payload["_level"] as? String, "A2")
        XCTAssertEqual(payload["_score"] as? Int, 73)
    }

    // MARK: - startLessonSession

    func testStartLessonSessionPostsToTheEdgeFunctionAndReturnsTheToken() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: ["token": "payload.sig"])
        }

        let token = try await client.startLessonSession(lessonID: "u1l1", course: "en")

        XCTAssertEqual(token, "payload.sig")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/functions/v1/start-lesson-session"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["course"] as? String, "en")
    }

    func testStartLessonSessionSurfacesTheEdgeFunctionsErrorShape() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Lesson not found"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.startLessonSession(lessonID: "missing", course: "en")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 404, message: "Lesson not found"))
        }
    }

    // MARK: - completeLesson

    func testCompleteLessonPostsToTheEdgeFunctionAndDecodesTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                "xpGain": 100,
                "newlyUnlocked": ["xp_100", "perfect_1"],
                "heartsBonus": "perfect",
                "progress": [
                    "xp": 100,
                    "streak": 1,
                    "longestStreak": 1,
                    "lastActiveDate": "2026-09-18",
                    "hearts": 4,
                    "heartsRefillAt": NSNull(),
                    "streakFreezes": 0,
                    "leagueTier": "bronze",
                ],
            ])
        }

        let result = try await client.completeLesson(
            lessonID: "u1l1",
            total: 8,
            missedQuestionIDs: [],
            course: "en",
            sessionToken: "a.b"
        )

        XCTAssertEqual(result.xpGain, 100)
        XCTAssertEqual(result.newlyUnlocked, ["xp_100", "perfect_1"])
        XCTAssertEqual(result.heartsBonus, "perfect")
        XCTAssertEqual(result.progress, LessonCompletionProgress(
            xp: 100, streak: 1, longestStreak: 1, lastActiveDate: "2026-09-18",
            hearts: 4, heartsRefillAt: nil, streakFreezes: 0, leagueTier: "bronze"
        ))

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/functions/v1/complete-lesson"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["lessonId"] as? String, "u1l1")
        XCTAssertEqual(payload["total"] as? Int, 8)
        XCTAssertEqual(payload["missedQuestionIds"] as? [String], [])
        XCTAssertEqual(payload["course"] as? String, "en")
        XCTAssertEqual(payload["sessionToken"] as? String, "a.b")
    }

    func testCompleteLessonSurfacesTheEdgeFunctionsErrorShape() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "Invalid or expired lesson session"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.completeLesson(lessonID: "u1l1", total: 8, missedQuestionIDs: [], course: "en", sessionToken: "bad")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 403, message: "Invalid or expired lesson session"))
        }
    }

    // MARK: - fetchDueReviews

    func testFetchDueReviewsReadsDueRowsThenTheExactCount() async throws {
        var requests: [URLRequest] = []
        let client = makeClient { request in
            requests.append(request)
            if request.httpMethod == "HEAD" {
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: 200, httpVersion: nil,
                    headerFields: ["Content-Range": "0-1/7"]
                )!
                return (Data(), response)
            }
            let rows: [[String: Any]] = [[
                "item_key": "u1l1:q1", "lesson_id": "u1l1", "level": "A1",
                "ease": 2.3, "interval_days": 1, "repetitions": 1, "due_on": "2026-09-19",
            ]]
            return self.jsonResponse(for: request.url!, body: rows)
        }

        let result = try await client.fetchDueReviews(course: "en")

        XCTAssertEqual(result.due, [
            ReviewItem(itemKey: "u1l1:q1", lessonId: "u1l1", level: "A1", ease: 2.3, intervalDays: 1, repetitions: 1, dueOn: "2026-09-19"),
        ])
        XCTAssertEqual(result.total, 7)
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[0].httpMethod, "GET")
        XCTAssertTrue(requests[0].url!.absoluteString.contains("/rest/v1/review_items"))
        XCTAssertTrue(requests[0].url!.query!.contains("due_on=lte."))
        XCTAssertEqual(requests[1].httpMethod, "HEAD")
    }

    func testFetchDueReviewsDecodesWeaknessSourcedRows() async throws {
        let client = makeClient { request in
            if request.httpMethod == "HEAD" {
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: 200, httpVersion: nil,
                    headerFields: ["Content-Range": "0-0/1"]
                )!
                return (Data(), response)
            }
            let rows: [[String: Any]] = [[
                "item_key": "weakness:abc123", "lesson_id": "weakness", "level": "A1",
                "ease": 2.5, "interval_days": 0, "repetitions": 0, "due_on": "2026-09-20",
                "source": "weakness", "weakness_display": "Past-tense verbs",
                "prompt": "She ___ to the store yesterday.",
                "choices": ["go", "goes", "went", "gone"], "answer_index": 2,
                "explanation": "Past tense of 'go' is 'went'.",
            ]]
            return self.jsonResponse(for: request.url!, body: rows)
        }

        let result = try await client.fetchDueReviews(course: "en")

        let item = try XCTUnwrap(result.due.first)
        XCTAssertEqual(item.source, "weakness")
        XCTAssertEqual(item.weaknessDisplay, "Past-tense verbs")
        XCTAssertEqual(item.choices, ["go", "goes", "went", "gone"])
        XCTAssertEqual(item.answerIndex, 2)
    }

    func testFetchDueReviewsDefaultsSourceToLessonWhenColumnIsAbsent() async throws {
        let client = makeClient { request in
            if request.httpMethod == "HEAD" {
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: 200, httpVersion: nil,
                    headerFields: ["Content-Range": "0-0/1"]
                )!
                return (Data(), response)
            }
            let rows: [[String: Any]] = [[
                "item_key": "lesson1:q1", "lesson_id": "lesson1", "level": "A1",
                "ease": 2.5, "interval_days": 0, "repetitions": 0, "due_on": "2026-09-20",
            ]]
            return self.jsonResponse(for: request.url!, body: rows)
        }

        let result = try await client.fetchDueReviews(course: "en")

        XCTAssertEqual(result.due.first?.source, "lesson")
    }

    // MARK: - fetchUnlockedAchievements

    func testFetchUnlockedAchievementsGetsAndDecodesTheRows() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["achievement_id": "streak_3", "progress": 3],
                ["achievement_id": "xp_100", "progress": 100],
            ])
        }

        let rows = try await client.fetchUnlockedAchievements()

        XCTAssertEqual(rows, [
            UnlockedAchievement(achievementID: "streak_3", progress: 3),
            UnlockedAchievement(achievementID: "xp_100", progress: 100),
        ])
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/user_achievements"))
    }

    func testFetchUnlockedAchievementsReturnsAnEmptyArrayWhenNoneAreUnlockedYet() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }

        let rows = try await client.fetchUnlockedAchievements()

        XCTAssertEqual(rows, [])
    }

    // MARK: - gradeReview

    func testGradeReviewPostsToTheEdgeFunctionAndReturnsTheOutcome() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: ["retired": false, "dueOn": "2026-09-22"])
        }

        let result = try await client.gradeReview(itemKey: "u1l1:q1", answer: "cat", course: "en")

        XCTAssertEqual(result, ReviewGradeOutcome(retired: false, dueOn: "2026-09-22"))
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/functions/v1/grade-review"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["itemKey"] as? String, "u1l1:q1")
        XCTAssertEqual(payload["answer"] as? String, "cat")
        XCTAssertEqual(payload["course"] as? String, "en")
    }

    func testGradeReviewSurfacesANotDueError() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["error": "This item isn't due yet"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            _ = try await client.gradeReview(itemKey: "u1l1:q1", answer: "cat", course: "en")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 400, message: "This item isn't due yet"))
        }
    }

    // MARK: - claimReviewClearBonus

    func testClaimReviewClearBonusPostsToTheRpcAndReturnsTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["granted": true, "hearts": 5]])
        }

        let result = try await client.claimReviewClearBonus(course: "en")

        XCTAssertEqual(result, ReviewClearBonus(granted: true, hearts: 5))
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/claim_review_clear_bonus"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_course"] as? String, "en")
    }

    // MARK: - buyStreakFreezeWithXp (V3 package 2)

    func testBuyStreakFreezeWithXpReturnsTheSuccessfulPurchaseResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "streak_freezes": 3, "xp": 375]])
        }

        let result = try await client.buyStreakFreezeWithXp(course: "en")

        XCTAssertEqual(result, .ok(streakFreezes: 3, xp: 375))
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/buy_streak_freeze_with_xp"))
    }

    func testBuyStreakFreezeWithXpSurfacesAnInsufficientXpRejection() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "streak_freezes": 2]])
        }
        let result = try await client.buyStreakFreezeWithXp(course: "en")
        XCTAssertEqual(result, .insufficientXp(streakFreezes: 2))
    }

    // MARK: - duels (V3 package 2)

    func testCreateDuelPostsTheOpponentAndCourse() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "duel_id": "d1"]])
        }

        let result = try await client.createDuel(opponentID: "friend-1", course: "en")

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.duelID, "d1")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/create_duel"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_opponent_id"] as? String, "friend-1")
        XCTAssertEqual(payload["_course"] as? String, "en")
    }

    func testRespondToDuelPostsTheAcceptFlag() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull()]])
        }

        let result = try await client.respondToDuel(duelID: "d1", accept: true)

        XCTAssertTrue(result.ok)
        let request = try XCTUnwrap(captured)
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_duel_id"] as? String, "d1")
        XCTAssertEqual(payload["_accept"] as? Bool, true)
    }

    func testFetchMyDuelsDecodesTheRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "duel_id": "d1", "challenger_id": "u1", "opponent_id": "u2", "course": "en",
                "status": "active", "challenger_xp_start": 100, "opponent_xp_start": 50,
                "challenger_xp_now": 150, "opponent_xp_now": 80, "winner_id": NSNull(), "ends_at": "2026-09-23T00:00:00Z",
            ]])
        }

        let duels = try await client.fetchMyDuels()

        XCTAssertEqual(duels, [Duel(
            duelID: "d1", challengerID: "u1", opponentID: "u2", course: "en", status: "active",
            challengerXPStart: 100, opponentXPStart: 50, challengerXPNow: 150, opponentXPNow: 80,
            winnerID: nil, endsAt: "2026-09-23T00:00:00Z"
        )])
    }

    // MARK: - claimWeeklyQuest (V3 package 2)

    func testClaimWeeklyQuestPostsQuestIdCourseAndWeekStart() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "xp": 130]])
        }

        let result = try await client.claimWeeklyQuest(questID: "weekly_xp_150", course: "en", weekStart: "2026-09-14")

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.xp, 130)
        let request = try XCTUnwrap(captured)
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_quest_id"] as? String, "weekly_xp_150")
        XCTAssertEqual(payload["_week_start"] as? String, "2026-09-14")
    }

    // MARK: - fetchLeaderboard

    func testFetchLeaderboardPostsScopeAndPeriodAndDecodesTheRows() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["user_id": "u1", "display_name": "Ada", "country": "US", "avatar_seed": "ada", "xp": 300],
                ["user_id": "u2", "display_name": "Grace", "country": NSNull(), "avatar_seed": "grace", "xp": 150],
            ])
        }

        let rows = try await client.fetchLeaderboard(scope: "friends", period: "weekly")

        XCTAssertEqual(rows, [
            LeaderboardRow(userID: "u1", displayName: "Ada", country: "US", avatarSeed: "ada", xp: 300),
            LeaderboardRow(userID: "u2", displayName: "Grace", country: nil, avatarSeed: "grace", xp: 150),
        ])
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/get_leaderboard"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_scope"] as? String, "friends")
        XCTAssertEqual(payload["_period"] as? String, "weekly")
    }

    func testFetchLeaderboardReturnsAnEmptyArrayForAnUnauthenticatedCaller() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }

        let rows = try await client.fetchLeaderboard(scope: "global", period: "all-time")

        XCTAssertEqual(rows, [])
    }

    // MARK: - acceptFriendInvite

    func testAcceptFriendInvitePostsTheInviterIdAndReturnsTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "message": "friends now"]])
        }

        let result = try await client.acceptFriendInvite(inviterID: "u1")

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.message, "friends now")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/accept_friend_invite"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_inviter_id"] as? String, "u1")
    }

    func testAcceptFriendInviteSurfacesAServerRejectionAsAFalseOkNotAThrow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "message": "cannot invite yourself"]])
        }

        let result = try await client.acceptFriendInvite(inviterID: "u1")

        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.message, "cannot invite yourself")
    }

    // MARK: - removeFriend

    func testRemoveFriendPostsTheFriendIdAndReturnsTheResult() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "message": "removed"]])
        }

        let result = try await client.removeFriend(friendID: "u1")

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.message, "removed")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/remove_friend"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["_friend_id"] as? String, "u1")
    }

    func testRemoveFriendSurfacesAServerRejectionAsAFalseOkNotAThrow() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["ok": false, "message": "cannot remove yourself"]])
        }

        let result = try await client.removeFriend(friendID: "u1")

        XCTAssertFalse(result.ok)
        XCTAssertEqual(result.message, "cannot remove yourself")
    }

    // MARK: - fetchFriendsProgress

    func testFetchFriendsProgressPostsToTheRpcAndDecodesTheRows() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["user_id": "u1", "display_name": "Ada", "avatar_seed": "ada", "streak": 12, "week_xp": 300],
            ])
        }

        let rows = try await client.fetchFriendsProgress()

        XCTAssertEqual(rows, [FriendProgress(userID: "u1", displayName: "Ada", avatarSeed: "ada", streak: 12, weekXP: 300)])
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/get_friends_progress"))
    }

    func testFetchFriendsProgressReturnsAnEmptyArrayWhenTheUserHasNoFriendsYet() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }

        let rows = try await client.fetchFriendsProgress()

        XCTAssertEqual(rows, [])
    }

    // MARK: - fetchFriendActivity

    func testFetchFriendActivityGetsAndDecodesEveryEventTypesPayload() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["id": "e1", "user_id": "u1", "event_type": "lesson_completed", "payload": ["lessonId": "u1l1", "xpGain": 50], "created_at": "2026-09-20T01:23:45.678901+00:00"],
                ["id": "e2", "user_id": "u2", "event_type": "streak_milestone", "payload": ["streak": 7], "created_at": "2026-09-19T00:00:00+00:00"],
                ["id": "e3", "user_id": "u3", "event_type": "league_promotion", "payload": ["newTier": "silver"], "created_at": "2026-09-18T00:00:00Z"],
            ])
        }

        let events = try await client.fetchFriendActivity()

        XCTAssertEqual(events.count, 3)
        XCTAssertEqual(events[0], FriendActivityEvent(id: "e1", userID: "u1", eventType: "lesson_completed", createdAt: events[0].createdAt, lessonID: "u1l1", xpGain: 50, streak: nil, newTier: nil))
        XCTAssertEqual(events[1].streak, 7)
        XCTAssertEqual(events[2].newTier, "silver")
        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/friend_activity_events"))
        XCTAssertTrue(request.url!.query!.contains("order=created_at.desc"))
    }

    // MARK: - nudges

    func testSendNudgePostsOnlyTheRecipientId() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.sendNudge(recipientID: "friend-1")

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/nudges"))
        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(payload["recipient_id"] as? String, "friend-1")
        XCTAssertNil(payload["sender_id"], "sender_id defaults to auth.uid() server-side")
    }

    func testFetchUnreadNudgesFiltersToUnreadOnly() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["id": "n1", "sender_id": "friend-1", "created_at": "2026-09-20T01:00:00+00:00"],
            ])
        }

        let nudges = try await client.fetchUnreadNudges()

        XCTAssertEqual(nudges, [Nudge(id: "n1", senderID: "friend-1", createdAt: nudges[0].createdAt)])
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.query!.contains("read_at=is.null"))
    }

    func testMarkNudgesReadPatchesTheGivenIds() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.markNudgesRead(ids: ["n1", "n2"])

        let request = try XCTUnwrap(captured)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertTrue(request.url!.absoluteString.contains("id=in.(n1,n2)"))
    }

    func testMarkNudgesReadIsANoOpForAnEmptyList() async throws {
        var callCount = 0
        let client = makeClient { request in
            callCount += 1
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.markNudgesRead(ids: [])

        XCTAssertEqual(callCount, 0)
    }

    // MARK: - fetchCefrLevel (V3 package 3a)

    func testFetchCefrLevelReturnsTheLevel() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [["cefr_level": "B1"]])
        }

        let level = try await client.fetchCefrLevel(course: "en")

        XCTAssertEqual(level, "B1")
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/language_progress"))
        XCTAssertTrue(request.url!.query!.contains("language=eq.en"))
    }

    func testFetchCefrLevelReturnsNilWhenNoRowExistsYet() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }
        let level = try await client.fetchCefrLevel(course: "en")
        XCTAssertNil(level)
    }

    // MARK: - fetchProgress (progress-not-shown-after-update fix, 2026-09-24)

    func testFetchProgressComposesBothTables() async throws {
        var paths: [String] = []
        let client = makeClient { request in
            let url = request.url!
            paths.append(url.path)
            if url.path.contains("language_progress") {
                return self.jsonResponse(for: url, body: [["xp": 1234, "league_tier": "gold"]])
            }
            return self.jsonResponse(for: url, body: [[
                "streak": 7,
                "longest_streak": 9,
                "last_active_date": "2026-09-24",
                "hearts": 3,
                "hearts_refill_at": "2026-09-24T01:23:45.678901+00:00",
                "streak_freezes": 2,
            ]])
        }

        // Awaited into a local first: XCTUnwrap takes an autoclosure, and an
        // `async` call cannot appear inside one.
        let fetched = try await client.fetchProgress()
        let progress = try XCTUnwrap(fetched)

        // xp/leagueTier must come from language_progress -- user_progress.xp
        // has been frozen since the 2026-09-08 multi-course migration.
        XCTAssertEqual(progress.xp, 1234)
        XCTAssertEqual(progress.leagueTier, "gold")
        XCTAssertEqual(progress.streak, 7)
        XCTAssertEqual(progress.longestStreak, 9)
        XCTAssertEqual(progress.hearts, 3)
        XCTAssertEqual(progress.streakFreezes, 2)
        XCTAssertEqual(progress.lastActiveDate, "2026-09-24")
        // PostgREST returns fractional-second timestamps; heartsRefillAt is
        // epoch milliseconds. 2026-09-24T01:23:45.678901Z is 1790213025678.901
        // ms; ISO8601DateFormatter truncates below the millisecond, so the
        // parsed value lands on ...678.0 -- hence the 1ms accuracy rather
        // than an exact match.
        XCTAssertEqual(try XCTUnwrap(progress.heartsRefillAt), 1790213025678, accuracy: 1)
        XCTAssertEqual(paths.count, 2)
    }

    func testFetchProgressAsksForTheMostRecentlyUpdatedCourse() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            if request.url!.path.contains("language_progress"), captured == nil {
                captured = request
            }
            return self.jsonResponse(for: request.url!, body: [["xp": 1, "league_tier": "bronze"]])
        }

        _ = try await client.fetchProgress()

        // Must not hardcode a course: a French-only learner would otherwise
        // be shown their empty English numbers.
        let query = try XCTUnwrap(captured?.url?.query)
        XCTAssertFalse(query.contains("language=eq."))
        XCTAssertTrue(query.contains("order=updated_at.desc"))
        XCTAssertTrue(query.contains("limit=1"))
    }

    func testFetchProgressReturnsNilWhenNoCourseRowExists() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }
        let progress = try await client.fetchProgress()
        XCTAssertNil(progress)
    }

    func testFetchProgressDefaultsHeartsToFullWhenUserProgressRowIsMissing() async throws {
        let client = makeClient { request in
            let url = request.url!
            if url.path.contains("language_progress") {
                return self.jsonResponse(for: url, body: [["xp": 10, "league_tier": "bronze"]])
            }
            return self.jsonResponse(for: url, body: [] as [[String: Any]])
        }

        // Awaited into a local first: XCTUnwrap takes an autoclosure, and an
        // `async` call cannot appear inside one.
        let fetched = try await client.fetchProgress()
        let progress = try XCTUnwrap(fetched)

        // The schema default is 5. Showing 0 hearts to someone who has all
        // of them would read as a bug.
        XCTAssertEqual(progress.hearts, 5)
        XCTAssertEqual(progress.streak, 0)
        XCTAssertNil(progress.heartsRefillAt)
    }

    // MARK: - fetchWeaknessTrend (V3 package 3b)

    func testFetchWeaknessTrendAggregatesPerCategory() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["category": "past-tense", "event_type": "detected", "created_at": "2026-09-01T00:00:00Z"],
                ["category": "past-tense", "event_type": "detected", "created_at": "2026-09-05T00:00:00Z"],
                ["category": "past-tense", "event_type": "resolved", "created_at": "2026-09-10T00:00:00Z"],
                ["category": "articles", "event_type": "detected", "created_at": "2026-09-02T00:00:00Z"],
                ["category": "articles", "event_type": "resolved", "created_at": "2026-09-03T00:00:00Z"],
            ])
        }

        let trend = try await client.fetchWeaknessTrend()

        XCTAssertEqual(trend, [
            WeaknessTrendEntry(category: "past-tense", detectedCount: 2, resolvedCount: 1, openCount: 1, lastEventAt: "2026-09-10T00:00:00Z"),
            WeaknessTrendEntry(category: "articles", detectedCount: 1, resolvedCount: 1, openCount: 0, lastEventAt: "2026-09-03T00:00:00Z"),
        ])
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.absoluteString.contains("/rest/v1/weakness_events"))
    }

    func testFetchWeaknessTrendReturnsEmptyWhenNoEvents() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }
        let trend = try await client.fetchWeaknessTrend()
        XCTAssertEqual(trend, [])
    }

    // MARK: - fetchActivityXP

    func testFetchActivityXPSumsXpEarnedOverTheDateRange() async throws {
        var captured: URLRequest?
        let client = makeClient { request in
            captured = request
            return self.jsonResponse(for: request.url!, body: [
                ["xp_earned": 40], ["xp_earned": 60],
            ])
        }

        let total = try await client.fetchActivityXP(userID: "u1", from: "2026-09-08", to: "2026-09-15")

        XCTAssertEqual(total, 100)
        let request = try XCTUnwrap(captured)
        XCTAssertTrue(request.url!.query!.contains("day=gte.2026-09-08"))
        XCTAssertTrue(request.url!.query!.contains("day=lt.2026-09-15"))
    }

    func testFetchActivityXPReturnsZeroForNoActivity() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [] as [[String: Any]])
        }

        let total = try await client.fetchActivityXP(userID: "u1", from: "2026-09-08", to: "2026-09-15")

        XCTAssertEqual(total, 0)
    }

    // MARK: - error handling

    func testThrowsAReadableErrorWhenSupabaseRejectsAWrite() async {
        let client = makeClient { request in
            let body = try! JSONSerialization.data(withJSONObject: ["message": "new row violates row-level security policy"])
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }

        do {
            try await client.setCefrLevel(course: "en", level: "B1")
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .server(status: 403, message: "new row violates row-level security policy"))
        }
    }
}
