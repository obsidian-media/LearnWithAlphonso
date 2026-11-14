import Foundation

/// The state mapping behind the weekly recap screen.
public enum RecapPresentation {
    /// Alphonso's pose over the recap: cheering for a week with XP in it, asleep for a quiet one (no XP, or the total
    /// could not be read). A quiet week is said calmly, never as a failure.
    public static func pose(lastWeekXP: Int?) -> String {
        (lastWeekXP ?? 0) > 0 ? "levelup-cheer" : "sleepy-night"
    }
}
