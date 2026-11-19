import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Graded stories: leveled texts read along with narration (docs/superpowers/specs/2026-11-17-graded-stories-design.md).
// Mirrors src/lib/stories.ts and src/lib/stories.functions.ts, and the podcast model.
//
// The database decides what a learner may see (RLS: published stories only) and the filter here is a second line, so a
// draft that ever reached the client still never shows. The check is graded on the SERVER from the stored key: the app
// sends the chosen answers to the complete-story-check Edge Function, which calls public.submit_story_check with the
// verified user id (that function is service-role only, so the app never calls it directly). The score shown is the
// server's.

public struct StorySummary: Equatable, Identifiable, Sendable {
    public let id: String
    public let course: String
    public let level: String
    public let slug: String
    public let title: String
    public let sortOrder: Int
    public let published: Bool
    /// Where the learner has read up to; 0 when never opened.
    public let segmentIndex: Int
    public let segmentCount: Int
    /// The best check score, or nil until the check is first taken.
    public let bestCorrect: Int?
    public let checkTotal: Int?
    public let completed: Bool
    /// A "choose your path" story: its text lives in the node graph, so it has no top-level sentences.
    public let branching: Bool
    /// The first scene's art (public `story-art` URL), or nil: a linear story, or a branching one without art. The library
    /// draws a designed fallback then, never a broken image.
    public let coverURL: URL?
    /// Endings in a branching story's node graph; 0 for a linear story.
    public let endingsTotal: Int
    /// Distinct endings this learner has reached (`story_progress.endings_found`), never more than `endingsTotal`.
    public let endingsFound: Int

    public init(
        id: String, course: String, level: String, slug: String, title: String, sortOrder: Int, published: Bool,
        segmentIndex: Int, segmentCount: Int, bestCorrect: Int?, checkTotal: Int?, completed: Bool,
        branching: Bool = false, coverURL: URL? = nil, endingsTotal: Int = 0, endingsFound: Int = 0
    ) {
        self.id = id
        self.course = course
        self.level = level
        self.slug = slug
        self.title = title
        self.sortOrder = sortOrder
        self.published = published
        self.segmentIndex = segmentIndex
        self.segmentCount = segmentCount
        self.bestCorrect = bestCorrect
        self.checkTotal = checkTotal
        self.completed = completed
        self.branching = branching
        self.coverURL = coverURL
        self.endingsTotal = max(0, endingsTotal)
        self.endingsFound = min(max(0, endingsFound), max(0, endingsTotal))
    }
}

public struct Story: Equatable, Identifiable, Sendable {
    public let id: String
    public let course: String
    public let level: String
    public let title: String
    public let segments: [String]
    /// The check's questions, in the podcast quiz's shape so the same run is reused.
    public let questions: [PodcastQuizQuestion]
    /// Where the learner left off, already clamped into the text.
    public let segmentIndex: Int

    public init(
        id: String, course: String, level: String, title: String, segments: [String],
        questions: [PodcastQuizQuestion], segmentIndex: Int
    ) {
        self.id = id
        self.course = course
        self.level = level
        self.title = title
        self.segments = segments
        self.questions = questions
        self.segmentIndex = segmentIndex
    }
}

public struct StoryLevelGroup: Equatable, Sendable {
    public let level: String
    public let stories: [StorySummary]
}

/// The library's three parts: the featured story, the continue line and the cover grid.
public struct StoriesLibraryLayout: Equatable, Sendable {
    public let featured: StorySummary?
    public let resume: StorySummary?
    public let grid: [StorySummary]
}

public enum Stories {
    public static let courses: Set<String> = ["en", "fr", "es"]

    /// Only published stories in the learner's course, in a stable order. A branching story has no top-level sentences
    /// (its text lives in `nodes`, read by the branching reader), so it is listed by its flag; a linear story with no
    /// sentences is left out rather than opened empty.
    public static func visible(_ stories: [StorySummary], course: String) -> [StorySummary] {
        stories
            .filter { $0.published && $0.course == course && ($0.branching || $0.segmentCount > 0) }
            .sorted {
                if $0.level != $1.level { return $0.level < $1.level }
                if $0.sortOrder != $1.sortOrder { return $0.sortOrder < $1.sortOrder }
                return $0.title < $1.title
            }
    }

    /// Stories grouped by level (A1 before A2), each group in reading order.
    public static func groupByLevel(_ stories: [StorySummary]) -> [StoryLevelGroup] {
        var order: [String] = []
        var groups: [String: [StorySummary]] = [:]
        for story in stories {
            if groups[story.level] == nil { order.append(story.level) }
            groups[story.level, default: []].append(story)
        }
        return order.sorted().map { StoryLevelGroup(level: $0, stories: groups[$0] ?? []) }
    }

