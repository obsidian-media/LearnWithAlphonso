import Foundation

/// The goal card at the top of MY PATH: the target level and date, the lessons a week it takes and whether the learner
/// is on track, or an invitation to set a goal. No plan maths: every number and the status words come from
/// /api/learning-path (the goal planner's own output). Word for word the same as the web card
/// (src/lib/path-goal-card.ts) and Android (PathGoalCard.kt): change all three together.
public struct PathGoalCardLines: Equatable, Sendable {
    /// True when a goal is set; the card then opens the planner to change it, otherwise to set one.
    public let hasGoal: Bool
    public let kicker: String
    public let headline: String
    public let detail: String
}

public enum PathGoalCard {
    public static let kicker = "My goal"
    public static let unsetHeadline = "Set a goal"
    public static let unsetDetail = "Pick a level and a date and we work out the lessons a week."

    /// The card for a path, or the invitation when there is none yet (no goal set).
    public static func lines(for path: LearningPath?) -> PathGoalCardLines {
        guard let path else {
            return PathGoalCardLines(hasGoal: false, kicker: kicker, headline: unsetHeadline, detail: unsetDetail)
        }
        let progress = path.progress
        // The server reports 0 a week once the goal is reached or its date has passed: a number would mean nothing.
        let perWeek = progress.requiredPerWeek > 0
            ? "\(progress.requiredPerWeek) \(progress.requiredPerWeek == 1 ? "lesson" : "lessons") a week"
            : nil
        return PathGoalCardLines(
            hasGoal: true,
            kicker: kicker,
            headline: "\(progress.targetLevel) by \(GoalCopy.formatDate(progress.targetDate))",
            detail: perWeek.map { "\($0) \u{00B7} \(path.statusLine)" } ?? path.statusLine
        )
    }
}
