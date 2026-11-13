import Foundation

/// "Explain in my language" (BACKLOG 0.0-bc), the pure rules. The lesson stays wholly in the course language; only the
/// WHY is offered in the learner's own language, and only when asked. These are the same rules as the web's
/// src/lib/explain.ts and the Android twin (ExplainRules.kt); the three are kept in step by hand.
public enum ExplainRules {
    /// Its own daily budget, like `define`. Must agree with consume_ai_quota on the server and EXPLAIN_DAILY_LIMIT on web.
    public static let dailyLimit = 40

    /// A generous bound for a 3-sentence explanation in any script; also the length the server's cache accepts.
    public static let maxExplanationChars = 700

    public static let wrongAnswerFieldMax = 400
    public static let wordMax = 80
    public static let sentenceMax = 400
    public static let messageMax = 1000

    /// Scripts written right to left among the languages a learner can choose. Kurdish "ku" stays left to right:
    /// the Latin-script Kurmanji form is the common one.
    static let rtlLanguages: Set<String> = ["ar", "fa", "he", "ur", "ps"]

    public static func languageDirection(_ code: String) -> ExplainDirection {
        rtlLanguages.contains(code) ? .rtl : .ltr
    }

    /// The language's name in English ("Persian"): the chip says "Explain in Persian", the prompt names it.
    public static func languageName(_ code: String) -> String {
        Locale(identifier: "en").localizedString(forLanguageCode: code) ?? code
    }

    /// What a screen shows: a chip to tap, the explanation straight away, or nothing. Nothing when the learner chose
    /// "Target language only", has no native language on file, or their native language IS the course's.
    public static func offer(mode: ExplainMode, nativeLanguage: String?, course: String) -> ExplainOffer {
        if mode == .off { return .hidden }
        guard let nativeLanguage, !nativeLanguage.isEmpty, nativeLanguage != course else { return .hidden }
        return mode == .always ? .auto : .chip
    }

    /// Trimmed, then cut to `max` Characters (never in the middle of an emoji), then trimmed again.
    static func cut(_ text: String, _ max: Int) -> String {
        String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Model output to what is shown: plain text, trimmed, never longer than the cache accepts; empty is a failure.
    public static func parseExplanation(_ raw: Any?) -> String? {
        guard let text = raw as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(maxExplanationChars))
    }

    /// One piece of an explanation: `ltr` runs are quoted course-language text, the rest is the learner's language.
    public struct DirectionRun: Equatable, Sendable {
        public let text: String
        public let ltr: Bool

        public init(text: String, ltr: Bool) {
            self.text = text
            self.ltr = ltr
        }
    }

    private static let latinRunPattern =
        #"\p{Script=Latin}[\p{Script=Latin}\p{N}'’]*(?:[ ,.!?'’-]+\p{Script=Latin}[\p{Script=Latin}\p{N}'’]*)*[.!?]?"#

    /// A right-to-left explanation quotes the course language ("I live here."). Those quotes must stay left to right
    /// and isolated from the surrounding sentence, so the learner sees the pattern whole: the view draws each `ltr`
    /// run on its own. The pieces always join back to exactly the input.
    public static func splitDirectionRuns(_ text: String) -> [DirectionRun] {
        guard let regex = try? NSRegularExpression(pattern: latinRunPattern) else {
            return text.isEmpty ? [] : [DirectionRun(text: text, ltr: false)]
        }
        let whole = text as NSString
        var runs: [DirectionRun] = []
        var last = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: whole.length)) {
            let range = match.range
            if range.length == 0 { continue }
            if range.location > last {
                runs.append(DirectionRun(text: whole.substring(with: NSRange(location: last, length: range.location - last)), ltr: false))
            }
            runs.append(DirectionRun(text: whole.substring(with: range), ltr: true))
            last = range.location + range.length
        }
        if last < whole.length {
            runs.append(DirectionRun(text: whole.substring(from: last), ltr: false))
        }
        return runs
    }
}

public enum ExplainDirection: String, Sendable, Equatable {
    case rtl, ltr
}

