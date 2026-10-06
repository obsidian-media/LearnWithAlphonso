import Foundation

/// The last goal and plan this device saw, so the card can still show something when the network is
/// down. Keyed by user id AND course: a shared device must never show one account's goal to the next,
/// and a cached plan is only ever used for a network failure (never for a 401 or a server error).
public struct GoalCache {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public static func key(userID: String, course: String) -> String {
        "lwa.learning-goal.v1.\(userID).\(course)"
    }

    /// A state is only worth keeping with BOTH a goal and a plan; anything else clears the entry.
    public func write(_ state: LearningGoalState, userID: String, course: String) {
        let key = Self.key(userID: userID, course: course)
        guard let goal = state.goal, let plan = state.plan,
              let data = try? JSONSerialization.data(withJSONObject: [
                  "goal": Self.dictionary(goal), "plan": Self.dictionary(plan),
              ])
        else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }

    public func read(userID: String, course: String) -> LearningGoalState? {
        guard let data = defaults.data(forKey: Self.key(userID: userID, course: course)),
              let state = try? LearningGoalDecoding.state(from: data),
              state.goal != nil, state.plan != nil
        else { return nil }
        return state
    }

    public func clear(userID: String, course: String) {
        defaults.removeObject(forKey: Self.key(userID: userID, course: course))
    }

    private static func dictionary(_ goal: StoredGoal) -> [String: Any] {
        ["course": goal.course, "targetLevel": goal.targetLevel, "targetDate": goal.targetDate, "createdAt": goal.createdAt]
    }

    private static func dictionary(_ plan: GoalPlan) -> [String: Any] {
        [
            "currentLevel": plan.currentLevel, "targetLevel": plan.targetLevel, "targetDate": plan.targetDate,
            "lessonsInScope": plan.lessonsInScope, "lessonsRemaining": plan.lessonsRemaining,
            "lessonsDoneLast7Days": plan.lessonsDoneLast7Days, "requiredPerWeek": plan.requiredPerWeek,
            "status": wire(plan.status), "realism": wire(plan.realism),
            "suggestedDate": plan.suggestedDate.map { $0 as Any } ?? NSNull(), "asOf": plan.asOf,
        ]
    }

    private static func wire(_ status: GoalStatus) -> String {
        switch status {
        case .done: return "done"
        case .expired: return "expired"
        case .justStarted: return "just_started"
        case .ahead: return "ahead"
        case .onTrack: return "on_track"
        case .behind: return "behind"
        case .unknown: return "unknown"
        }
    }

    private static func wire(_ realism: GoalRealism) -> String {
        switch realism {
        case .ok: return "ok"
        case .ambitious: return "ambitious"
        case .unrealistic: return "unrealistic"
        case .unknown: return "unknown"
        }
    }
}
