import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// The podcast quiz: the run state machine, reading an episode's quiz, and submitting answers to the
/// complete-podcast-quiz Edge Function. Every request goes through an injected requester, so no test touches the network.
final class PodcastQuizTests: XCTestCase {
    private let supabaseURL = URL(string: "https://project.supabase.co")!
    private let episodeID = "11111111-1111-4111-8111-111111111111"

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

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        return (data, HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private let questions = [
        PodcastQuizQuestion(id: "q1", prompt: "First?", choices: ["a", "b", "c"], answerIndex: 1),
        PodcastQuizQuestion(id: "q2", prompt: "Second?", choices: ["a", "b"], answerIndex: 0),
    ]

    private func answeredAll(_ picks: [Int]) -> PodcastQuizRun {
        var run = PodcastQuizRun(questions: questions)
        for pick in picks {
            run.select(pick)
            run.check()
            run.next()
        }
        return run
    }

    // MARK: - The run

    func testStartsOnTheFirstQuestionWithNothingChosen() {
        let run = PodcastQuizRun(questions: questions)
        XCTAssertEqual(run.phase, .answering)
        XCTAssertEqual(run.index, 0)
        XCTAssertNil(run.selected)
        XCTAssertFalse(run.checked)
        XCTAssertEqual(run.current?.id, "q1")
    }

    func testAnEmptyQuizIsNeverStarted() {
        XCTAssertEqual(PodcastQuizRun(questions: []).phase, .empty)
    }

    func testCannotCheckWithoutAChoiceNorMoveOnWithoutChecking() {
        var run = PodcastQuizRun(questions: questions)
        run.check()
        XCTAssertFalse(run.checked)
        run.select(2)
        run.next()
        XCTAssertEqual(run.index, 0)
        XCTAssertTrue(run.answers.isEmpty)
    }

    func testTheChoiceIsLockedOnceChecked() {
        var run = PodcastQuizRun(questions: questions)
        run.select(2)
        run.check()
        run.select(1)
        XCTAssertEqual(run.selected, 2)
    }

    func testIgnoresAChoiceThatDoesNotExist() {
        var run = PodcastQuizRun(questions: questions)
        run.select(7)
        run.select(-1)
        XCTAssertNil(run.selected)
    }

    func testRecordsOneAnswerPerQuestionAndSubmitsAfterTheLast() {
        let run = answeredAll([1, 1])
        XCTAssertEqual(run.phase, .submitting)
        XCTAssertEqual(run.answers, [
            PodcastQuizAnswer(questionID: "q1", choiceIndex: 1),
            PodcastQuizAnswer(questionID: "q2", choiceIndex: 1),
        ])
    }

    func testAFailedSaveKeepsTheAnswersSoARetryResendsTheSameOnes() {
        var run = answeredAll([1, 0])
        let before = run.answers
        run.failed(.rateLimited)
        XCTAssertEqual(run.phase, .error(.rateLimited))
        run.retry()
        XCTAssertEqual(run.phase, .submitting)
        XCTAssertEqual(run.answers, before)
    }

    func testFinishesWithTheServersResultAndNotItsOwnMarking() {
        var run = answeredAll([1, 0]) // both right locally
        let result = PodcastQuizResult(
            correct: 0, total: 2, xpGain: 0, streak: 3, bestCorrect: 0, bestXP: 0, missedQuestionIDs: ["q1", "q2"])
        run.saved(result)
        XCTAssertEqual(run.phase, .done)
        XCTAssertEqual(run.result, result)
    }

    /// The shape of "Ordering Coffee" (seven questions, three choices, keys 1,0,2,1,2,0,2), walked past question 3 the
    /// way QA did: question 3 froze on a device. The run must accept a choice on every question, whatever was picked
    /// before, so a freeze there is the screen's (it was a dead tap target), never this state machine's.
    func testEveryQuestionOfASevenQuestionQuizTakesAChoiceAfterTheOnesBefore() {
        let keys = [1, 0, 2, 1, 2, 0, 2]
        let seven = keys.enumerated().map { offset, key in
            PodcastQuizQuestion(
                id: "q\(offset + 1)", prompt: "Question \(offset + 1)?", choices: ["a", "b", "c"], answerIndex: key)
        }
        for pick in 0..<3 {
            var run = PodcastQuizRun(questions: seven)
            for position in 0..<seven.count {
                XCTAssertEqual(run.index, position)
                XCTAssertNil(run.selected, "question \(position + 1) starts with nothing chosen")
                XCTAssertFalse(run.checked)
                run.select(pick)
                XCTAssertEqual(run.selected, pick, "question \(position + 1) took choice \(pick)")
                run.check()
                XCTAssertTrue(run.checked)
                run.next()
            }
            XCTAssertEqual(run.phase, .submitting)
            XCTAssertEqual(run.answers.map(\.choiceIndex), Array(repeating: pick, count: 7))
            XCTAssertEqual(run.answers.map(\.questionID), (1...7).map { "q\($0)" })
        }
        // The two device runs: question 2 answered right, then wrong; question 3 must still take a choice.
        for picks in [[1, 0], [1, 1]] {
            var run = PodcastQuizRun(questions: seven)
            for pick in picks {
                run.select(pick)
                run.check()
                run.next()
            }
            XCTAssertEqual(run.index, 2)
            run.select(2)
            XCTAssertEqual(run.selected, 2)
        }
    }

    func testSavedAndFailedAreIgnoredWhenNothingWasSubmitted() {
        var run = PodcastQuizRun(questions: questions)
        run.saved(PodcastQuizResult(correct: 2, total: 2, xpGain: 20, streak: 1, bestCorrect: 2, bestXP: 20, missedQuestionIDs: []))
        run.failed(.server)
        XCTAssertEqual(run.phase, .answering)
        XCTAssertNil(run.result)
    }

    // MARK: - Reading the quiz

    func testFetchQuizReadsTheQuestionsInOrderAndTheLearnersBest() async throws {
        let box = RequestBox()
        let client = makeClient { [supabaseURL] request in
            await box.record(request)
            let path = request.url!.path
            if path.hasSuffix("podcast_quiz_questions") {
                return self.jsonResponse(for: supabaseURL, body: [
                    ["id": "q1", "prompt": "One?", "choices": ["a", "b"], "answer_index": 1],
                    ["id": "q2", "prompt": "Two?", "choices": ["c", "d", "e"], "answer_index": 0],
                ])
            }
            return self.jsonResponse(for: supabaseURL, body: [["best_correct": 5, "best_xp": 50]])
        }
        let offer = try await client.fetchQuiz(episodeID: episodeID)
        XCTAssertEqual(offer?.questions.map(\.id), ["q1", "q2"])
        XCTAssertEqual(offer?.questions[1].choices, ["c", "d", "e"])
        XCTAssertEqual(offer?.questions[0].answerIndex, 1)
        XCTAssertEqual(offer?.best, PodcastQuizBest(correct: 5, xp: 50))
        let questionRequest = await box.requests.first!
        XCTAssertTrue(questionRequest.url!.absoluteString.contains("episode_id=eq.\(episodeID)"))
        XCTAssertTrue(questionRequest.url!.absoluteString.contains("order=sort_order.asc"))
        XCTAssertEqual(questionRequest.httpMethod, "GET")
    }

    func testAnEpisodeWithNoQuizOffersNothing() async throws {
        let client = makeClient { [supabaseURL] _ in self.jsonResponse(for: supabaseURL, body: [[String: Any]]()) }
        let offer = try await client.fetchQuiz(episodeID: episodeID)
        XCTAssertNil(offer)
    }

    func testAFailedBestScoreReadStillOffersTheQuiz() async throws {
        let client = makeClient { [supabaseURL] request in
            if request.url!.path.hasSuffix("podcast_quiz_questions") {
                return self.jsonResponse(for: supabaseURL, body: [
                    ["id": "q1", "prompt": "One?", "choices": ["a", "b"], "answer_index": 0]
                ])
            }
            return self.jsonResponse(for: supabaseURL, body: [String: Any](), status: 500)
        }
        let offer = try await client.fetchQuiz(episodeID: episodeID)
        XCTAssertEqual(offer?.questions.count, 1)
        XCTAssertNil(offer?.best)
    }

    func testAMalformedQuestionRowFailsLoudlyInsteadOfShrinkingTheQuiz() async {
        // A quiz with a hole in it would be graded as complete by the server and rejected as 400; better to say so now.
        let rows: [[[String: Any]]] = [
            [["id": "q1", "prompt": "One?", "choices": ["a", "b"], "answer_index": 5],
             ["id": "q2", "prompt": "Two?", "choices": ["a", "b"], "answer_index": 1]],
            [["id": "q1", "prompt": "One?", "choices": ["a", 2], "answer_index": 0]],
            [["prompt": "One?", "choices": ["a", "b"], "answer_index": 0]],
        ]
        for body in rows {
            let client = makeClient { [supabaseURL] _ in self.jsonResponse(for: supabaseURL, body: body) }
            do {
                _ = try await client.fetchQuiz(episodeID: episodeID)
                XCTFail("expected a throw for \(body)")
            } catch {
                XCTAssertEqual(error as? PodcastClientError, .invalidPayload)
            }
        }
    }

    func testFetchQuizSurfacesAFailedQuestionRead() async {
        let client = makeClient { [supabaseURL] _ in self.jsonResponse(for: supabaseURL, body: [String: Any](), status: 500) }
        do {
            _ = try await client.fetchQuiz(episodeID: episodeID)
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .server(status: 500))
        }
    }

