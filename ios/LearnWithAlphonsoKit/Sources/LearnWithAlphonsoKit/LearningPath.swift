import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The learning path as `/api/learning-path` returns it (docs/superpowers/specs/2026-11-12-learning-path-design.md).
/// The server computes it once (planPath in src/lib/path-plan.ts); the device only renders it and never recomputes it,
/// so web, iOS and Android always show the same plan. The shared contract is src/lib/learning-path.fixtures.json,
/// copied into this package's tests (guarded by src/lib/learning-path-native-fixtures.test.ts).
///
/// Types and states stay plain strings on the wire: a type a newer server adds (videos, later) decodes fine and is
/// drawn generically by `PathKind.unknown`, never an error.
public enum PathKind: Equatable, Sendable {
    case lesson, podcast, talk, campaign
    case unknown

    public init(raw: String) {
        switch raw {
        case "lesson": self = .lesson
        case "podcast": self = .podcast
        case "talk": self = .talk
        case "campaign": self = .campaign
        default: self = .unknown
        }
    }

    /// Plural label, as the web shows it ("Podcasts").
    public var label: String {
        switch self {
        case .lesson: return "Lessons"
        case .podcast: return "Podcasts"
        case .talk: return "Talk"
        case .campaign: return "Campaigns"
        case .unknown: return "Activity"
        }
    }

    /// Singular noun, as the web shows it ("Podcast").
    public var noun: String {
        switch self {
        case .lesson: return "Lesson"
        case .podcast: return "Podcast"
        case .talk: return "Talk to Alphonso"
        case .campaign: return "Story campaign"
        case .unknown: return "Activity"
        }
    }

    /// The types a learner may switch off (lessons are the backbone).
    public static let optional: [PathKind] = [.podcast, .talk, .campaign]

    /// The wire name used by the switches request.
    public var wire: String {
        switch self {
        case .lesson: return "lesson"
        case .podcast: return "podcast"
        case .talk: return "talk"
        case .campaign: return "campaign"
        case .unknown: return "unknown"
        }
    }
}

public struct PathItemRef: Decodable, Equatable, Sendable {
    public let kind: String
    public let id: String
    public let sceneIndex: Int?
}

public struct PathItem: Decodable, Equatable, Sendable {
    public let type: String
    public let id: String
    public let title: String
    public let subtitle: String
    public let minutes: Int
    /// "done", "next" or "todo".
    public let state: String
    public let ref: PathItemRef?
    public var kind: PathKind { PathKind(raw: type) }
}

public struct PathMixEntry: Decodable, Equatable, Sendable {
    public let type: String
    public let minutes: Int
    public let share: Int
    public let count: Int
    public var kind: PathKind { PathKind(raw: type) }
}

public struct PathDay: Decodable, Equatable, Sendable {
    public let day: String
    public let label: String
    /// "done", "missed", "today", "upcoming" or "rest".
    public let state: String
    public let minutes: Int
    public let items: [PathItem]
}

public struct PathWhy: Decodable, Equatable, Sendable {
    public let type: String
    public let headline: String
    public let detail: String
    public let source: String
    public var kind: PathKind { PathKind(raw: type) }
}

public struct PathRecovery: Decodable, Equatable, Sendable {
    /// "lessons_first", "move_date" or "add_minutes".
    public let id: String
    public let title: String
    public let detail: String
    public let suggested: Bool
    public let date: String?
    public let dailyMinutes: Int?
    public let lessonsPerWeek: Int?
    public let mix: [PathMixEntry]?
}

public struct PathStop: Decodable, Equatable, Sendable {
    /// "level", "item", "unit" or "goal".
    public let kind: String
    public let type: String?
    public let title: String
    public let subtitle: String
    public let note: String
    /// "done", "current" or "upcoming".
    public let state: String
    public let estDate: String?
    public let ref: PathItemRef?
    public var pathKind: PathKind? { type.map(PathKind.init(raw:)) }
}

public struct PathStreak: Decodable, Equatable, Sendable {
    public let type: String
    public let days: Int
    public let weekMinutes: Int
    public var kind: PathKind { PathKind(raw: type) }
}

public struct PathProgress: Decodable, Equatable, Sendable {
    public let lessonsDone: Int
    public let lessonsInScope: Int
    public let requiredPerWeek: Int
    public let doneLast7Days: Int
    public let targetLevel: String
    public let targetDate: String
    public let suggestedDate: String?
}

public struct PathToday: Decodable, Equatable, Sendable {
    public let day: String
    public let targetMinutes: Int
    public let minutesLeft: Int
    public let items: [PathItem]
}

public struct LearningPath: Decodable, Equatable, Sendable {
    public let asOf: String
    public let course: String
    public let goalLabel: String
    /// The goal planner's status ("on_track", "behind", ...). Words are in `statusLine`.
    public let status: String
    public let statusLine: String
    public let statusDetail: String
    public let progress: PathProgress
    public let dailyMinutes: Int
    /// The rest day as planned: 0 (Sunday) to 6, or `PathRestDay.none` (-1) for seven study days. Missing from an
    /// older server, where it is the default Sunday.
    public let restDay: Int?
    public let weekMinutes: Int
    public let weekDoneMinutes: Int
    public let trimmed: Bool
    public let trimUntil: String?
    public let off: [String]
    public let mix: [PathMixEntry]
    public let today: PathToday
    public let week: [PathDay]
    public let road: [PathStop]
    public let recovery: [PathRecovery]
    public let why: [PathWhy]
    public let streaks: [PathStreak]

