import Foundation

/// The learning-goal plan as `/api/learning-goal` returns it. The server computes it (planGoal in
/// src/lib/learning-goal.ts); the device only renders it and never recomputes it. The shared
/// contract is src/lib/learning-goal.fixtures.json, copied into this package's tests.

public enum GoalStatus: Equatable, Sendable {
    case done, expired, justStarted, ahead, onTrack, behind
    /// A status a newer server added. Rendered generically; never an error, so an old app
    /// keeps working after the server learns a new state.
    case unknown

    init(raw: String) {
        switch raw {
        case "done": self = .done
        case "expired": self = .expired
        case "just_started": self = .justStarted
        case "ahead": self = .ahead
        case "on_track": self = .onTrack
        case "behind": self = .behind
        default: self = .unknown
        }
    }
}

public enum GoalRealism: Equatable, Sendable {
    case ok, ambitious, unrealistic
    case unknown

    init(raw: String) {
        switch raw {
        case "ok": self = .ok
        case "ambitious": self = .ambitious
        case "unrealistic": self = .unrealistic
        default: self = .unknown
        }
    }
}

public struct GoalPlan: Equatable, Sendable {
    public let currentLevel: String
    public let targetLevel: String
    public let targetDate: String
    public let lessonsInScope: Int
    public let lessonsRemaining: Int
    public let lessonsDoneLast7Days: Int
    public let requiredPerWeek: Int
    public let status: GoalStatus
    public let realism: GoalRealism
    public let suggestedDate: String?
    public let asOf: String

    public init(
        currentLevel: String, targetLevel: String, targetDate: String, lessonsInScope: Int,
        lessonsRemaining: Int, lessonsDoneLast7Days: Int, requiredPerWeek: Int, status: GoalStatus,
        realism: GoalRealism, suggestedDate: String?, asOf: String
    ) {
        self.currentLevel = currentLevel
        self.targetLevel = targetLevel
        self.targetDate = targetDate
        self.lessonsInScope = lessonsInScope
        self.lessonsRemaining = lessonsRemaining
        self.lessonsDoneLast7Days = lessonsDoneLast7Days
        self.requiredPerWeek = requiredPerWeek
        self.status = status
        self.realism = realism
        self.suggestedDate = suggestedDate
        self.asOf = asOf
    }
}

public struct StoredGoal: Equatable, Sendable {
    public let course: String
    public let targetLevel: String
    public let targetDate: String
    /// A plain string on purpose: the server sends ISO-8601 with milliseconds and "Z", but a strict
    /// date decoder would turn any future format drift into a decode failure of the whole card.
    public let createdAt: String

    public init(course: String, targetLevel: String, targetDate: String, createdAt: String) {
        self.course = course
        self.targetLevel = targetLevel
        self.targetDate = targetDate
        self.createdAt = createdAt
    }
}

public struct LearningGoalState: Equatable, Sendable {
    public let goal: StoredGoal?
    /// Nil with a goal present means the learner's level has passed the target: pick a new one.
    public let plan: GoalPlan?

    public init(goal: StoredGoal?, plan: GoalPlan?) {
        self.goal = goal
        self.plan = plan
    }
}

public enum LearningGoalError: Error, Equatable {
    /// The server rejected the goal; `String?` is its own reason ("That level is below yours").
    case invalid(String?)
    case notSignedIn
    case unavailable
    case offline

    /// Same wording as the web card (src/lib/learning-goal-client.ts goalErrorMessage).
    public var userMessage: String {
        switch self {
        case .invalid(let detail): return detail ?? "That goal can't be saved. Check the level and date."
        case .notSignedIn: return "Sign in again to use goals."
        case .unavailable: return "Couldn't load your goal. Try again."
        case .offline: return "You're offline. Showing your last saved plan."
        }
    }
}

public enum LearningGoalDecoding {
    /// Decodes `{ goal, plan }` (stored goal, save, or "none"). A required field that is missing or
    /// mistyped is `.unavailable`: showing a half-read plan would be worse than an error.
    public static func state(from data: Data) throws -> LearningGoalState {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw LearningGoalError.unavailable
        }
        var goal: StoredGoal?
        if let raw = object["goal"], !(raw is NSNull) {
            guard let dict = raw as? [String: Any], let decoded = storedGoal(dict) else {
                throw LearningGoalError.unavailable
            }
            goal = decoded
        }
        return LearningGoalState(goal: goal, plan: try optionalPlan(object["plan"]))
    }

    /// Decodes the preview response `{ plan }`; a preview always has a plan.
    public static func plan(fromPreview data: Data) throws -> GoalPlan {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let plan = try optionalPlan(object["plan"])
        else { throw LearningGoalError.unavailable }
        return plan
    }

    private static func optionalPlan(_ raw: Any?) throws -> GoalPlan? {
        guard let raw, !(raw is NSNull) else { return nil }
        guard let dict = raw as? [String: Any], let plan = goalPlan(dict) else {
            throw LearningGoalError.unavailable
        }
        return plan
    }

    private static func storedGoal(_ dict: [String: Any]) -> StoredGoal? {
        guard let course = dict["course"] as? String,
              let level = dict["targetLevel"] as? String,
              let date = dict["targetDate"] as? String,
              let created = dict["createdAt"] as? String
        else { return nil }
        return StoredGoal(course: course, targetLevel: level, targetDate: date, createdAt: created)
    }

    private static func goalPlan(_ dict: [String: Any]) -> GoalPlan? {
        guard let currentLevel = dict["currentLevel"] as? String,
              let targetLevel = dict["targetLevel"] as? String,
              let targetDate = dict["targetDate"] as? String,
              let inScope = dict["lessonsInScope"] as? Int,
              let remaining = dict["lessonsRemaining"] as? Int,
              let recent = dict["lessonsDoneLast7Days"] as? Int,
              let perWeek = dict["requiredPerWeek"] as? Int,
              let status = dict["status"] as? String,
              let realism = dict["realism"] as? String,
              let asOf = dict["asOf"] as? String
        else { return nil }
        let suggested = dict["suggestedDate"] as? String
        return GoalPlan(
            currentLevel: currentLevel, targetLevel: targetLevel, targetDate: targetDate,
            lessonsInScope: inScope, lessonsRemaining: remaining, lessonsDoneLast7Days: recent,
            requiredPerWeek: perWeek, status: GoalStatus(raw: status), realism: GoalRealism(raw: realism),
            suggestedDate: suggested, asOf: asOf)
    }
}
