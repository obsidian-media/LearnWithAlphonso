import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Interactive branching stories (docs/superpowers/specs/2026-11-18-interactive-branching-stories-design.md): a tree of
// read-along nodes joined by choice points that reaches one of several endings. Mirrors src/lib/branching.ts (the rules
// and the walk) and src/lib/stories.functions.ts (loading and finishing).
//
// The database decides the ending and the reading credit. The app sends only the option index chosen at each choice
// point to the finish-branching-story Edge Function, which calls the service-role-only public.finish_branching_story with
// the verified user id; that function re-walks the stored graph, so a claimed ending is never read. `Branching.walk` is
// the same algorithm run locally to drive the screen, so what the learner sees and what the server credits cannot differ.

public enum EndingQuality: String, Equatable, Sendable { case good, ok, lesser }

public struct StoryEnding: Equatable, Sendable {
    public let id: String
    public let title: String
    /// A short wrap shown on the ending screen.
    public let wrap: String
    public let quality: EndingQuality

    public init(id: String, title: String, wrap: String, quality: EndingQuality) {
        self.id = id
        self.title = title
        self.wrap = wrap
        self.quality = quality
    }
}

public struct StoryChoiceOption: Equatable, Sendable {
    public let label: String
    /// The node this option leads to.
    public let goto: String
    /// True when this option reflects having understood the passage. Drives nothing punitive.
    public let clue: Bool

    public init(label: String, goto: String, clue: Bool) {
        self.label = label
        self.goto = goto
        self.clue = clue
    }
}

public struct StoryChoice: Equatable, Sendable {
    public let prompt: String
    public let options: [StoryChoiceOption]

    public init(prompt: String, options: [StoryChoiceOption]) {
        self.prompt = prompt
        self.options = options
    }
}

public struct StoryNode: Equatable, Sendable {
    /// The read-along text, one sentence or short paragraph per element.
    public let segments: [String]
    /// The scene illustration's public URL, or nil when the node has no art (the reader draws a placeholder).
    public let artURL: URL?
    /// Exactly one of choice / next / ending is present on a valid node.
    public let choice: StoryChoice?
    public let next: String?
    public let ending: StoryEnding?

    public init(
        segments: [String], artURL: URL? = nil, choice: StoryChoice? = nil, next: String? = nil,
        ending: StoryEnding? = nil
    ) {
        self.segments = segments
        self.artURL = artURL
        self.choice = choice
        self.next = next
        self.ending = ending
    }
}

public struct StoryGraph: Equatable, Sendable {
    public let start: String
    public let map: [String: StoryNode]

    public init(start: String, map: [String: StoryNode]) {
        self.start = start
        self.map = map
    }
}

/// One branching story loaded for the reader.
public struct BranchingStory: Equatable, Identifiable, Sendable {
    public let id: String
    public let course: String
    public let level: String
    public let title: String
    public let graph: StoryGraph

    public init(id: String, course: String, level: String, title: String, graph: StoryGraph) {
        self.id = id
        self.course = course
        self.level = level
        self.title = title
        self.graph = graph
    }
}

/// What the server decided when a path was finished.
public struct BranchingFinish: Equatable, Sendable {
    public let endingID: String
    public let quality: EndingQuality
    public let endingsFound: [String]
    public let endingsTotal: Int
    /// True the one time this finish earned the reading credit.
    public let credited: Bool

    public init(endingID: String, quality: EndingQuality, endingsFound: [String], endingsTotal: Int, credited: Bool) {
        self.endingID = endingID
        self.quality = quality
        self.endingsFound = endingsFound
        self.endingsTotal = endingsTotal
        self.credited = credited
    }
}

public enum NodeKind: Equatable, Sendable { case choice, link, ending, invalid }

public enum BranchWalk: Equatable, Sendable {
    case awaiting(nodeID: String)
    case ended(nodeID: String, ending: StoryEnding)
    case invalid(reason: String)
}

public enum Branching {
    /// The bucket scene art lives in (public, like the web's `story-art`).
    public static let artBucket = "story-art"

    /// What a node does: branch, link on, end, or (a content error) nothing.
    public static func nodeKind(_ node: StoryNode?) -> NodeKind {
        guard let node else { return .invalid }
        if node.ending != nil { return .ending }
        if let choice = node.choice, !choice.options.isEmpty { return .choice }
        if node.next != nil { return .link }
        return .invalid
    }