    public static func levelLabel(_ level: String) -> String {
        switch level {
        case "A1": return "A1 · Beginner"
        case "A2": return "A2 · Elementary"
        case "B1": return "B1 · Intermediate"
        case "B2": return "B2 · Upper intermediate"
        case "C1": return "C1 · Advanced"
        default: return level
        }
    }

    /// Splits the visible stories for the library. Featured is the newest branching story (the highest sort order: stories
    /// are added at the end). Resume is a linear story the learner started and has not finished: its saved position is
    /// stored, a branching path's position is not, so a branching story is never offered there. The grid is everything
    /// except the featured and the resume story (each is shown once), in level then reading order.
    public static func library(_ stories: [StorySummary], course: String) -> StoriesLibraryLayout {
        let shown = Stories.visible(stories, course: course)
        var featured: StorySummary?
        for story in shown where story.branching {
            if featured == nil || story.sortOrder >= featured!.sortOrder { featured = story }
        }
        let resume = shown.first { !$0.branching && $0.segmentIndex > 0 && !$0.completed }
        return StoriesLibraryLayout(featured: featured, resume: resume, grid: shown.filter { $0.id != featured?.id && $0.id != resume?.id })
    }

    /// "3 of 5 endings".
    public static func endingsLine(_ story: StorySummary) -> String { "\(story.endingsFound) of \(story.endingsTotal) endings" }

    /// The hero's line: "A2 · 4 endings · 1 found".
    public static func heroLine(_ story: StorySummary) -> String {
        "\(story.level) · \(story.endingsTotal) \(story.endingsTotal == 1 ? "ending" : "endings") · \(story.endingsFound) found"
    }

    /// What a card says under its title: the endings progress (branching) or the read state (linear).
    public static func caption(_ story: StorySummary) -> String {
        story.branching && story.endingsTotal > 0 ? endingsLine(story) : status(story)
    }

    /// The one full accessible name of a card or the hero.
    public static func cardLabel(_ story: StorySummary) -> String {
        var parts = [story.title, story.level]
        if story.branching { parts.append(BranchingCopy.badge) }
        parts.append(caption(story))
        return parts.joined(separator: ", ")
    }

    /// The continue line: the saved segment counted from 1.
    public static func resumeLine(_ story: StorySummary) -> String { "Continue · Scene \(story.segmentIndex + 1)" }

    /// Fraction of endings found, 0...1, for the progress ring.
    public static func endingsFraction(_ story: StorySummary) -> Double {
        story.endingsTotal <= 0 ? 0 : min(1, Double(story.endingsFound) / Double(story.endingsTotal))
    }

    /// Cover art and endings counts from a stored `nodes` object and the learner's saved ending ids: the first scene's
    /// art, the number of endings in the graph, and how many of the saved ids are real endings of it.
    public static func branchingFacts(nodes: Any?, savedEndings: Any?, supabaseURL: URL) -> (cover: URL?, total: Int, found: Int) {
        guard let graph = Branching.parseGraph(from: nodes, supabaseURL: supabaseURL) else { return (nil, 0, 0) }
        let ids = Set(Branching.allEndings(graph).map(\.id))
        let saved = Set((savedEndings as? [Any])?.compactMap { $0 as? String } ?? [])
        return (graph.map[graph.start]?.artURL, ids.count, saved.intersection(ids).count)
    }

    /// A short status for a library row.
    public static func status(_ story: StorySummary) -> String {
        if story.branching { return Branching.status(completed: story.completed) }
        if let total = story.checkTotal, let best = story.bestCorrect { return "Best: \(best) of \(total)" }
        if story.segmentIndex > 0 && !story.completed { return "Continue reading" }
        return "New"
    }

    /// The segment to narrate after `index` ends, or nil at the end. Out-of-range input is the end, so a stale index
    /// can never loop or run past the text.
    public static func nextSegment(after index: Int, count: Int) -> Int? {
        guard index >= 0, index + 1 < count else { return nil }
        return index + 1
    }

    /// A saved resume point, clamped into the text (a story can be re-edited shorter than a saved position).
    public static func clampSegment(_ index: Int, count: Int) -> Int {
        guard index > 0, count > 0 else { return 0 }
        return min(index, count - 1)
    }

    /// The server accepts 0...59 for a saved position (src/lib/stories.functions.ts).
    public static func wireSegment(_ index: Int) -> Int { max(0, min(index, 59)) }

