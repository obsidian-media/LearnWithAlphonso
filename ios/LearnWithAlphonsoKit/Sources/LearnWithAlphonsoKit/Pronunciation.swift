import Foundation

/// "Say it right", the Practice Hub pronunciation drill: a word the learner has already learned, a model to hear, a
/// recording judged on how clearly it was understood. Mirrors src/lib/pronunciation.ts (web, PR #616); the Kotlin
/// twin is core/logic/Pronunciation.kt. Keep the three in step, including the two confidence thresholds.
///
/// Speech goes through the EXISTING /api/stt (`AIConversationClient.transcribe`, so it counts against the speaking
/// quota, no new kind) and the model through /api/tts (`synthesizeSpeech`). Nothing here is a new endpoint.
public enum Pronunciation {
    /// One session is this many words.
    public static let rounds = 8
    /// Fewer learned words than this and the drill says "learn a few words first".
    public static let minPool = 4
    /// At or above this utterance confidence (0-1), a matching transcript is "Great". Tunable: the one place it lives.
    public static let highConfidence = 0.85
    /// At or above this (and below `highConfidence`), a matching transcript is "Almost"; below it, "Try again".
    public static let lowConfidence = 0.6
    /// A longer phrase is not a word to drill.
    static let maxTargetWords = 4

    public enum Verdict: Sendable, Equatable { case great, almost, again }

    private static func normalise(_ text: String, course: Course) -> String {
        switch course {
        case .english: return SpokenAnswer.normalise(text)
        case .french: return SpokenAnswerFr.normalise(text)
        case .spanish: return SpokenAnswerEs.normalise(text)
        }
    }

    /// The same forgiving whole-word comparison as Say the picture, over the per-course speak normalisers.
    public static func matches(_ transcript: String, term: String, course: Course) -> Bool {
        let said = normalise(transcript, course: course)
        let want = normalise(term, course: course)
        if said.isEmpty || want.isEmpty { return false }
        return said == want || " \(said) ".contains(" \(want) ")
    }

    /// The verdict for one attempt from the speech route's `(text, confidence)`. A match with high confidence is great;
    /// a match with middling confidence is almost; no match, or a match the recogniser was unsure of, is try again. A
    /// match with no confidence value (nil) is great: nothing says it was unclear. It reflects being understood, not
    /// which sound was off.
    public static func judge(transcript: String, confidence: Double?, term: String, course: Course) -> Verdict {
        guard matches(transcript, term: term, course: course) else { return .again }
        guard let confidence else { return .great }
        if confidence >= highConfidence { return .great }
        if confidence >= lowConfidence { return .almost }
        return .again
    }

    /// A usable drill target: a real word or short phrase that normalises to something.
    public static func usableTarget(_ term: String, course: Course) -> Bool {
        let norm = normalise(term, course: course)
        if norm.isEmpty { return false }
        return norm.split(separator: " ").count <= maxTargetWords
    }

    /// The learner's LEARNED words: the vocabulary of every lesson they have completed.
    ///
    /// LIVE, not a list: derived on each call from the bundled curriculum and the completed-lesson ids, nothing cached
    /// across calls, so finishing another lesson grows the pool the next time a session starts. Words with no usable
    /// target are excluded and terms are de-duplicated.
    public static func learnedPool(units: [Unit], completedLessonIDs: Set<String>, course: Course) -> [VocabItem] {
        var seen: Set<String> = []
        var pool: [VocabItem] = []
        for unit in units {
            for lesson in unit.lessons where completedLessonIDs.contains(lesson.id) {
                for item in deriveVocab(lesson: lesson, images: [:]) {
                    let key = item.term.trimmingCharacters(in: .whitespaces).lowercased()
                    guard !seen.contains(key), usableTarget(item.term, course: course) else { continue }
                    seen.insert(key)
                    pool.append(item)
                }
            }
        }
        return pool
    }

