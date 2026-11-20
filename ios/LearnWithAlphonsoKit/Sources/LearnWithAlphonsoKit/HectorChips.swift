import Foundation

/// Suggestion chips under Hector's greeting: generated from the same context the greeting uses (the open weak spot,
/// the streak), with a fixed set when there is none. Tapping one sends its `message` as the learner's turn.
///
/// Mirrors src/lib/hector-chips.ts and Android's core/logic/HectorChips.kt; shared/hector-chips.json holds the inputs
/// and expected outputs all three test suites replay. Chip text is English app copy; only the topic name inside a
/// message comes from the greeting's table, so it is in the course language.
public enum HectorChipIcon: String, Equatable, Sendable {
    case flame, coffee, book, chat
}

public struct HectorChip: Equatable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let message: String
    public let icon: HectorChipIcon

    public init(id: String, label: String, message: String, icon: HectorChipIcon) {
        self.id = id
        self.label = label
        self.message = message
        self.icon = icon
    }
}

public enum HectorChips {
    private static let coffee = HectorChip(
        id: "coffee", label: "Roleplay: ordering coffee", message: "Let's roleplay ordering coffee.", icon: .coffee)
    private static let explain = HectorChip(
        id: "explain", label: "Explain a rule", message: "Can you explain a grammar rule to me?", icon: .book)
    private static let chat = HectorChip(id: "chat", label: "Just chat", message: "Let's just chat.", icon: .chat)
    private static let weakPlain = HectorChip(
        id: "weakWords", label: "Practice my weak words", message: "Let's practice my weak words.", icon: .flame)

    /// The set shown when there is no context.
    public static let fallback: [HectorChip] = [weakPlain, coffee, explain, chat]

    /// A roleplay tied to the weak spot's topic; a topic with none gets the coffee one.
    private static let roleplays: [String: HectorChip] = [
        "past-tense": HectorChip(
            id: "roleplay-weekend", label: "Roleplay: my weekend",
            message: "Let's roleplay: I tell you about my weekend.", icon: .coffee),
        "prepositions": HectorChip(
            id: "roleplay-directions", label: "Roleplay: asking for directions",
            message: "Let's roleplay asking for directions.", icon: .coffee),
        "question-formation": HectorChip(
            id: "roleplay-interview", label: "Roleplay: a job interview",
            message: "Let's roleplay a job interview.", icon: .coffee),
        "modal-verbs": HectorChip(
            id: "roleplay-requests", label: "Roleplay: polite requests",
            message: "Let's roleplay making polite requests.", icon: .coffee),
        "conditionals": HectorChip(
            id: "roleplay-trip", label: "Roleplay: planning a trip",
            message: "Let's roleplay planning a trip.", icon: .coffee),
    ]

    private static let maxChips = 4

    public static func build(course: Course, weakSpot: String?, streakDays: Int) -> [HectorChip] {
        var out: [HectorChip] = []
        if let topic = HectorGreeting.topicLabel(course: course, category: weakSpot), let weakSpot {
            out.append(HectorChip(
                id: weakPlain.id, label: weakPlain.label, message: "Let's practice \(topic).", icon: .flame))
            let key = weakSpot.trimmingCharacters(in: .whitespaces).lowercased()
            out.append(roleplays[key] ?? coffee)
        }
        if streakDays >= 2 {
            out.append(HectorChip(
                id: "streak", label: "Keep my \(streakDays)-day streak",
                message: "Let's do a quick practice to keep my \(streakDays)-day streak going.", icon: .flame))
        }
        if out.isEmpty { return fallback }
        for chip in [coffee, explain, chat] {
            if out.count >= maxChips { break }
            if !out.contains(where: { $0.id == chip.id }) { out.append(chip) }
        }
        return Array(out.prefix(maxChips))
    }
}
