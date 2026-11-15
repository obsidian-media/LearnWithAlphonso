/// The widget's words. One caption on both platforms: "day in a row" / "days in a row".
public enum StreakWidgetCopy {
    public static func caption(streak: Int) -> String {
        streak == 1 ? "day in a row" : "days in a row"
    }

    /// The wide widget's one extra line. The best streak is never below the current one, so a snapshot whose
    /// longest lags the current streak still reads sensibly.
    public static func best(streak: Int, longestStreak: Int) -> String {
        "Best: \(max(streak, longestStreak))"
    }

    public static let studiedToday = "Studied today"
    public static let notStudiedYet = "Not studied yet"
    public static let empty = "Open Alphonso to start your streak"
}