    /// `count` distinct words drawn from the pool (all of it when it is smaller).
    public static func draw<G: RandomNumberGenerator>(_ pool: [VocabItem], count: Int = Pronunciation.rounds, using generator: inout G) -> [VocabItem] {
        Array(pool.shuffled(using: &generator).prefix(count))
    }

    public static func draw(_ pool: [VocabItem], count: Int = Pronunciation.rounds) -> [VocabItem] {
        var generator = SystemRandomNumberGenerator()
        return draw(pool, count: count, using: &generator)
    }

    /// Stars for a finished session, by share of first-attempt greats, never below one (finishing is the point).
    public static func stars(great: Int, total: Int) -> Int {
        guard total > 0 else { return 1 }
        let share = Double(great) / Double(total)
        return share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1
    }

    /// The learner speech, sent to the existing speaking route with the course code. Returns the confidence too.
    public static func transcribe(
        _ client: AIConversationClient, audio: Data, mimeType: String = "audio/m4a", course: Course, debugTiming: String? = nil
    ) async throws -> (text: String, confidence: Double?) {
        try await client.transcribe(audio: audio, mimeType: mimeType, course: course.wireCode, debugTiming: debugTiming)
    }

    /// The model pronunciation of a word from the existing speech route.
    public static func modelAudio(_ client: AIConversationClient, term: String, voice: String?, course: Course) async throws -> Data {
        try await client.synthesizeSpeech(text: term, voice: voice, course: course.wireCode)
    }
}

/// The state of one session: eight words, forgiving. A miss replays the model and allows ONE retry, then the session
/// goes on whatever the result. No hearts, no penalty.
public struct PronunciationSession: Sendable, Equatable {
    public enum Phase: Sendable, Equatable { case ask, retry, result, done }
    /// What a spoken transcript did, so the screen knows whether to replay the model audio.
    public enum Outcome: Sendable, Equatable {
        /// A first-attempt great: the star is earned.
        case great
        /// Not great the first time: the model replays and the learner may try once more.
        case retry(Pronunciation.Verdict)
        /// The one retry came back (any verdict): the word is done.
        case finished(Pronunciation.Verdict)
        /// Silence or an empty transcript: not a miss, nothing changes.
        case unheard
    }

    public let words: [VocabItem]
    public private(set) var index = 0
    public private(set) var phase: Phase = .ask
    public private(set) var verdict: Pronunciation.Verdict?
    public private(set) var greatFirst = 0

    public init(words: [VocabItem]) {
        self.words = words
        if words.isEmpty { phase = .done }
    }

    public var current: VocabItem? { words.indices.contains(index) ? words[index] : nil }
    public var isLast: Bool { index + 1 >= words.count }
    public var stars: Int { Pronunciation.stars(great: greatFirst, total: words.count) }
    public var nextLabel: String { isLast ? "Finish" : "Next" }
    public var skipLabel: String { isLast ? "Finish" : "Skip this word" }

    @discardableResult
    public mutating func submit(transcript: String, confidence: Double?, course: Course) -> Outcome {
        guard let word = current else { return .unheard }
        let spoken = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if spoken.isEmpty { return .unheard }
        switch phase {
        case .ask:
            let v = Pronunciation.judge(transcript: spoken, confidence: confidence, term: word.term, course: course)
            verdict = v
            if v == .great {
                greatFirst += 1
                phase = .result
                return .great
            }
            phase = .retry
            return .retry(v)
        case .retry:
            let v = Pronunciation.judge(transcript: spoken, confidence: confidence, term: word.term, course: course)
            verdict = v
            phase = .result
            return .finished(v)
        case .result, .done:
            return .unheard
        }
    }

    /// Next word, or done after the last. Allowed in every phase but done (skipping a word is never penalised).
    public mutating func next() {
        guard phase != .done else { return }
        verdict = nil
        if isLast { phase = .done } else { index += 1; phase = .ask }
    }
}
