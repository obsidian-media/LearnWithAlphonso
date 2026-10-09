import Foundation

/// The headline on the lesson-complete screen, chosen by how the lesson went. "Nice work!" over a 0/8 result
/// read as a tone mismatch, so it is kept for good scores and the lower ones get an encouraging line instead.
public enum LessonFinishCopy {
    public static let good = "Nice work!"
    public static let fair = "Good progress!"
    public static let low = "Good try. Keep going!"

    public static func headline(correct: Int, total: Int) -> String {
        guard total > 0 else { return good }
        let share = Double(max(0, correct)) / Double(total)
        if share >= 0.8 { return good }
        if share >= 0.5 { return fair }
        return low
    }
}