    public static func segments(from value: Any?) -> [String] {
        (value as? [Any])?.compactMap { $0 as? String } ?? []
    }
}

/// What the narration should do. A value type with no audio, so each rule is testable without a device: it hands the
/// highlight from sentence to sentence and says when a failure stops it.
public struct StoryNarration: Equatable, Sendable {
    public private(set) var current: Int?
    public private(set) var playing = false
    /// True after the narration voice could not be reached; the text stays readable.
    public private(set) var failed = false
    public let count: Int

    public init(count: Int) { self.count = count }

    /// Starts (or restarts) at `index`; an index outside the text does nothing.
    public mutating func start(at index: Int) {
        guard index >= 0, index < count else { return }
        current = index
        playing = true
        failed = false
    }

    /// The current sentence finished; returns the next one to play, or nil when the story has ended.
    @discardableResult
    public mutating func finishedCurrent() -> Int? {
        guard playing, let now = current else { return nil }
        if let next = Stories.nextSegment(after: now, count: count) {
            current = next
            return next
        }
        current = nil
        playing = false
        return nil
    }

    public mutating func stop() {
        current = nil
        playing = false
    }

    public mutating func fail() {
        current = nil
        playing = false
        failed = true
    }
}

public enum StoryCopy {
    public static let emptyTitle = "No stories yet"
    public static let emptyMessage = "New stories appear here as they are published."
    public static let checkTitle = "Check your understanding"
    public static let countsLine = "This counts toward your reading practice."
    public static let narrationUnavailable = "Narration isn't available right now. You can still read and tap any word."
    public static let narrationNeedsAI = "Narration uses AI speech, which is turned off. You can still read and tap any word."

    public static func message(for error: PodcastQuizError) -> String {
        switch error {
        case .notFound: return "This check isn't available right now."
        case .rateLimited, .offline, .server, .unauthorized, .invalidAnswers: return PodcastQuizCopy.message(for: error)
        }
    }
}

extension PodcastClient {
    static let storyColumns = "id,course,level_id,slug,title,segments,sort_order,published,branching"
    static let storyProgressColumns = "story_id,segment_index,best_correct,check_total,completed_at,endings_found"
    /// The library also reads `nodes`, for each branching story's cover art and endings count.
    static let storyListColumns = storyColumns + ",nodes"

    /// The published stories in one course with this learner's progress (RLS limits both reads). A failed progress read
    /// never fails the library: the stories still open, they just show as new.
    public func fetchStories(course: String) async throws -> [StorySummary] {
        guard Stories.courses.contains(course) else { return [] }
        let storiesRequest = request(
            path: "rest/v1/stories",
            query: "select=\(Self.storyListColumns)&course=eq.\(course)&published=eq.true&order=sort_order.asc",
            method: "GET"
        )
        let (data, response) = try await requester(storiesRequest)
        try Self.requireSuccess(response: response)
        let rows = try Self.rows(from: data)
        guard !rows.isEmpty else { return [] }

        var progress: [String: [String: Any]] = [:]
        let ids = rows.compactMap { $0["id"] as? String }
        let progressRequest = request(
            path: "rest/v1/story_progress",
            query: "select=\(Self.storyProgressColumns)&story_id=in.(\(ids.joined(separator: ",")))",
            method: "GET"
        )
        if let (progressData, progressResponse) = try? await requester(progressRequest),
           (try? Self.requireSuccess(response: progressResponse)) != nil,
           let progressRows = try? Self.rows(from: progressData) {
            for row in progressRows { if let id = row["story_id"] as? String { progress[id] = row } }
        }

        return rows.compactMap { row in
            guard let id = row["id"] as? String,
                  let level = row["level_id"] as? String,
                  let title = row["title"] as? String else { return nil }
            let saved = progress[id]
            let completedAt: Any? = saved?["completed_at"]
            let isBranching = row["branching"] as? Bool ?? false
            let facts = isBranching
                ? Stories.branchingFacts(nodes: row["nodes"], savedEndings: saved?["endings_found"], supabaseURL: supabaseURL)
                : (cover: nil, total: 0, found: 0)
            return StorySummary(
                id: id,
                course: row["course"] as? String ?? course,
                level: level,
                slug: row["slug"] as? String ?? "",
                title: title,
                sortOrder: row["sort_order"] as? Int ?? 0,
                published: row["published"] as? Bool ?? false,
                segmentIndex: saved?["segment_index"] as? Int ?? 0,
                segmentCount: Stories.segments(from: row["segments"]).count,
                bestCorrect: saved?["best_correct"] as? Int,
                checkTotal: saved?["check_total"] as? Int,
                completed: completedAt != nil && !(completedAt is NSNull),
                branching: isBranching,
                coverURL: facts.cover,
                endingsTotal: facts.total,
                endingsFound: facts.found
            )
        }
    }

