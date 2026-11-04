import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// The podcast quiz: after an episode, a short quiz about it, paid as listening practice.
//
// Every rule that decides a score or XP lives on the server (public.submit_podcast_quiz, reached through the
// complete-podcast-quiz Edge Function). This file holds what the app needs around it: the run the learner steps
// through, reading an episode's quiz, and sending the chosen answers. The client never sends a score, and the score
// it shows is the server's.

public struct PodcastQuizQuestion: Equatable, Sendable {
    public let id: String
    public let prompt: String
    public let choices: [String]
    /// Used only to show the learner which answer was right; it never affects what is paid.
    public let answerIndex: Int

    public init(id: String, prompt: String, choices: [String], answerIndex: Int) {
        self.id = id
        self.prompt = prompt
        self.choices = choices
        self.answerIndex = answerIndex
    }
}

public struct PodcastQuizBest: Equatable, Sendable {
    public let correct: Int
    public let xp: Int

    public init(correct: Int, xp: Int) {
        self.correct = correct
        self.xp = xp
    }
}

public struct PodcastQuizOffer: Equatable, Sendable {
    public let questions: [PodcastQuizQuestion]
    public let best: PodcastQuizBest?

    public init(questions: [PodcastQuizQuestion], best: PodcastQuizBest?) {
        self.questions = questions
        self.best = best
    }
}

public struct PodcastQuizAnswer: Equatable, Sendable {
    public let questionID: String
    public let choiceIndex: Int

    public init(questionID: String, choiceIndex: Int) {
        self.questionID = questionID
        self.choiceIndex = choiceIndex
    }
}

/// What the server decided. The only score the app ever shows.
public struct PodcastQuizResult: Equatable, Sendable {
    public let correct: Int
    public let total: Int
    public let xpGain: Int
    public let streak: Int
    public let bestCorrect: Int
    public let bestXP: Int
    public let missedQuestionIDs: [String]

    public init(
        correct: Int, total: Int, xpGain: Int, streak: Int, bestCorrect: Int, bestXP: Int, missedQuestionIDs: [String]
    ) {
        self.correct = correct
        self.total = total
        self.xpGain = xpGain
        self.streak = streak
        self.bestCorrect = bestCorrect
        self.bestXP = bestXP
        self.missedQuestionIDs = missedQuestionIDs
    }
}

public enum PodcastQuizError: Error, Equatable, Sendable {
    /// The hourly ceiling shared with lessons (HTTP 429, code "rate-limited").
    case rateLimited
    /// The episode has no quiz, or the learner cannot see the episode.
    case notFound
    /// The answers were not exactly one per question.
    case invalidAnswers
    case unauthorized
    case offline
    case server

    /// Whether sending the same answers again can help. A missing quiz or malformed answers will not fix themselves, so
    /// offering "Try again" for them would be an endless loop.
    public var isRetryable: Bool {
        switch self {
        case .rateLimited, .offline, .server: return true
        case .notFound, .invalidAnswers, .unauthorized: return false
        }
    }
}

/// The learner's pass through one quiz. A value type with no I/O, so every rule is testable without a screen.
public struct PodcastQuizRun: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case empty
        case answering
        case submitting
        case error(PodcastQuizError)
        case done
    }

    public let questions: [PodcastQuizQuestion]
    public private(set) var phase: Phase
    public private(set) var index = 0
    public private(set) var selected: Int?
    public private(set) var checked = false
    public private(set) var answers: [PodcastQuizAnswer] = []
    public private(set) var result: PodcastQuizResult?

    public init(questions: [PodcastQuizQuestion]) {
        self.questions = questions
        self.phase = questions.isEmpty ? .empty : .answering
    }

    public var current: PodcastQuizQuestion? {
        questions.indices.contains(index) ? questions[index] : nil
    }

    public var isLastQuestion: Bool { index + 1 >= questions.count }

    public mutating func select(_ choice: Int) {
        guard phase == .answering, !checked, let question = current,
              question.choices.indices.contains(choice) else { return }
        selected = choice
    }

    public mutating func check() {
        guard phase == .answering, selected != nil else { return }
        checked = true
    }

    public mutating func next() {
        guard phase == .answering, checked, let selected, let question = current else { return }
        answers.append(PodcastQuizAnswer(questionID: question.id, choiceIndex: selected))
        self.selected = nil
        checked = false
        if isLastQuestion { phase = .submitting } else { index += 1 }
    }

    public mutating func saved(_ result: PodcastQuizResult) {
        guard phase == .submitting else { return }
        self.result = result
        phase = .done
    }

    public mutating func failed(_ error: PodcastQuizError) {
        guard phase == .submitting else { return }
        phase = .error(error)
    }

    /// Resend the same answers after a failure.
    public mutating func retry() {
        guard case let .error(error) = phase, error.isRetryable else { return }
        phase = .submitting
    }
}

public enum PodcastQuizCopy {
    public static let offerTitle = "Test what you heard"

    public static func offerDetail(questionCount: Int, best: PodcastQuizBest?) -> String {
        var line = "\(questionCount) questions · 10 XP for each correct answer"
        if let best { line += " · your best: \(best.correct) of \(questionCount)" }
        return line
    }

