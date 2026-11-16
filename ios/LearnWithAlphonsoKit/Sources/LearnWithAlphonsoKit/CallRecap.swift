import Foundation

/// The after-call recap (POST /api/call-recap) and What Alphonso remembers (GET/DELETE /api/tutor-memory), as plain
/// values. The server decides everything that matters (who is Pro, whose call it is, what the model may add); this file
/// only reads its answers. A recap that is missing, empty or malformed parses to nil, and the result screen then shows
/// its slip exactly as before.
public struct CallRecap: Equatable, Sendable {
    public struct Correction: Equatable, Sendable, Identifiable {
        public let said: String
        public let fixed: String
        public let why: String
        public let topic: String
        public let label: String?
        public var id: String { topic }

        public init(said: String, fixed: String, why: String, topic: String, label: String?) {
            self.said = said
            self.fixed = fixed
            self.why = why
            self.topic = topic
            self.label = label
        }
    }

    public struct Phrase: Equatable, Sendable {
        public let text: String
        public let meaning: String

        public init(text: String, meaning: String) {
            self.text = text
            self.meaning = meaning
        }
    }

    public let corrections: [Correction]
    public let phrase: Phrase?
    /// Signed by the server; "Review these" sends it back. nil: the button is not shown.
    public let reviewToken: String?
    /// True when this recap was kept in What Alphonso remembers (a Pro learner).
    public let saved: Bool
    public let reviewCount: Int

    public init(corrections: [Correction], phrase: Phrase?, reviewToken: String?, saved: Bool, reviewCount: Int) {
        self.corrections = corrections
        self.phrase = phrase
        self.reviewToken = reviewToken
        self.saved = saved
        self.reviewCount = reviewCount
    }

    /// Calls shorter than this get no recap, and nothing is sent.
    public static let minLearnerTurns = 3

    public static func qualifies(_ transcript: [ChatMessage]) -> Bool {
        transcript.filter { $0.role == "user" }.count >= minLearnerTurns
    }

    /// The answer of /api/call-recap. nil for `{"recap": null}`, an empty recap or anything malformed.
    public static func parse(_ data: Data) -> CallRecap? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let recap = root["recap"] as? [String: Any] else { return nil }
        let rows = (recap["corrections"] as? [[String: Any]]) ?? []
        let corrections: [Correction] = rows.compactMap { row in
            guard let said = row["said"] as? String, let fixed = row["fixed"] as? String,
                  let why = row["why"] as? String, let topic = row["topic"] as? String,
                  !said.isEmpty, !fixed.isEmpty else { return nil }
            return Correction(said: said, fixed: fixed, why: why, topic: topic, label: row["label"] as? String)
        }
        var phrase: Phrase?
        if let p = recap["phrase"] as? [String: Any], let text = p["text"] as? String,
           let meaning = p["meaning"] as? String, !text.isEmpty {
            phrase = Phrase(text: text, meaning: meaning)
        }
        if corrections.isEmpty && phrase == nil { return nil }
        let token = recap["reviewToken"] as? String
        return CallRecap(
            corrections: corrections,
            phrase: phrase,
            reviewToken: (token?.isEmpty ?? true) ? nil : token,
            saved: (recap["saved"] as? Bool) ?? false,
            reviewCount: (recap["reviewCount"] as? Int) ?? (corrections.count + (phrase == nil ? 0 : 1))
        )
    }
}

/// What Alphonso remembers about a Pro learner, as the server listed it.
public struct TutorMemory: Equatable, Sendable {
    public struct Mistake: Equatable, Sendable, Identifiable {
        public let id: String
        public let topic: String
        public let label: String
        public let seenCount: Int
        public let lastSeenAt: Date

        public init(id: String, topic: String, label: String, seenCount: Int, lastSeenAt: Date) {
            self.id = id
            self.topic = topic
            self.label = label
            self.seenCount = seenCount
            self.lastSeenAt = lastSeenAt
        }

        /// "Seen in 4 calls, last 2 days ago".
        public func note(now: Date = Date()) -> String {
            let calls = seenCount == 1 ? "1 call" : "\(seenCount) calls"
            let ago = TutorMemory.agoLabel(lastSeenAt, now: now)
            let when = ago.hasPrefix("last") ? ago : "last \(ago)"
            return "Seen in \(calls), \(when)"
        }
    }

    public struct Phrase: Equatable, Sendable, Identifiable {
        public let id: String
        public let course: String
        public let text: String
        public let meaning: String

        public init(id: String, course: String, text: String, meaning: String) {
            self.id = id
            self.course = course
            self.text = text
            self.meaning = meaning
        }
    }

    public struct Goals: Equatable, Sendable {
        public let goal: String?
        public let dailyMinutes: Int?
        public let interests: [String]

        public init(goal: String?, dailyMinutes: Int?, interests: [String]) {
            self.goal = goal
            self.dailyMinutes = dailyMinutes
            self.interests = interests
        }
    }

