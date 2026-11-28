import Foundation

/// "How you spoke": the counts the server wrote about a rehearsal call, read from the top level of the
/// POST /api/call-recap body (`rehearsalSpeaking`, next to `recap`, and present even when `recap` is null). Absent for
/// every other call. The server orders the notes and caps them at three; this file keeps that order and never turns the
/// counts into one score, a percentage or a grade. Contract: tests/fixtures/rehearsal-api.json, key "speaking".
public struct RehearsalSpeaking: Equatable, Sendable {
    public struct Note: Equatable, Sendable, Identifiable {
        public enum Kind: String, Sendable {
            case fullReplies = "full_replies"
            case englishFallback = "english_fallback"
            case keyPhrases = "key_phrases"
            /// Slow starts to answers. Never given an arrow: a pause is not a mistake.
            case pauses
        }

        /// Which way the number moved against last time, judged by whether that is better. Never a colour: the screen
        /// draws every case in the same quiet ink.
        public enum Trend: Equatable, Sendable { case better, worse, same, none }

        public let kind: Kind
        public let count: Int
        public let total: Int
        public let previous: Int?
        public var id: String { kind.rawValue }

        public init(kind: Kind, count: Int, total: Int, previous: Int?) {
            self.kind = kind
            self.count = count
            self.total = total
            self.previous = previous
        }

        /// ", up from 4 last time" / ", down from 5 last time" / ", the same as last time"; empty with no earlier run.
        public var previousSuffix: String {
            guard let previous else { return "" }
            if count > previous { return ", up from \(previous) last time" }
            if count < previous { return ", down from \(previous) last time" }
            return ", the same as last time"
        }

        /// A short thing to say while thinking, in the course's own language. An unknown course gets the English one.
        public static func filler(courseCode: String) -> String {
            switch courseCode {
            case "fr": return "Laissez-moi r\u{00E9}fl\u{00E9}chir\u{2026}"
            case "es": return "D\u{00E9}jeme pensar\u{2026}"
            default: return "Let me think\u{2026}"
            }
        }

        /// The sentence the card shows and VoiceOver reads, word for word as the web card writes it
        /// (`speakingSentence` in src/lib/rehearsal-speaking.ts). `language` is the course's language ("French");
        /// `courseCode` picks the pause note's filler.
        public func sentence(language: String, courseCode: String = "en") -> String {
            switch kind {
            case .fullReplies:
                return "You answered in full sentences \(count) of \(total) times" + previousSuffix + "."
            case .englishFallback:
                if count == 0 { return "You stayed in \(language) the whole time" + previousSuffix + "." }
                let times = count == 1 ? "once" : count == 2 ? "twice" : "\(count) times"
                return "You switched to English \(times)" + previousSuffix + "."
            case .keyPhrases:
                return "You used \(count) of your \(total) key \(total == 1 ? "phrase" : "phrases")" + previousSuffix + "."
            case .pauses:
                return "You took a moment before \(count) of \(total) answers. That's fine; next time try starting with \u{201C}\(Self.filler(courseCode: courseCode))\u{201D}."
            }
        }

        /// For English fallback a lower number is the better one. A pause never has a trend.
        public var trend: Trend {
            if kind == .pauses { return .none }
            guard let previous else { return .none }
            if count == previous { return .same }
            let up = count > previous
            return (kind == .englishFallback ? !up : up) ? .better : .worse
        }

        /// SF Symbol of the small decorative arrow; nil with no earlier run. Hidden from VoiceOver.
        public var arrowSymbol: String? {
            switch trend {
            case .better: return "arrow.up.right"
            case .worse: return "arrow.down.right"
            case .same: return "arrow.right"
            case .none: return nil
            }
        }
    }

    /// In the server's order.
    public let notes: [Note]

    public init(notes: [Note]) { self.notes = notes }

    /// "French" for a course's wire code; English for anything unknown.
    public static func languageName(courseCode: String) -> String {
        switch courseCode {
        case "fr": return "French"
        case "es": return "Spanish"
        default: return "English"
        }
    }

    /// The `rehearsalSpeaking` of a call-recap body. nil when it is absent, malformed or has no readable note. Unknown
    /// kinds and unreadable rows are dropped; the rest keep the server's order.
    public static func parse(_ data: Data) -> RehearsalSpeaking? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return parse(root: root)
    }

    public static func parse(root: [String: Any]) -> RehearsalSpeaking? {
        guard let block = root["rehearsalSpeaking"] as? [String: Any],
              let rows = block["notes"] as? [[String: Any]] else { return nil }
        let notes: [Note] = rows.compactMap { row in
            guard let raw = row["kind"] as? String, let kind = Note.Kind(rawValue: raw),
                  let count = row["count"] as? Int, let total = row["total"] as? Int,
                  count >= 0, total >= 0 else { return nil }
            return Note(kind: kind, count: count, total: total, previous: row["previous"] as? Int)
        }
        return notes.isEmpty ? nil : RehearsalSpeaking(notes: notes)
    }
}
