import Foundation

public struct LessonRewardChip: Equatable, Sendable {
    public enum Kind: String, Sendable { case xp, streak, accuracy }
    public let kind: Kind
    public let value: String
    public let emoji: String
}

/// The reward chips on the lesson-complete screen. Mirrors `lessonRewardChips` in src/lib/lesson-rewards.ts.
public enum LessonRewards {
    /// XP is always shown; the streak only when known and above zero (an offline finish has no server
    /// progress yet); accuracy only when the lesson had questions.
    public static func chips(xp: Int, streak: Int?, correct: Int, total: Int) -> [LessonRewardChip] {
        var chips = [LessonRewardChip(kind: .xp, value: "+\(xp)", emoji: "\u{2B50}")]
        if let streak, streak > 0 {
            chips.append(LessonRewardChip(kind: .streak, value: "\(streak)", emoji: "\u{1F525}"))
        }
        if total > 0 {
            let percent = Int((Double(correct) / Double(total) * 100).rounded())
            chips.append(LessonRewardChip(kind: .accuracy, value: "\(percent)%", emoji: "\u{1F3AF}"))
        }
        return chips
    }
}