    /// One published story with its check questions; nil when it does not exist or is not published. A question row the
    /// app cannot read is an error, never dropped: a check with a hole in it would be refused by the server as the wrong
    /// number of answers.
    public func fetchStory(id: String) async throws -> Story? {
        let storyRequest = request(
            path: "rest/v1/stories",
            query: "select=\(Self.storyColumns)&id=eq.\(id)&published=eq.true",
            method: "GET"
        )
        let (data, response) = try await requester(storyRequest)
        try Self.requireSuccess(response: response)
        guard let row = try Self.rows(from: data).first,
              let course = row["course"] as? String, Stories.courses.contains(course),
              let level = row["level_id"] as? String,
              let title = row["title"] as? String else { return nil }

        let questionsRequest = request(
            path: "rest/v1/story_quiz_questions",
            query: "select=position,prompt,choices,answer_index&story_id=eq.\(id)&order=position.asc",
            method: "GET"
        )
        let (questionData, questionResponse) = try await requester(questionsRequest)
        try Self.requireSuccess(response: questionResponse)
        let questions: [PodcastQuizQuestion] = try Self.rows(from: questionData).map { question in
            guard let position = question["position"] as? Int,
                  let prompt = question["prompt"] as? String,
                  let choices = question["choices"] as? [String],
                  let answerIndex = question["answer_index"] as? Int,
                  choices.indices.contains(answerIndex) else { throw PodcastClientError.invalidPayload }
            // The same id the server grades by: "q" plus the question's position.
            return PodcastQuizQuestion(id: "q\(position)", prompt: prompt, choices: choices, answerIndex: answerIndex)
        }

        var resume = 0
        let progressRequest = request(
            path: "rest/v1/story_progress",
            query: "select=segment_index&story_id=eq.\(id)&limit=1",
            method: "GET"
        )
        if let (progressData, progressResponse) = try? await requester(progressRequest),
           (try? Self.requireSuccess(response: progressResponse)) != nil,
           let saved = (try? Self.rows(from: progressData))?.first?["segment_index"] as? Int {
            resume = saved
        }
        let segments = Stories.segments(from: row["segments"])
        // A branching story has no sentences (see `Stories.visible`): not a story this reader can show.
        guard !segments.isEmpty else { return nil }
        return Story(
            id: id, course: course, level: level, title: title, segments: segments, questions: questions,
            segmentIndex: Stories.clampSegment(resume, count: segments.count)
        )
    }

    /// Through `save_story_progress`, which takes the user from auth.uid(), requires a published story and clamps the
    /// position into the text. The table has no client write grant. Garnish: the reader never blocks on it.
    public func saveStoryProgress(storyID: String, segmentIndex: Int) async throws {
        var request = request(path: "rest/v1/rpc/save_story_progress", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_story_id": storyID,
            "p_segment_index": Stories.wireSegment(segmentIndex),
        ])
        let (_, response) = try await requester(request)
        try Self.requireSuccess(response: response)
    }

    /// Sends the learner's chosen answers (never a score) to the complete-story-check Edge Function, which grades them
    /// from the stored key through the service-role-only `submit_story_check` and credits the reading skill once.
    /// A 2xx that cannot be read is an error, never a score: a resend is harmless (a repeat only raises the best).
    public func submitStoryCheck(storyID: String, answers: [PodcastQuizAnswer]) async throws -> PodcastQuizResult {
        var request = request(path: "functions/v1/complete-story-check", method: "POST")
        request.timeoutInterval = 30
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "storyId": storyID,
            "answers": answers.map { ["questionId": $0.questionID, "choiceIndex": $0.choiceIndex] },
        ] as [String: Any])

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
        case 404: throw PodcastQuizError.notFound
        case 400: throw PodcastQuizError.invalidAnswers
        case 401, 403: throw PodcastQuizError.unauthorized
        default: throw PodcastQuizError.server
        }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["status"] as? String == "applied",
              let correct = object["correct"] as? Int,
              let total = object["total"] as? Int,
              let bestCorrect = object["bestCorrect"] as? Int else { throw PodcastQuizError.server }
        // A story check pays no XP: the result has the quiz's shape so the shared run is reused.
        return PodcastQuizResult(
            correct: correct, total: total, xpGain: 0, streak: 0, bestCorrect: bestCorrect, bestXP: 0,
            missedQuestionIDs: object["missedQuestionIds"] as? [String] ?? []
        )
    }
}
