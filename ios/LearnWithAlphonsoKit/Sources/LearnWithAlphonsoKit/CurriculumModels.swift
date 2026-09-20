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
        default:
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