public enum ExplainOffer: Sendable, Equatable {
    case chip, auto, hidden
}

/// The Settings choice, kept on the learner profile as `explainMode`. Absent or unknown means `tap`.
public enum ExplainMode: String, CaseIterable, Codable, Sendable, Equatable {
    case tap, always, off

    public static let `default`: ExplainMode = .tap

    /// Anything but one of the three known strings, including nothing, is the default: tap to explain.
    public static func parse(_ raw: Any?) -> ExplainMode {
        guard let text = raw as? String, let mode = ExplainMode(rawValue: text) else { return .default }
        return mode
    }

    public var title: String {
        switch self {
        case .tap: return "Tap to explain"
        case .always: return "Always show"
        case .off: return "Target language only"
        }
    }

    public var detail: String {
        switch self {
        case .tap: return "A small button under a wrong answer, a word or a chat message. Nothing appears until you tap it."
        case .always: return "The explanation is fetched straight away, without a tap."
        case .off: return "Hidden everywhere. Every explanation stays in the language you are learning."
        }
    }
}

/// What the item sent to /api/explain is. The language is NOT part of it: the server reads it from the account, so a
/// client cannot ask for another language. Builders return nil when there is nothing to explain.
public enum ExplainRequest: Sendable, Equatable {
    case wrongAnswer(course: String, question: String, wrongAnswer: String, correctAnswer: String)
    case word(course: String, word: String, sentence: String?)
    case message(course: String, text: String)

    /// A missed question, or nil when no answer was given. Text is cut to the lengths the route accepts, so a long
    /// question never turns the tap into a 400.
    public static func makeWrongAnswer(
        question: String, wrongAnswer: String, correctAnswer: String, course: String
    ) -> ExplainRequest? {
        let q = ExplainRules.cut(question, ExplainRules.wrongAnswerFieldMax)
        let w = ExplainRules.cut(wrongAnswer, ExplainRules.wrongAnswerFieldMax)
        let c = ExplainRules.cut(correctAnswer, ExplainRules.wrongAnswerFieldMax)
        if q.isEmpty || w.isEmpty || c.isEmpty { return nil }
        return .wrongAnswer(course: course, question: q, wrongAnswer: w, correctAnswer: c)
    }

    /// One word, with the sentence it came from when there is one. The sentence is left out when empty.
    public static func makeWord(word: String, sentence: String?, course: String) -> ExplainRequest? {
        let w = ExplainRules.cut(word, ExplainRules.wordMax)
        if w.isEmpty { return nil }
        let s = sentence.map { ExplainRules.cut($0, ExplainRules.sentenceMax) }
        return .word(course: course, word: w, sentence: (s?.isEmpty ?? true) ? nil : s)
    }

    /// One chat message.
    public static func makeMessage(text: String, course: String) -> ExplainRequest? {
        let t = ExplainRules.cut(text, ExplainRules.messageMax)
        if t.isEmpty { return nil }
        return .message(course: course, text: t)
    }

    public var course: String {
        switch self {
        case .wrongAnswer(let course, _, _, _): return course
        case .word(let course, _, _): return course
        case .message(let course, _): return course
        }
    }

    /// The JSON body. `surface` is added only for Hector (his calls spend his own Pro allowance).
    public func jsonObject(surface: ExplainSurface = .app) -> [String: Any] {
        var out: [String: Any]
        switch self {
        case .wrongAnswer(let course, let question, let wrongAnswer, let correctAnswer):
            out = [
                "kind": "wrong-answer", "course": course, "question": question,
                "wrongAnswer": wrongAnswer, "correctAnswer": correctAnswer,
            ]
        case .word(let course, let word, let sentence):
            out = ["kind": "word", "course": course, "word": word]
            if let sentence { out["sentence"] = sentence }
        case .message(let course, let text):
            out = ["kind": "message", "course": course, "text": text]
        }
        if surface == .hector { out["surface"] = ExplainSurface.hector.rawValue }
        return out
    }
}

public enum ExplainSurface: String, Sendable, Equatable {
    case app, hector
}