    /// One goal line: which answer it clears when removed, its title and its note.
    public struct GoalLine: Equatable, Sendable, Identifiable {
        public enum Key: String, Sendable { case goal, dailyMinutes, interests }
        public let key: Key
        public let title: String
        public let note: String
        public var id: String { key.rawValue }
    }

    public let mistakes: [Mistake]
    public let phrases: [Phrase]
    public let goals: Goals

    public init(mistakes: [Mistake], phrases: [Phrase], goals: Goals) {
        self.mistakes = mistakes
        self.phrases = phrases
        self.goals = goals
    }

    public static let goalLabels: [String: String] = [
        "travel": "Travel", "work": "Work", "school": "School", "family": "Family", "exam": "An exam", "fun": "Just for fun",
    ]
    public static let interestLabels: [String: String] = [
        "food": "Food", "travel": "Travel", "sport": "Sport", "music": "Music", "movies": "Movies and TV",
        "business": "Business", "tech": "Tech", "nature": "Nature", "art": "Art", "family": "Family",
    ]
    public static let dailyMinuteChoices = [5, 10, 15, 20]
    public static let goalChoices = ["travel", "work", "school", "family", "exam", "fun"]
    public static let interestChoices = ["food", "travel", "sport", "music", "movies", "business", "tech", "nature", "art", "family"]

    /// The learner's own first-run answers as lines, in their words. Nothing is inferred.
    public var goalLines: [GoalLine] {
        var out: [GoalLine] = []
        if let g = goals.goal, let label = Self.goalLabels[g] {
            out.append(GoalLine(key: .goal, title: label, note: "You chose this when you started"))
        }
        if let m = goals.dailyMinutes, Self.dailyMinuteChoices.contains(m) {
            out.append(GoalLine(key: .dailyMinutes, title: "\(m) minutes a day", note: "You chose this when you started"))
        }
        let names = goals.interests.compactMap { Self.interestLabels[$0] }
        if !names.isEmpty {
            let words = names.enumerated().map { $0.offset == 0 ? $0.element : $0.element.lowercased() }
            let title = words.count <= 1 ? (words.first ?? "") : words.dropLast().joined(separator: ", ") + " and " + (words.last ?? "")
            out.append(GoalLine(key: .interests, title: title, note: "Topics you picked"))
        }
        return out
    }

    public var isEmpty: Bool { mistakes.isEmpty && phrases.isEmpty && goalLines.isEmpty }

    /// "3 mistakes, 4 phrases, 3 goals."
    public var summary: String {
        func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
        return "\(plural(mistakes.count, "mistake", "mistakes")), \(plural(phrases.count, "phrase", "phrases")), \(plural(goalLines.count, "goal", "goals"))."
    }

    /// "today", "yesterday", "2 days ago", "last week", "3 weeks ago", "2 months ago".
    public static func agoLabel(_ date: Date, now: Date = Date()) -> String {
        let days = Int(now.timeIntervalSince(date) / 86_400)
        if days <= 0 { return "today" }
        if days == 1 { return "yesterday" }
        if days < 7 { return "\(days) days ago" }
        if days < 14 { return "last week" }
        if days < 60 { return "\(days / 7) weeks ago" }
        return "\(days / 30) months ago"
    }

    /// GET /api/tutor-memory's body.
    public static func parse(_ data: Data) -> TutorMemory? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        func date(_ s: String?) -> Date? { s.flatMap { iso.date(from: $0) ?? plain.date(from: $0) } }
        let mistakes: [Mistake] = ((root["mistakes"] as? [[String: Any]]) ?? []).compactMap { r in
            guard let id = r["id"] as? String, let topic = r["topic"] as? String, let label = r["label"] as? String,
                  let seen = r["seenCount"] as? Int, let last = date(r["lastSeenAt"] as? String) else { return nil }
            return Mistake(id: id, topic: topic, label: label, seenCount: seen, lastSeenAt: last)
        }
        let phrases: [Phrase] = ((root["phrases"] as? [[String: Any]]) ?? []).compactMap { r in
            guard let id = r["id"] as? String, let text = r["text"] as? String else { return nil }
            return Phrase(id: id, course: (r["course"] as? String) ?? "en", text: text, meaning: (r["meaning"] as? String) ?? "")
        }
        let g = root["goals"] as? [String: Any]
        let goals = Goals(
            goal: g?["goal"] as? String,
            dailyMinutes: g?["dailyMinutes"] as? Int,
            interests: (g?["interests"] as? [String]) ?? []
        )
        return TutorMemory(mistakes: mistakes, phrases: phrases, goals: goals)
    }
}

/// What opening What Alphonso remembers found out.
public enum TutorMemoryLoad: Equatable, Sendable {
    case ready(TutorMemory)
    /// Not a Pro learner: the page is shown locked.
    case locked
    case failed
}
