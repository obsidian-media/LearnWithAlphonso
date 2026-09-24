import Foundation

/// Mirrors the discriminated union in src/data/curriculum.ts's `Question`
/// type exactly -- the "type" field selects which associated payload to
/// decode. Keep this in sync with that file; a schema change on the
/// TypeScript side (see ios-content-export.ts in the main repo) must be
/// mirrored here.
public enum Question: Decodable, Sendable {
    case multipleChoice(MultipleChoice)
    case fillInBlank(FillInBlank)
    case reorder(Reorder)
    case listening(Listening)
    case speak(Speak)
    case translate(Translate)

    public struct MultipleChoice: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let choices: [String]
        public let answer: Int
        public let explanation: String
        // V3 pkg 4a: optional formats layered onto ordinary mc questions --
        // see curriculum.ts's Question type doc comment for why these
        // aren't separate cases.
        /// Key into ContentStore.vocabImages: shows a stock photo above the
        /// prompt ("image matching" format).
        public let imageKey: String?
        /// Text spoken via on-device TTS before the prompt ("listening
        /// comprehension" format).
        public let audioText: String?

        public init(
            id: String, prompt: String, choices: [String], answer: Int, explanation: String,
            imageKey: String? = nil, audioText: String? = nil
        ) {
            self.id = id
            self.prompt = prompt
            self.choices = choices
            self.answer = answer
            self.explanation = explanation
            self.imageKey = imageKey
            self.audioText = audioText
        }
    }

    /// Mirrors curriculum.ts's "listening" variant. `answer` is the correct
    /// choice's TEXT rather than an index (deliberately unlike multipleChoice,
    /// and matching fillInBlank/reorder), which is what lets `isAnswerCorrect`
    /// grade it with the same comparison fill-in-blank uses.
    public struct Listening: Decodable, Sendable {
        public let id: String
        public let prompt: String
        /// Spoken via AVSpeechSynthesizer before the learner answers.
        public let audioText: String
        public let choices: [String]
        public let answer: String
        public let explanation: String
    }

    /// Mirrors curriculum.ts's "speak" variant: the learner says `answer`
    /// aloud and a speech-to-text transcript is graded against it. There are no
    /// choices -- `answer` is both what is shown to say and what is compared,
    /// which is why the row-shape check in the database has a fourth shape for
    /// it (answer text, no choices, no bank, no answer index).
    public struct Speak: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let answer: String
        public let explanation: String

        public init(id: String, prompt: String, answer: String, explanation: String) {
            self.id = id
            self.prompt = prompt
            self.answer = answer
            self.explanation = explanation
        }
    }

    /// Mirrors curriculum.ts's "translate" variant: the learner writes the
    /// phrase themselves and it is matched against `acceptableAnswers`, any of
    /// which counts. `[0]` is canonical and is what the player shows after a
    /// miss.
    ///
    /// The field is `acceptableAnswers` here because the bundled JSON is a
    /// pass-through of the TypeScript `Question` objects (see
    /// ios-content-export.ts) -- it is only the DATABASE seed that stores the
    /// same list in the `bank` column, and the two are not the same shape.
    public struct Translate: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let acceptableAnswers: [String]
        public let explanation: String

        public init(id: String, prompt: String, acceptableAnswers: [String], explanation: String) {
            self.id = id
            self.prompt = prompt
            self.acceptableAnswers = acceptableAnswers
            self.explanation = explanation
        }
    }

    public struct FillInBlank: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let bank: [String]
        public let answer: String
        public let explanation: String
    }

    /// Mirrors curriculum.ts's "reorder" variant: `tokens` is the shuffled
    /// word pool to tap, `answer` the correctly-ordered sentence (tokens
    /// joined by single spaces) -- grading compares the tapped sequence's
    /// joined string against `answer`, never `tokens`'s order.
    public struct Reorder: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let tokens: [String]
        public let answer: String
        public let explanation: String
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "mc":
            self = .multipleChoice(try MultipleChoice(from: decoder))
        case "fill":
            self = .fillInBlank(try FillInBlank(from: decoder))
        case "reorder":
            self = .reorder(try Reorder(from: decoder))
        case "listening":
            self = .listening(try Listening(from: decoder))
        case "speak":
            self = .speak(try Speak(from: decoder))
        case "translate":
            self = .translate(try Translate(from: decoder))
        default:
            // Deliberately fails loudly. A lenient version of this was tried
            // and reverted: content ships inside the same binary (CI fails the
            // build if the exported JSON drifts from source), so an app older
            // than its own bundle cannot happen, and there is no
            // over-the-air content. Meanwhile skipping an unknown question
            // silently would leave the lesson with fewer questions than the
            // server's copy, and `deriveLessonCompletion` throws on that
            // mismatch (progress-math.ts:89) -- so the learner would finish the
            // lesson and get no XP, no streak credit and no error. A hard
            // failure at decode time is the better trade until OTA content
            // exists, and then this needs a real migration story, not leniency.
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown question type: \(type)"
            )
        }
    }
}

public struct Lesson: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let questions: [Question]

    public init(id: String, title: String, subtitle: String, questions: [Question]) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.questions = questions
    }

}

public struct Unit: Decodable, Identifiable, Sendable {
    public let id: String
    public let level: String
    public let eyebrow: String
    public let title: String
    public let description: String
    public let lessons: [Lesson]
}

public struct ContentBundle: Decodable, Sendable {
    public let course: String
    public let units: [Unit]
}

/// Mirrors src/data/scenarios.ts's `Scenario` type exactly -- one of the 6
/// AI-conversation roleplay scenarios. `systemPrompt` is sent as-is to
/// /api/chat; `opener` is shown as the assistant's first message without a
/// round trip, matching the web app's converse.$scenarioId.tsx.
public struct Scenario: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let emoji: String
    public let blurb: String
    public let level: String
    public let systemPrompt: String
    public let opener: String
}

/// Mirrors src/data/campaigns.ts's `CampaignScene` type exactly (V4
/// candidate #4). One scene within a `Campaign` -- roughly a `Scenario` on
/// its own (own persona via `systemPrompt`, own `opener`), plus `minTurns`:
/// the minimum number of learner turns in this scene before the
/// "Continue" action unlocks (see the campaigns design doc for why this
/// -- not a fixed cutoff, not an AI self-reported "done" signal -- is the
/// scene-completion gate).
public struct CampaignScene: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let systemPrompt: String
    public let opener: String
    public let minTurns: Int
}

/// Mirrors src/data/campaigns.ts's `Campaign` type exactly -- an ordered,
/// connected sequence of scenes sharing one continuous chat transcript, as
/// opposed to `Scenario`'s one-shot, independent roleplays. `premise` is
/// framing shared by every scene; CampaignSessionView composes
/// `premise + scene.systemPrompt` per /api/chat call so a later scene's
/// model call still sees the full prior transcript and can reference it.
public struct Campaign: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let emoji: String
    public let blurb: String
    public let level: String
    public let premise: String
    public let scenes: [CampaignScene]
}

/// Mirrors src/data/achievements.ts's `Achievement` type exactly. `tier` is
/// "bronze" | "silver" | "gold" | "diamond"; `category` is "streak" | "xp" |
/// "perfect" | "lessons" | "league" | "freeze" -- kept as plain strings
/// rather than Swift enums so a new catalog value added web-side decodes
/// here without a matching Swift case having to land first.
public struct Achievement: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let description: String
    public let icon: String
    public let tier: String
    public let category: String
    public let threshold: Int
}
