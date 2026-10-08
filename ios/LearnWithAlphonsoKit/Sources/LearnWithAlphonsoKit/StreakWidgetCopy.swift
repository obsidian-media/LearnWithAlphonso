/// The widget's caption under the streak number. It was `streak == 1 ? "day streak" : "day streak"`.
public enum StreakWidgetCopy {
    public static func caption(streak: Int) -> String {
        streak == 1 ? "day in a row" : "days in a row"
    }
}