    // MARK: - Which episodes have a quiz

    func testFetchQuizEpisodeIDsAsksOnceAndReturnsEachEpisodeOnce() async throws {
        let box = RequestBox()
        let client = makeClient { [supabaseURL] request in
            await box.record(request)
            return self.jsonResponse(for: supabaseURL, body: [
                ["episode_id": "e1"], ["episode_id": "e1"], ["episode_id": "e3"],
            ])
        }
        let ids = try await client.fetchQuizEpisodeIDs(episodeIDs: ["e1", "e2", "e3"])
        XCTAssertEqual(ids, ["e1", "e3"])
        let requests = await box.requests
        XCTAssertEqual(requests.count, 1)
        let url = requests[0].url!.absoluteString
        XCTAssertTrue(url.contains("podcast_quiz_questions"))
        XCTAssertTrue(url.contains("select=episode_id"))
        XCTAssertTrue(url.contains("episode_id=in.(e1,e2,e3)"))
    }

    func testNoEpisodesMeansNoRequest() async throws {
        let box = RequestBox()
        let client = makeClient { [supabaseURL] request in
            await box.record(request)
            return self.jsonResponse(for: supabaseURL, body: [[String: Any]]())
        }
        let ids = try await client.fetchQuizEpisodeIDs(episodeIDs: [])
        XCTAssertTrue(ids.isEmpty)
        let count = await box.requests.count
        XCTAssertEqual(count, 0)
    }

