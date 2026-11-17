import Foundation

/// "Say the picture", the Practice Hub activity: a vocabulary word's photo with no text, the learner says the word.
/// Mirrors src/lib/say-the-picture.ts (web, PR #609); the Kotlin twin is core/logic/SayThePicture.kt. Keep the three
/// in step.
///
/// Speech goes through the EXISTING /api/stt (`AIConversationClient.transcribe`, so it counts against the speaking
/// quota, no new kind) and the model through /api/tts (`synthesizeSpeech`). Nothing here is a new endpoint.
public enum SayThePicture {
    /// One session is this many pictures.
    public static let rounds = 8
    /// Fewer image words than this and the activity says "not enough words with pictures yet".
    public static let minPool = 4

    public struct PictureWord: Sendable, Equatable {
        public let term: String
        public let image: VocabImageRef
        public init(term: String, image: VocabImageRef) { self.term = term; self.image = image }
    }

    /// Every word of the course that has a renderable picture, learned or not.
    ///
    /// LIVE, not a list: derived on each call from the lessons' own vocabulary, with each word's image looked up in
    /// `images` at that moment. A word that gains a photo is in the pool the next time a session starts, with no
    /// curation step. Deliberately nothing is cached, so a snapshot cannot creep in. Words whose image the app would
    /// not draw (`VocabImagePolicy`) are left out, so a round is never an empty box.
    public static func pool(units: [Unit], images: [String: VocabImageRef]) -> [PictureWord] {
        var seen: Set<String> = []
        var pool: [PictureWord] = []
        for unit in units {
            for lesson in unit.lessons {
                for item in deriveVocab(lesson: lesson, images: images) {
                    let key = item.term.trimmingCharacters(in: .whitespaces).lowercased()
                    guard let image = item.image, VocabImagePolicy.isRenderable(image.url), !seen.contains(key) else { continue }
                    seen.insert(key)
                    pool.append(PictureWord(term: item.term, image: image))
                }
            }
        }
        return pool
    }

    /// `count` distinct words drawn from the pool (all of it when it is smaller).
    public static func draw<G: RandomNumberGenerator>(
        _ pool: [PictureWord], count: Int = SayThePicture.rounds, using generator: inout G
    ) -> [PictureWord] {
        Array(pool.shuffled(using: &generator).prefix(count))
    }

    public static func draw(_ pool: [PictureWord], count: Int = SayThePicture.rounds) -> [PictureWord] {
        var generator = SystemRandomNumberGenerator()
        return draw(pool, count: count, using: &generator)
    }

    /// Forgiving grade for one picture word. The same per-course normalisation as the speak exercise; the word counts
    /// when it is the whole utterance OR appears in it as whole words ("el abogado", "a dog"), because a learner
    /// naming a picture naturally adds an article. Empty speech is never a hit.
    public static func said(_ transcript: String, term: String, course: Course) -> Bool {
        let norm: (String) -> String
        switch course {
        case .english: norm = SpokenAnswer.normalise
        case .french: norm = SpokenAnswerFr.normalise
        case .spanish: norm = SpokenAnswerEs.normalise
        }
        let said = norm(transcript)
        let want = norm(term)
        if said.isEmpty || want.isEmpty { return false }
        return said == want || " \(said) ".contains(" \(want) ")
    }

    /// Stars for a finished session, by share said first time, never below one (finishing is the point).
    public static func stars(correct: Int, total: Int) -> Int {
        guard total > 0 else { return 1 }
        let share = Double(correct) / Double(total)
        return share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1
    }

    /// The learner speech, sent to the existing speaking route with the course code.
    public static func transcribe(
        _ client: AIConversationClient, audio: Data, mimeType: String = "audio/m4a", course: Course, debugTiming: String? = nil
    ) async throws -> String {
        try await client.transcribe(audio: audio, mimeType: mimeType, course: course.wireCode, debugTiming: debugTiming).text
    }

    /// The model pronunciation of a word from the existing speech route.
    public static func modelAudio(_ client: AIConversationClient, term: String, voice: String?, course: Course) async throws -> Data {
        try await client.synthesizeSpeech(text: term, voice: voice, course: course.wireCode)
    }
}

/// The state of one session: eight pictures, forgiving, a miss teaches the word and goes on. No hearts, no penalty.
public struct SayThePictureSession: Sendable, Equatable {
    public enum Phase: Sendable, Equatable { case ask, right, reveal, done }
    /// What a spoken transcript did, so the screen knows whether to play the model audio.
    public enum Outcome: Sendable, Equatable { case right, reveal, repeated, unheard }

    public let words: [SayThePicture.PictureWord]
    public private(set) var index = 0
    public private(set) var phase: Phase = .ask
    public private(set) var firstTry = 0
    /// What the learner said when repeating after a reveal (any speech ends the word).
    public private(set) var heard: String?

    public init(words: [SayThePicture.PictureWord]) {
        self.words = words
        if words.isEmpty { phase = .done }
    }

    public var current: SayThePicture.PictureWord? { words.indices.contains(index) ? words[index] : nil }
    public var isLast: Bool { index + 1 >= words.count }
    public var stars: Int { SayThePicture.stars(correct: firstTry, total: words.count) }
    public var nextLabel: String { isLast ? "Finish" : "Next" }
    public var nextWordLabel: String { isLast ? "Finish" : "Next word" }

    /// A transcript arrived. Asking: a hit is a star, a miss reveals the word. After a reveal the word was taught,
    /// so whatever was said, it is recorded and the learner may move on. Silence changes nothing (not a miss).
    @discardableResult
    public mutating func submit(transcript: String, course: Course) -> Outcome {
        guard let word = current else { return .unheard }
        switch phase {
        case .reveal:
            heard = transcript
            return .repeated
        case .ask:
            let spoken = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
            if SayThePicture.said(spoken, term: word.term, course: course) {
                firstTry += 1
                phase = .right
                return .right
            }
            if spoken.isEmpty { return .unheard }
            phase = .reveal
            return .reveal
        case .right, .done:
            return .unheard
        }
    }

    /// "Show me the word": always available, so a microphone or STT failure is never a dead end.
    /// Returns true when the word was revealed (the screen then plays the model audio).
    @discardableResult
    public mutating func showWord() -> Bool {
        guard phase == .ask, current != nil else { return false }
        phase = .reveal
        return true
    }

    public mutating func next() {
        guard phase == .right || phase == .reveal else { return }
        heard = nil
        if isLast { phase = .done } else { index += 1; phase = .ask }
    }
}
