import SwiftUI
import LearnWithAlphonsoKit

/// The small grey pill "For your <goal> goal" with the goal's icon (owner pick C1): on a lesson that has questions
/// written for the learner's goal, and above a question that is showing its goal version. Never a link: the goal is
/// changed in Profile or Build my path.
struct GoalTagView: View {
    let goal: String
    @Environment(\.alphonsoDS) private var ds

    private var symbol: String {
        switch goal {
        case "travel": return "airplane"
        case "work": return "briefcase"
        case "school": return "graduationcap"
        case "family": return "house"
        case "exam": return "checkmark.seal"
        default: return "star"
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).imageScale(.small).fontWeight(.bold).accessibilityHidden(true)
            Text("For your \(goal) goal").dsText(.caption).fontWeight(.bold)
        }
        .foregroundStyle(ds.inkSoft)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(ds.sunk))
        .accessibilityElement(children: .combine)
    }
}