    func testAFailedReadOfWhichEpisodesHaveAQuizIsAnError() async {
        let client = makeClient { [supabaseURL] _ in self.jsonResponse(for: supabaseURL, body: [String: Any](), status: 500) }
        do {
            _ = try await client.fetchQuizEpisodeIDs(episodeIDs: ["e1"])
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .server(status: 500))
        }
    }

    // MARK: - Submitting

    private let applied: [String: Any] = [
        "status": "applied", "correct": 5, "total": 7, "xpGain": 30, "streak": 4,
        "bestCorrect": 5, "bestXp": 50, "missedQuestionIds": ["q2", "q6"],
    ]

    func testSubmitSendsTheAnswersAndTheFinishTimeToTheEdgeFunctionAndNothingElse() async throws {
        let box = RequestBox()
        let client = makeClient { [supabaseURL, applied] request in
            await box.record(request)
            return self.jsonResponse(for: supabaseURL, body: applied)
        }
        let finished = Date(timeIntervalSince1970: 1_793_793_600) // 2026-11-04T12:00:00Z
        let result = try await client.submitQuiz(
            episodeID: episodeID,
            answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 2), PodcastQuizAnswer(questionID: "q2", choiceIndex: 0)],
            completedAt: finished)

        let request = await box.last!
        XCTAssertEqual(request.url?.absoluteString, "https://project.supabase.co/functions/v1/complete-podcast-quiz")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "publishable-key")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["episodeId", "answers", "completedAt"])
        XCTAssertEqual(body["episodeId"] as? String, episodeID)
        XCTAssertEqual(body["completedAt"] as? String, ISO8601DateFormatter().string(from: finished))
        let answers = body["answers"] as! [[String: Any]]
        XCTAssertEqual(answers.count, 2)
        for answer in answers { XCTAssertEqual(Set(answer.keys), ["questionId", "choiceIndex"]) }
        XCTAssertEqual(answers[0]["choiceIndex"] as? Int, 2)

        XCTAssertEqual(result, PodcastQuizResult(
            correct: 5, total: 7, xpGain: 30, streak: 4, bestCorrect: 5, bestXP: 50, missedQuestionIDs: ["q2", "q6"]))
    }

    func testSubmitMapsTheServersRefusalsToStableErrors() async {
        let cases: [(Int, String?, PodcastQuizError)] = [
            (429, "rate-limited", .rateLimited),
            (404, "not-found", .notFound),
            (400, "invalid-answers", .invalidAnswers),
            (401, nil, .unauthorized),
            (403, nil, .unauthorized),
            (503, nil, .server),
        ]
        for (status, code, expected) in cases {
            let client = makeClient { [supabaseURL] _ in
                self.jsonResponse(for: supabaseURL, body: code.map { ["error": $0] } ?? [String: String](), status: status)
            }
            do {
                _ = try await client.submitQuiz(
                    episodeID: episodeID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)], completedAt: Date())
                XCTFail("expected a throw for \(status)")
            } catch {
                XCTAssertEqual(error as? PodcastQuizError, expected, "status \(status)")
            }
        }
    }

    func testAnUnreadableSuccessIsAnErrorNeverAScore() async {
        let client = makeClient { [supabaseURL] _ in self.jsonResponse(for: supabaseURL, body: ["status": "applied"]) }
        do {
            _ = try await client.submitQuiz(
                episodeID: episodeID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)], completedAt: Date())
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .server)
        }
    }

    func testANetworkFailureIsARetryableServerError() async {
        let client = makeClient { _ in throw URLError(.notConnectedToInternet) }
        do {
            _ = try await client.submitQuiz(
                episodeID: episodeID, answers: [PodcastQuizAnswer(questionID: "q1", choiceIndex: 0)], completedAt: Date())
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .offline)
        }
    }

    // MARK: - Copy

    func testOnlyFailuresThatRetryingCanFixOfferTryAgain() {
        XCTAssertTrue(PodcastQuizError.rateLimited.isRetryable)
        XCTAssertTrue(PodcastQuizError.offline.isRetryable)
        XCTAssertTrue(PodcastQuizError.server.isRetryable)
        XCTAssertFalse(PodcastQuizError.notFound.isRetryable)
        XCTAssertFalse(PodcastQuizError.invalidAnswers.isRetryable)
        XCTAssertFalse(PodcastQuizError.unauthorized.isRetryable)
    }

    func testARetryOfANonRetryableFailureDoesNothing() {
        var run = answeredAll([1, 0])
        run.failed(.notFound)
        run.retry()
        XCTAssertEqual(run.phase, .error(.notFound))
    }

    func testEachRefusalHasItsOwnCopy() {
        let all: [PodcastQuizError] = [.rateLimited, .offline, .notFound, .invalidAnswers, .unauthorized, .server]
        let messages = all.map { PodcastQuizCopy.message(for: $0) }
        XCTAssertEqual(Set(messages).count, messages.count, "every error should say something different")
        XCTAssertTrue(PodcastQuizCopy.message(for: .notFound).contains("isn't available"))
        XCTAssertTrue(PodcastQuizCopy.message(for: .invalidAnswers).contains("open it again"))
    }

    func testCopyForEachFailureIsCalmAndSpecific() {
        XCTAssertEqual(PodcastQuizCopy.message(for: .rateLimited), "Slow down a little and try again.")
        XCTAssertTrue(PodcastQuizCopy.message(for: .offline).lowercased().contains("connection"))
        XCTAssertFalse(PodcastQuizCopy.message(for: .server).isEmpty)
    }

    func testTheXPLineSaysWhatHappened() {
        let paid = PodcastQuizResult(correct: 5, total: 7, xpGain: 50, streak: 1, bestCorrect: 5, bestXP: 50, missedQuestionIDs: [])
        let replay = PodcastQuizResult(correct: 4, total: 7, xpGain: 0, streak: 1, bestCorrect: 6, bestXP: 60, missedQuestionIDs: [])
        XCTAssertEqual(PodcastQuizCopy.xpLine(for: paid), "+50 XP")
        XCTAssertEqual(PodcastQuizCopy.xpLine(for: replay), "No new XP this time. Your best is 6 of 7.")
    }
}