    /// Re-walks `path` (the option index chosen at each choice node, in order) from the start, auto-following linear
    /// links. Stops at the choice that needs the next pick, at an ending, or reports why the path is invalid. The exact
    /// algorithm public.finish_branching_story runs on the server.
    public static func walk(_ graph: StoryGraph, path: [Int]) -> BranchWalk {
        var current = graph.start
        var step = 0
        for _ in 0..<100 {
            guard let node = graph.map[current] else { return .invalid(reason: "missing-node") }
            if let ending = node.ending {
                // Reaching an ending with choices still left in the path means the path was fabricated.
                if step != path.count { return .invalid(reason: "unconsumed-path") }
                return .ended(nodeID: current, ending: ending)
            }
            if let choice = node.choice {
                if step >= path.count { return .awaiting(nodeID: current) }
                let index = path[step]
                guard index >= 0, index < choice.options.count else { return .invalid(reason: "bad-option") }
                current = choice.options[index].goto
                step += 1
                continue
            }
            if let next = node.next {
                current = next
                continue
            }
            return .invalid(reason: "dead-node")
        }
        return .invalid(reason: "too-deep")
    }

    /// The node after picking option `index` at `nodeID`, or nil when that is not a valid choice.
    public static func chooseOption(_ graph: StoryGraph, nodeID: String, index: Int) -> String? {
        guard let options = graph.map[nodeID]?.choice?.options, index >= 0, index < options.count else { return nil }
        return options[index].goto
    }

    /// Every ending in the graph in a stable order, for the endings-found tracker and the stars total.
    public static func allEndings(_ graph: StoryGraph) -> [StoryEnding] {
        graph.map.keys.sorted().compactMap { graph.map[$0]?.ending }
    }

    /// The ending screen's stars: 1 for reaching any ending, +1 for having reached a good one, +1 for having found
    /// every ending. Capped at 3. Soft: a lesser ending still earns the first star.
    public static func stars(endingsFound: Int, endingsTotal: Int, reachedGood: Bool) -> Int {
        var stars = 0
        if endingsFound >= 1 { stars += 1 }
        if reachedGood { stars += 1 }
        if endingsTotal > 0, endingsFound >= endingsTotal { stars += 1 }
        return min(3, stars)
    }

    /// True when any ending the learner has found is a good one (from the stored graph, not a client claim).
    public static func reachedGood(_ graph: StoryGraph, found: [String]) -> Bool {
        allEndings(graph).contains { $0.quality == .good && found.contains($0.id) }
    }

    /// The public URL of a scene-art key (`<course>/<slug>/<nodeId>.jpg`), or nil for no key.
    public static func artURL(supabaseURL: URL, key: String?) -> URL? {
        guard let key, !key.isEmpty else { return nil }
        let parts = key.split(separator: "/").map(String.init)
        guard !parts.isEmpty, !parts.contains(".."), !parts.contains(".") else { return nil }
        var url = supabaseURL
        for part in ["storage", "v1", "object", "public", artBucket] + parts {
            url = url.appendingPathComponent(part)
        }
        return url
    }

    /// Reads the stored `nodes` object. A node the app cannot read keeps its place with no continuation, so the walk
    /// reports it as invalid and the reader shows "not ready" instead of crashing; a graph without a usable start is nil.
    public static func parseGraph(from value: Any?, supabaseURL: URL) -> StoryGraph? {
        guard let object = value as? [String: Any],
              let start = object["start"] as? String,
              let rawMap = object["map"] as? [String: Any] else { return nil }
        var map: [String: StoryNode] = [:]
        for (id, raw) in rawMap {
            guard let node = raw as? [String: Any] else { continue }
            var choice: StoryChoice?
            if let rawChoice = node["choice"] as? [String: Any], let prompt = rawChoice["prompt"] as? String {
                let options: [StoryChoiceOption] = (rawChoice["options"] as? [[String: Any]] ?? []).compactMap { option in
                    guard let label = option["label"] as? String, let goto = option["goto"] as? String else { return nil }
                    return StoryChoiceOption(label: label, goto: goto, clue: option["clue"] as? Bool ?? false)
                }
                choice = StoryChoice(prompt: prompt, options: options)
            }
            var ending: StoryEnding?
            if let raw = node["ending"] as? [String: Any],
               let endingID = raw["id"] as? String,
               let title = raw["title"] as? String,
               let wrap = raw["wrap"] as? String,
               let quality = EndingQuality(rawValue: raw["quality"] as? String ?? "") {
                ending = StoryEnding(id: endingID, title: title, wrap: wrap, quality: quality)
            }
            map[id] = StoryNode(
                segments: Stories.segments(from: node["segments"]),
                artURL: artURL(supabaseURL: supabaseURL, key: node["art"] as? String),
                choice: choice,
                next: node["next"] as? String,
                ending: ending)
        }
        guard map[start] != nil else { return nil }
        return StoryGraph(start: start, map: map)
    }

