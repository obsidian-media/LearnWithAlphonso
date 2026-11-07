import Foundation

/// Hector speaks first (BACKLOG 0.0-bp): the short greeting he says when a Hector call opens. Built here from fixed
/// templates, with no LLM call, so it costs only its speech (/api/tts, through OpenerSpeechCache like Alphonso's
/// openers).
///
/// Mirrors src/lib/hector-greeting.ts and Android's core/logic/HectorGreeting.kt; keep the three in step. Nothing the
/// learner typed is ever spoken: the name must look like a first name, and the weak spot is only ever one of our own
/// labels below, looked up by its taxonomy key (WEAKNESS_TAXONOMY in src/lib/weakness-detection.server.ts).
public enum HectorGreeting {
    /// French puts a no-break space before ! and ?.
    private static let nb = "\u{00A0}"

    public static func build(course: Course, cefrLevel: String?, name: String?, weakSpot: String?) -> String {
        let hi = greetingHead(course: course, name: safeLearnerName(name))
        let level = (cefrLevel ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        let simple = level.isEmpty || level == "A1" || level == "A2"
        if let topic = topicLabel(course: course, category: weakSpot) {
            switch (course, simple) {
            case (.english, true): return "\(hi) Last time you had trouble with \(topic). Let's practice together. Ready?"
            case (.english, false): return "\(hi) Last time \(topic) tripped you up. Want to practice that in conversation?"
            case (.french, true):
                return "\(hi) La dernière fois, tu as eu du mal avec \(topic). On s'entraîne ensemble\(nb)?"
            case (.french, false):
                return "\(hi) La dernière fois, tu as eu du mal avec \(topic). Tu veux t'entraîner en conversation\(nb)?"
            case (.spanish, true): return "\(hi) La última vez tuviste problemas con \(topic). ¿Practicamos juntos?"
            case (.spanish, false):
                return "\(hi) La última vez tuviste dificultades con \(topic). ¿Te animas a practicar conversando?"
            }
        }
        switch (course, simple) {
        case (.english, true): return "\(hi) I'm Hector. What do you want to talk about today?"
        case (.english, false): return "\(hi) Good to see you. What's been happening lately? Tell me about it."
        case (.french, true): return "\(hi) Moi, c'est Hector. De quoi tu veux parler aujourd'hui\(nb)?"
        case (.french, false): return "\(hi) Content de te voir. Raconte-moi, quoi de neuf\(nb)?"
        case (.spanish, true): return "\(hi) Soy Hector. ¿De qué quieres hablar hoy?"
        case (.spanish, false): return "\(hi) Qué gusto verte. Cuéntame, ¿qué hay de nuevo?"
        }
    }

    private static func greetingHead(course: Course, name: String?) -> String {
        switch course {
        case .english: return name.map { "Hi \($0)!" } ?? "Hi!"
        case .french: return name.map { "Salut \($0)\(nb)!" } ?? "Salut\(nb)!"
        case .spanish: return name.map { "¡Hola, \($0)!" } ?? "¡Hola!"
        }
    }

    /// Taxonomy keys are short; anything longer is not one of ours.
    private static let maxCategoryLength = 40

    /// Our own words for a weakness category in this course, or nil when it is not one of ours. English-only
    /// grammar (phrasal verbs) is not named in French or Spanish.
    public static func topicLabel(course: Course, category: String?) -> String? {
        guard let category, category.count <= maxCategoryLength else { return nil }
        let key = category.trimmingCharacters(in: .whitespaces).lowercased()
        return topics[course]?[key]
    }

    private static let topics: [Course: [String: String]] = [
        .english: [
            "past-tense": "the past tense", "articles": "articles", "prepositions": "prepositions",
            "subject-verb-agreement": "subject-verb agreement", "plurals": "plurals",
            "question-formation": "asking questions", "modal-verbs": "modal verbs", "word-order": "word order",
            "pronouns": "pronouns", "comparatives": "comparing things", "conditionals": "conditionals",
            "phrasal-verbs": "phrasal verbs", "negation": "negative sentences",
            "vocabulary-choice": "choosing the right word", "spelling": "spelling",
        ],
        .french: [
            "past-tense": "le passé", "articles": "les articles", "prepositions": "les prépositions",
            "subject-verb-agreement": "l'accord du verbe", "plurals": "le pluriel",
            "question-formation": "les questions", "modal-verbs": "les verbes comme pouvoir et devoir",
            "word-order": "l'ordre des mots", "pronouns": "les pronoms", "comparatives": "les comparaisons",
            "conditionals": "le conditionnel", "negation": "la négation",
            "vocabulary-choice": "le choix des mots", "spelling": "l'orthographe",
        ],
        .spanish: [
            "past-tense": "el pasado", "articles": "los artículos", "prepositions": "las preposiciones",
            "subject-verb-agreement": "la concordancia del verbo", "plurals": "el plural",
            "question-formation": "las preguntas", "modal-verbs": "verbos como poder y deber",
            "word-order": "el orden de las palabras", "pronouns": "los pronombres",
            "comparatives": "las comparaciones", "conditionals": "el condicional", "negation": "la negación",
            "vocabulary-choice": "la elección de palabras", "spelling": "la ortografía",
        ],
    ]

    private static let maxNameLength = 20

    /// The first word of a name, when it looks like a first name (letters, with an inner apostrophe or hyphen);
    /// otherwise nil and Hector greets without one. A generated public handle ("Learner-4F2A") is not a name.
    public static func safeLearnerName(_ raw: String?) -> String? {
        guard let raw else { return nil }
        guard let first = raw.split(whereSeparator: \.isWhitespace).first.map(String.init),
              first.count <= maxNameLength,
              !first.lowercased().hasPrefix("learner-") else { return nil }
        let separators: Set<Character> = ["'", "\u{2019}", "-"]
        var previousWasLetter = false
        for ch in first {
            if ch.isLetter {
                previousWasLetter = true
            } else if separators.contains(ch), previousWasLetter {
                previousWasLetter = false
            } else {
                return nil
            }
        }
        return previousWasLetter ? first : nil
    }

    private static let recentWindow: TimeInterval = 30 * 86_400

    /// The open weakness seen most recently, if that was in the last 30 days.
    public static func recentWeakSpot(_ entries: [WeaknessTrendEntry], now: Date = Date()) -> String? {
        var best: (category: String, at: Date)?
        for entry in entries where entry.openCount > 0 {
            guard let at = parseTimestamp(entry.lastEventAt), now.timeIntervalSince(at) <= recentWindow else { continue }
            if best == nil || at > best!.at { best = (entry.category, at) }
        }
        return best?.category
    }

    private static func parseTimestamp(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        return ISO8601DateFormatter().date(from: raw)
    }
}

extension ConversationStore {
    /// Hector speaks first: a conversation with no turns yet opens with his greeting, as one of our own openers (so
    /// it is spoken through OpenerPlayback, shown as his first turn, and sent to the model with the next turn). A
    /// conversation already underway is returned unchanged.
    @discardableResult
    public func openWithGreeting(_ key: ConversationKey, greeting: String) -> ConversationSnapshot {
        update(key) { snapshot in
            if snapshot.turns.isEmpty { snapshot.appendOpener(greeting) }
        }
    }
}