    /// The rest day to show as selected: the server's, or Sunday for an older server that does not say.
    public var restDayValue: Int { restDay ?? PathRestDay.sunday }

    /// Share of the lessons in scope that are done, 0...1, for the progress bar.
    public var lessonFraction: Double {
        Double(progress.lessonsDone) / Double(max(progress.lessonsInScope, 1))
    }

    /// Share of this week's minutes that are done, 0...1.
    public var weekFraction: Double {
        min(1, Double(weekDoneMinutes) / Double(max(weekMinutes, 1)))
    }
}

/// The rest-day choices in "Build my path", shared by the three platforms (weekday 0 = Sunday, -1 = none).
public enum PathRestDay {
    public static let sunday = 0
    public static let none = -1
    public static let weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    /// Every choice in the order they are shown: the seven weekdays, then "No rest day".
    public static let choices: [(value: Int, label: String)] =
        weekdayLabels.enumerated().map { (value: $0.offset, label: $0.element) } + [(value: none, label: "No rest day")]

    /// Study days a week with this rest day: six, or seven with none.
    public static func studyDays(_ restDay: Int) -> Int { restDay == none ? 7 : 6 }
}

public enum LearningPathError: Error, Equatable {
    case notSignedIn
    case unavailable
    case offline

    public var userMessage: String {
        switch self {
        case .notSignedIn: return "Sign in again to see your path."
        case .unavailable: return "Couldn't load your path."
        case .offline: return "You are offline. Connect to load your path."
        }
    }
}

public enum LearningPathDecoding {
    /// Decodes `{ path }`; nil is "no goal yet". A path missing a required part is `.unavailable`: a half-read plan
    /// would be worse than an error.
    public static func path(from data: Data) throws -> LearningPath? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object.keys.contains("path")
        else { throw LearningPathError.unavailable }
        if object["path"] is NSNull { return nil }
        guard let inner = object["path"], let bytes = try? JSONSerialization.data(withJSONObject: inner),
              let decoded = try? JSONDecoder().decode(LearningPath.self, from: bytes)
        else { throw LearningPathError.unavailable }
        return decoded
    }
}

/// One change the learner can make, sent as `PUT /api/learning-path`.
public enum LearningPathChange: Equatable, Sendable {
    case setOff([PathKind])
    case lessonsFirst
    case resume
    case setDailyMinutes(Int)
    /// 0 (Sunday) to 6, or `PathRestDay.none` for no rest day.
    case setRestDay(Int)

    var body: [String: Any] {
        switch self {
        case .setOff(let kinds): return ["action": "set_off", "off": kinds.map(\.wire)]
        case .lessonsFirst: return ["action": "lessons_first"]
        case .resume: return ["action": "resume"]
        case .setDailyMinutes(let minutes): return ["action": "set_daily_minutes", "dailyMinutes": minutes]
        case .setRestDay(let day):
            return ["action": "set_rest_day", "restDay": day == PathRestDay.none ? "none" : day]
        }
    }
}

/// Calls this repo's own `/api/learning-path`, the same route the web screens use. Same auth as LearningGoalClient
/// (the user's access token as a Bearer header, one refresh-and-retry on a 401).
public final class LearningPathClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
    private let refreshAccessToken: (@Sendable () async -> String?)?
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.refreshAccessToken = refreshAccessToken
        self.requester = requester
    }

    /// The path for `course` ("en", "fr", "es"), or nil when there is no goal yet.
    public func fetch(course: String) async throws -> LearningPath? {
        let data = try await send(request(method: "GET", query: [URLQueryItem(name: "course", value: course)]))
        return try LearningPathDecoding.path(from: data)
    }

    /// Applies a change and returns the path as it is afterwards.
    public func change(course: String, _ change: LearningPathChange) async throws -> LearningPath? {
        var body = change.body
        body["course"] = course
        let bytes = try JSONSerialization.data(withJSONObject: body)
        let data = try await send(request(method: "PUT", query: [], body: bytes))
        return try LearningPathDecoding.path(from: data)
    }

    private func request(method: String, query: [URLQueryItem], body: Data? = nil) -> URLRequest {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/learning-path"), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        return request
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await perform(request)
        } catch is URLError {
            throw LearningPathError.offline
        } catch {
            throw LearningPathError.unavailable
        }
        guard let http = response as? HTTPURLResponse else { throw LearningPathError.unavailable }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 401, 403: throw LearningPathError.notSignedIn
            default: throw LearningPathError.unavailable
            }
        }
        return data
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await requester(request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 401, let refreshAccessToken else {
            return (data, response)
        }
        guard let token = await refreshAccessToken() else { return (data, response) }
        var retry = request
        retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await requester(retry)
    }
}