    public static func status(completed: Bool) -> String {
        completed ? BranchingCopy.finishedStatus : BranchingCopy.badge
    }
}

public enum BranchingCopy {
    /// The library badge on a story that has choices.
    public static let badge = "Choose your path"
    public static let finishedStatus = "Ending found, try another path"
    public static let yourEnding = "Your ending"
    public static let tryAnotherPath = "Try another path"
    public static let readItAgain = "Read it again"
    public static let continueLabel = "Continue"
    public static let countsLine = "This counts toward your reading practice."
    public static let notReady = "This part of the story isn't ready yet."
    public static let startOver = "Start over"
    public static let saveFailed =
        "We couldn't save your path. Check your connection, then try again. Your reading counts once it saves."
    public static let retrySave = "Save again"

    public static func endingsFound(_ found: Int, of total: Int) -> String { "Endings found: \(found) of \(total)" }
    public static func starsLabel(_ stars: Int) -> String { "\(stars) of 3 stars" }

    public static func message(for error: PodcastQuizError) -> String {
        switch error {
        case .notFound: return "This story isn't available right now."
        case .invalidAnswers: return "That path couldn't be saved. Try another path."
        case .rateLimited, .offline, .server, .unauthorized: return PodcastQuizCopy.message(for: error)
        }
    }
}

extension PodcastClient {
    static let branchingColumns = "id,course,level_id,title,nodes,branching,published"

    /// One published branching story with its node graph; nil when it does not exist, is not published, is not a
    /// branching story or has no usable graph. RLS limits the read to published stories.
    public func fetchBranchingStory(id: String) async throws -> BranchingStory? {
        let storyRequest = request(
            path: "rest/v1/stories",
            query: "select=\(Self.branchingColumns)&id=eq.\(id)&published=eq.true&branching=eq.true",
            method: "GET"
        )
        let (data, response) = try await requester(storyRequest)
        try Self.requireSuccess(response: response)
        guard let row = try Self.rows(from: data).first,
              let course = row["course"] as? String, Stories.courses.contains(course),
              let level = row["level_id"] as? String,
              let title = row["title"] as? String,
              let graph = Branching.parseGraph(from: row["nodes"], supabaseURL: supabaseURL) else { return nil }
        return BranchingStory(id: id, course: course, level: level, title: title, graph: graph)
    }

    /// Sends the option index chosen at each choice point (never an ending, a score or a user id) to the
    /// finish-branching-story Edge Function, which re-walks the stored graph through the service-role-only
    /// `finish_branching_story`. A 2xx that cannot be read is an error, never a result; a resend is harmless (the endings
    /// found are a set and the reading credit is given once).
    public func finishBranchingStory(storyID: String, path: [Int]) async throws -> BranchingFinish {
        var request = request(path: "functions/v1/finish-branching-story", method: "POST")
        request.timeoutInterval = 30
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "storyId": storyID,
            "path": path,
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
              let endingID = object["endingId"] as? String,
              let quality = EndingQuality(rawValue: object["quality"] as? String ?? ""),
              let found = object["endingsFound"] as? [String],
              let total = object["endingsTotal"] as? Int else { throw PodcastQuizError.server }
        return BranchingFinish(
            endingID: endingID, quality: quality, endingsFound: found, endingsTotal: total,
            credited: object["credited"] as? Bool ?? false)
    }
}
