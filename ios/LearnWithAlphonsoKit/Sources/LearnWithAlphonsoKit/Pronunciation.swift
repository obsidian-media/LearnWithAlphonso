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
    /// Greats shown so far this session (first time or on the retry); it alternates the cheer and the impressed pose.
    public private(set) var greatShown = 0
    /// Alphonso's current line for the result of an attempt (a varied praise line, or the move-on line), nil while asking.
    public private(set) var line: String?
    private var lastLine: [Pronunciation.Verdict: Int] = [:]

    public init(words: [VocabItem]) {
        self.words = words
        if words.isEmpty { phase = .done }
    }

    public var current: VocabItem? { words.indices.contains(index) ? words[index] : nil }
    public var isLast: Bool { index + 1 >= words.count }
    public var stars: Int { Pronunciation.stars(great: greatFirst, total: words.count) }
    public var nextLabel: String { isLast ? "Finish" : "Next" }
    public var skipLabel: String { isLast ? "Finish" : "Skip this word" }
    /// The wrap line, "N of M clearly".
    public var clearlyLine: String { SayItRight.clearly(greatFirst, of: words.count) }

    /// Alphonso's pose for the current state; `listening` is true while the mic is recording or a clip is being checked.
    public func pose(listening: Bool) -> SayItRightPose {
        SayItRightPose.pose(phase: phase, listening: listening, verdict: verdict, greatCount: greatShown)
    }

    private mutating func say(_ verdict: Pronunciation.Verdict, roll: Double) {
        let bank = SayItRight.praise(verdict)
        let i = SayItRight.nextLineIndex(size: bank.count, last: lastLine[verdict], roll: roll)
        lastLine[verdict] = i
        line = bank[i]
    }

    @discardableResult
    public mutating func submit(
        transcript: String, confidence: Double?, course: Course, roll: Double = Double.random(in: 0..<1)
    ) -> Outcome {
        guard let word = current else { return .unheard }
        let spoken = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if spoken.isEmpty { return .unheard }
        switch phase {
        case .ask:
            let v = Pronunciation.judge(transcript: spoken, confidence: confidence, term: word.term, course: course)
            verdict = v
            say(v, roll: roll)
            if v == .great {
                greatFirst += 1
                greatShown += 1
                phase = .result
                return .great
            }
            phase = .retry
            return .retry(v)
        case .retry:
            let v = Pronunciation.judge(transcript: spoken, confidence: confidence, term: word.term, course: course)
            verdict = v
            if v == .great {
                greatShown += 1
                say(v, roll: roll)
            } else {
                line = SayItRight.moveOn
            }
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
        line = nil
        if isLast { phase = .done } else { index += 1; phase = .ask }
    }
}

/// Alphonso's in-pose reactions for Say it right ("Talk with Alphonso"). The raw value is the image asset's name in the
/// app's asset catalogue. Mirrors src/lib/say-it-right.ts and core/logic/Pronunciation.kt.
public enum SayItRightPose: String, Sendable, Equatable, CaseIterable {
    case explainingPointer = "Alphonso-explaining-pointer"
    case listeningHeadphones = "Alphonso-listening-headphones"
    case thinkingTemple = "Alphonso-thinking-temple"
    case levelupCheer = "Alphonso-levelup-cheer"
    case surprisedImpressed = "Alphonso-surprised-impressed"

    /// Asking he explains, while the learner talks (or the clip is checked) he listens, after a miss he thinks it through
    /// with them, and on a great he cheers or is impressed, alternating by how many greats there have been (counting
    /// this one) so a run of wins varies.
    public static func pose(phase: PronunciationSession.Phase, listening: Bool, verdict: Pronunciation.Verdict?, greatCount: Int) -> SayItRightPose {
        if listening { return .listeningHeadphones }
        switch phase {
        case .done: return .levelupCheer
        case .retry: return .thinkingTemple
        case .result:
            if verdict == .great { return greatCount % 2 == 1 ? .levelupCheer : .surprisedImpressed }
            return .thinkingTemple
        case .ask: return .explainingPointer
        }
    }
}

/// The warm words of Say it right: a bank of lines per band (never "wrong"), chosen without an immediate repeat. The
/// order of each bank is part of the contract: the web and Android twins carry the same lines.
public enum SayItRight {
    /// The mic ring and auto-stop length, matching Say the picture.
    public static let maxRecordSeconds = SayThePicture.maxRecordSeconds

    /// A press released sooner than this is a TAP: it latches the recording on and a second tap stops it. A longer
    /// hold is hold-to-talk and its release sends. Same on the web and Android.
    public static let latchSeconds = 0.3

    /// Whether releasing the mic stops (and sends) the recording: a second tap always does, a long hold does, a quick
    /// first tap does not.
    public static func releaseStops(heldSeconds: Double, wasRecording: Bool) -> Bool {
        wasRecording || heldSeconds >= latchSeconds
    }

    public static func praise(_ verdict: Pronunciation.Verdict) -> [String] {
        switch verdict {
        case .great: return ["Spot on!", "You've got it!", "Lovely!", "Beautifully said!", "That was clear!"]
        case .almost: return ["So close. A touch clearer.", "Nearly there. Once more, nice and clear.", "Almost! Listen, then try again."]
        case .again: return ["Let's try that one together.", "No rush. Listen, then say it with me.", "Let's hear it once more."]
        }
    }

    /// After the one retry still misses: a kind move-on line.
    public static let moveOn = "Good try. It gets easier each time."
    public static let askLine = "Say this one after me"
    public static let listeningLine = "I'm listening..."
    public static let checkingLine = "Let me hear how clear that was..."
    public static let retryHint = "Listen, then try once more."

    /// Index of the next line from a bank of `size`, never equal to `last`. `roll` is in [0, 1): inject it in tests.
    public static func nextLineIndex(size: Int, last: Int?, roll: Double) -> Int {
        if size <= 1 { return 0 }
        let clamped = min(max(roll, 0), 0.999999)
        guard let last, last >= 0, last < size else { return Int(clamped * Double(size)) }
        let i = Int(clamped * Double(size - 1))
        return i >= last ? i + 1 : i
    }

    public static func clearly(_ clear: Int, of total: Int) -> String { "\(clear) of \(total) clearly" }
}