    public static func message(for error: PodcastQuizError) -> String {
        switch error {
        case .rateLimited: return "Slow down a little and try again."
        case .offline: return "We couldn't save your answers. Check your connection and try again."
        case .notFound: return "This quiz isn't available right now."
        case .unauthorized: return "Please sign in again to save your answers."
        case .invalidAnswers: return "Something went wrong with your answers. Leave the quiz and open it again."
        case .server: return "We couldn't save your answers. Please try again."
        }
    }

    public static func xpLine(for result: PodcastQuizResult) -> String {
        result.xpGain > 0
            ? "+\(result.xpGain) XP"
            : "No new XP this time. Your best is \(result.bestCorrect) of \(result.total)."
    }
}

extension PodcastClient {
    /// An episode's quiz as the signed-in learner may see it, plus their banked best. RLS decides visibility, exactly
    /// like the episode's audio and transcript: an unpublished episode returns nothing. Nil when there is no quiz.
    /// A failed read of the best score never hides the quiz; it is only a label.
    public func fetchQuiz(episodeID: String) async throws -> PodcastQuizOffer? {
        let questionsRequest = request(
            path: "rest/v1/podcast_quiz_questions",
            query: "select=id,prompt,choices,answer_index&episode_id=eq.\(episodeID)&order=sort_order.asc",
            method: "GET"
        )
        let (data, response) = try await requester(questionsRequest)
        try Self.requireSuccess(response: response)
        // A row the app cannot read is an error, not something to drop: a quiz with a hole in it would be rejected by the
        // server as a wrong number of answers, or worse, look complete while missing a question.
        let questions: [PodcastQuizQuestion] = try Self.rows(from: data).map { row in
            guard let id = row["id"] as? String,
                  let prompt = row["prompt"] as? String,
                  let choices = row["choices"] as? [String],
                  let answerIndex = row["answer_index"] as? Int,
                  choices.indices.contains(answerIndex) else { throw PodcastClientError.invalidPayload }
            return PodcastQuizQuestion(id: id, prompt: prompt, choices: choices, answerIndex: answerIndex)
        }
        guard !questions.isEmpty else { return nil }

        var best: PodcastQuizBest?
        let bestRequest = request(
            path: "rest/v1/podcast_quiz_awards",
            query: "select=best_correct,best_xp&episode_id=eq.\(episodeID)&limit=1",
            method: "GET"
        )
        if let (bestData, bestResponse) = try? await requester(bestRequest),
           (try? Self.requireSuccess(response: bestResponse)) != nil,
           let row = (try? Self.rows(from: bestData))?.first,
           let correct = row["best_correct"] as? Int, let xp = row["best_xp"] as? Int {
            best = PodcastQuizBest(correct: correct, xp: xp)
        }
        return PodcastQuizOffer(questions: questions, best: best)
    }

    /// Which of these episodes have a quiz the learner can open, for the "Take the quiz" button on an episode row.
    /// One request for the lot; nothing is sent for an empty list.
    public func fetchQuizEpisodeIDs(episodeIDs: [String]) async throws -> Set<String> {
        guard !episodeIDs.isEmpty else { return [] }
        let request = request(
            path: "rest/v1/podcast_quiz_questions",
            query: "select=episode_id&episode_id=in.(\(episodeIDs.joined(separator: ",")))",
            method: "GET"
        )
        let (data, response) = try await requester(request)
        try Self.requireSuccess(response: response)
        return Set(try Self.rows(from: data).compactMap { $0["episode_id"] as? String })
    }

    /// Sends the learner's chosen answers and the time they finished to the complete-podcast-quiz Edge Function
    /// (never a score). The server clamps `completedAt` like a lesson's, so the streak day cannot be moved by a fast or
    /// slow device clock.
    public func submitQuiz(
        episodeID: String,
        answers: [PodcastQuizAnswer],
        completedAt: Date
    ) async throws -> PodcastQuizResult {
        var request = request(path: "functions/v1/complete-podcast-quiz", method: "POST")
        request.timeoutInterval = 30
        let payload: [String: Any] = [
            "episodeId": episodeID,
            "answers": answers.map { ["questionId": $0.questionID, "choiceIndex": $0.choiceIndex] },
            "completedAt": ISO8601DateFormatter().string(from: completedAt),
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await requester(request)
        } catch is URLError {
            throw PodcastQuizError.offline
        } catch {
            throw PodcastQuizError.server
        }
        guard let http = response as? HTTPURLResponse else { throw PodcastQuizError.server }
        switch http.statusCode {
        case 200..<300: break
        case 429: throw PodcastQuizError.rateLimited
        case 404: throw PodcastQuizError.notFound
        case 400: throw PodcastQuizError.invalidAnswers
        case 401, 403: throw PodcastQuizError.unauthorized
        default: throw PodcastQuizError.server
        }
        // A 2xx we cannot read is an error, never a score: the server may have recorded it, and a resend is harmless
        // (a replay that adds nothing pays nothing).
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["status"] as? String == "applied",
              let correct = object["correct"] as? Int,
              let total = object["total"] as? Int,
              let xpGain = object["xpGain"] as? Int,
              let bestCorrect = object["bestCorrect"] as? Int,
              let bestXP = object["bestXp"] as? Int else { throw PodcastQuizError.server }
        return PodcastQuizResult(
            correct: correct,
            total: total,
            xpGain: xpGain,
            streak: object["streak"] as? Int ?? 0,
            bestCorrect: bestCorrect,
            bestXP: bestXP,
            missedQuestionIDs: object["missedQuestionIds"] as? [String] ?? []
        )
    }
}
