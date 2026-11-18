import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Graded stories: the library rules, the narration hand-off, reading a story, saving progress, and the server-graded
/// check. Every request goes through an injected requester, so no test touches the network.
final class StoriesTests: XCTestCase {
    private let supabaseURL = URL(string: "https://project.supabase.co")!
    private let storyID = "22222222-2222-4222-8222-222222222222"

    private actor RequestBox {
        private(set) var requests: [URLRequest] = []
        func record(_ request: URLRequest) { requests.append(request) }
        var last: URLRequest? { requests.last }
    }

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> PodcastClient {
        PodcastClient(
            supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func json(_ body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        return (data, HTTPURLResponse(url: supabaseURL, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private func summary(
        _ title: String, level: String = "A1", order: Int = 0, course: String = "en", published: Bool = true,
        index: Int = 0, best: Int? = nil, total: Int? = nil, completed: Bool = false
    ) -> StorySummary {
        StorySummary(
            id: title, course: course, level: level, slug: title, title: title, sortOrder: order, published: published,
            segmentIndex: index, segmentCount: 5, bestCorrect: best, checkTotal: total, completed: completed)
    }

    // MARK: - Library rules

    func testOnlyPublishedStoriesInTheCourseAreShown() {
        let list = [
            summary("draft", published: false), summary("fr", course: "fr"), summary("ok"),
        ]
        XCTAssertEqual(Stories.visible(list, course: "en").map(\.title), ["ok"])
    }

    func testABranchingStoryWithNoSentencesIsNotListedInThisReader() {
        let branching = StorySummary(
            id: "b", course: "en", level: "A1", slug: "b", title: "Branching", sortOrder: 0, published: true,
            segmentIndex: 0, segmentCount: 0, bestCorrect: nil, checkTotal: nil, completed: false)
        XCTAssertEqual(Stories.visible([branching, summary("plain")], course: "en").map(\.title), ["plain"])
    }

    func testStoriesAreGroupedByLevelInOrder() {
        let list = Stories.visible(
            [summary("b", level: "A2", order: 1), summary("c", level: "A1", order: 2), summary("a", level: "A1", order: 1)],
            course: "en")
        let groups = Stories.groupByLevel(list)
        XCTAssertEqual(groups.map(\.level), ["A1", "A2"])
        XCTAssertEqual(groups[0].stories.map(\.title), ["a", "c"])
    }

    func testStatusSaysBestThenContinueThenNew() {
        XCTAssertEqual(Stories.status(summary("s", best: 2, total: 3)), "Best: 2 of 3")
        XCTAssertEqual(Stories.status(summary("s", index: 2)), "Continue reading")
        XCTAssertEqual(Stories.status(summary("s", index: 2, completed: true)), "New")
        XCTAssertEqual(Stories.status(summary("s")), "New")
    }

    func testNextSegmentNeverRunsPastTheTextOrLoops() {
        XCTAssertEqual(Stories.nextSegment(after: 0, count: 3), 1)
        XCTAssertNil(Stories.nextSegment(after: 2, count: 3))
        XCTAssertNil(Stories.nextSegment(after: 9, count: 3))
        XCTAssertNil(Stories.nextSegment(after: -1, count: 3))
    }

    func testAResumePointIsClampedIntoTheText() {
        XCTAssertEqual(Stories.clampSegment(7, count: 3), 2)
        XCTAssertEqual(Stories.clampSegment(-4, count: 3), 0)
        XCTAssertEqual(Stories.clampSegment(2, count: 0), 0)
        XCTAssertEqual(Stories.clampSegment(1, count: 3), 1)
    }

    func testTheWirePositionStaysInsideWhatTheServerAccepts() {
        XCTAssertEqual(Stories.wireSegment(-1), 0)
        XCTAssertEqual(Stories.wireSegment(500), 59)
        XCTAssertEqual(Stories.wireSegment(12), 12)
    }

    // MARK: - Narration

    func testNarrationHandsTheHighlightOnAndStopsAtTheEnd() {
        var run = StoryNarration(count: 2)
        run.start(at: 0)
        XCTAssertEqual(run.current, 0)
        XCTAssertTrue(run.playing)
        XCTAssertEqual(run.finishedCurrent(), 1)
        XCTAssertEqual(run.current, 1)
        XCTAssertNil(run.finishedCurrent())
        XCTAssertNil(run.current)
        XCTAssertFalse(run.playing)
        XCTAssertFalse(run.failed)
    }

    func testNarrationIgnoresAStartOutsideTheTextAndAFinishWhileStopped() {
        var run = StoryNarration(count: 2)
        run.start(at: 5)
        XCTAssertFalse(run.playing)
        run.start(at: 1)
        run.stop()
        XCTAssertNil(run.finishedCurrent())
        XCTAssertNil(run.current)
    }

    func testAFailedNarrationClearsTheHighlightAndSaysSo() {
        var run = StoryNarration(count: 3)
        run.start(at: 1)
        run.fail()
        XCTAssertTrue(run.failed)
        XCTAssertNil(run.current)
        XCTAssertFalse(run.playing)
        run.start(at: 0)
        XCTAssertFalse(run.failed, "playing again clears the failure")
    }

    // MARK: - Reading the library and one story

    func testTheLibraryReadsPublishedStoriesAndMergesProgress() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            if request.url!.path.hasSuffix("/stories") {
                return self.json([
                    ["id": self.storyID, "course": "en", "level_id": "A1", "slug": "s", "title": "Tom", "sort_order": 1,
                     "published": true, "segments": ["One.", "Two.", "Three."]],
                ])
            }
            return self.json([
                ["story_id": self.storyID, "segment_index": 2, "best_correct": 2, "check_total": 3, "completed_at": "2026-11-18T00:00:00Z"],
            ])
        }
        let stories = try await client.fetchStories(course: "en")
        XCTAssertEqual(stories.count, 1)
        XCTAssertEqual(stories[0].segmentCount, 3)
        XCTAssertEqual(stories[0].segmentIndex, 2)
        XCTAssertEqual(stories[0].bestCorrect, 2)
        XCTAssertEqual(stories[0].checkTotal, 3)
        XCTAssertTrue(stories[0].completed)
        let first = await box.requests.first!.url!.absoluteString
        XCTAssertTrue(first.contains("published=eq.true"))
        XCTAssertTrue(first.contains("course=eq.en"))
    }

    func testAFailedProgressReadNeverFailsTheLibrary() async throws {
        let client = makeClient { request in
            if request.url!.path.hasSuffix("/stories") {
                return self.json([["id": self.storyID, "course": "en", "level_id": "A1", "title": "Tom", "published": true, "segments": ["One."]]])
            }
            throw URLError(.timedOut)
        }
        let stories = try await client.fetchStories(course: "en")
        XCTAssertEqual(stories.first?.segmentIndex, 0)
        XCTAssertFalse(stories.first?.completed ?? true)
    }

    func testAnUnknownCourseAsksNothing() async throws {
        let box = RequestBox()
        let client = makeClient { request in await box.record(request); return self.json([]) }
        let stories = try await client.fetchStories(course: "de")
        XCTAssertTrue(stories.isEmpty)
        let count = await box.requests.count
        XCTAssertEqual(count, 0)
    }

    func testAStoryIsReadWithItsQuestionsKeyedByPosition() async throws {
        let client = makeClient { request in
            let path = request.url!.path
            if path.hasSuffix("/stories") {
                return self.json([["id": self.storyID, "course": "fr", "level_id": "A2", "title": "Marie", "published": true, "segments": ["Un.", "Deux."]]])
            }
            if path.hasSuffix("/story_quiz_questions") {
                return self.json([["position": 1, "prompt": "Q?", "choices": ["a", "b"], "answer_index": 1]])
            }
            return self.json([["segment_index": 9]])
        }
        let story = try await client.fetchStory(id: storyID)
        XCTAssertEqual(story?.questions.map(\.id), ["q1"])
        XCTAssertEqual(story?.questions.first?.answerIndex, 1)
        XCTAssertEqual(story?.segmentIndex, 1, "a saved position past the end is clamped")
        XCTAssertEqual(story?.course, "fr")
    }

    func testAStoryWithNoSentencesIsNilNotAnEmptyReader() async throws {
        let client = makeClient { request in
            if request.url!.path.hasSuffix("/stories") {
                return self.json([["id": self.storyID, "course": "en", "level_id": "A1", "title": "Branch", "published": true, "segments": []]])
            }
            return self.json([])
        }
        let story = try await client.fetchStory(id: storyID)
        XCTAssertNil(story)
    }

    func testAMissingOrUnpublishedStoryIsNil() async throws {
        let client = makeClient { _ in self.json([]) }
        let story = try await client.fetchStory(id: storyID)
        XCTAssertNil(story)
    }

    func testAnUnreadableQuestionRowIsAnErrorNotAShorterCheck() async {
        let client = makeClient { request in
            if request.url!.path.hasSuffix("/stories") {
                return self.json([["id": self.storyID, "course": "en", "level_id": "A1", "title": "Tom", "published": true, "segments": ["One."]]])
            }
            return self.json([["position": 1, "prompt": "Q?", "choices": ["a", "b"], "answer_index": 7]])
        }
        do {
            _ = try await client.fetchStory(id: storyID)
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .invalidPayload)
        }
    }

    // MARK: - Progress

    func testProgressGoesThroughTheRpcWithAClampedPosition() async throws {
        let box = RequestBox()
        let client = makeClient { request in await box.record(request); return self.json([]) }
        try await client.saveStoryProgress(storyID: storyID, segmentIndex: 900)
        let request = await box.last!
        XCTAssertEqual(request.url?.absoluteString, "https://project.supabase.co/rest/v1/rpc/save_story_progress")
        XCTAssertEqual(request.httpMethod, "POST")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["p_story_id", "p_segment_index"])
        XCTAssertEqual(body["p_segment_index"] as? Int, 59)
    }

    // MARK: - The check is graded on the server

    func testTheCheckSendsAnswersToTheEdgeFunctionNeverAScoreNeverTheRpc() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.json(["status": "applied", "correct": 2, "total": 3, "bestCorrect": 2, "missedQuestionIds": ["q3"]])
        }
        let result = try await client.submitStoryCheck(
            storyID: storyID,
            answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 1), PodcastQuizAnswer(questionID: "q2", choiceIndex: 0)])
        let request = await box.last!
        XCTAssertEqual(request.url?.absoluteString, "https://project.supabase.co/functions/v1/complete-story-check")
        XCTAssertFalse(request.url!.absoluteString.contains("rpc/submit_story_check"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["storyId", "answers"], "answers only: never a score, never a user id")
        let answers = body["answers"] as! [[String: Any]]
        for answer in answers { XCTAssertEqual(Set(answer.keys), ["questionId", "choiceIndex"]) }
        XCTAssertEqual(result.correct, 2, "the shown score is the server's")
        XCTAssertEqual(result.total, 3)
        XCTAssertEqual(result.xpGain, 0, "a story check pays no XP")
        XCTAssertEqual(result.missedQuestionIDs, ["q3"])
    }

    func testTheChecksRefusalsMapToStableErrors() async {
        let cases: [(Int, PodcastQuizError)] = [
            (404, .notFound), (400, .invalidAnswers), (401, .unauthorized), (403, .unauthorized), (503, .server),
        ]
        for (status, expected) in cases {
            let client = makeClient { _ in self.json([String: String](), status: status) }
            do {
                _ = try await client.submitStoryCheck(storyID: storyID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)])
                XCTFail("expected a throw for \(status)")
            } catch {
                XCTAssertEqual(error as? PodcastQuizError, expected, "status \(status)")
            }
        }
    }

    func testAnUnreadableSuccessIsAnErrorNeverAScore() async {
        let client = makeClient { _ in self.json(["status": "applied"]) }
        do {
            _ = try await client.submitStoryCheck(storyID: storyID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)])
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .server)
        }
    }

    func testANetworkFailureIsRetryableOffline() async {
        let client = makeClient { _ in throw URLError(.notConnectedToInternet) }
        do {
            _ = try await client.submitStoryCheck(storyID: storyID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)])
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .offline)
        }
    }
}
