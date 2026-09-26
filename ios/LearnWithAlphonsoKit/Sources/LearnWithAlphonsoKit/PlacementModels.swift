import Foundation

/// The five CEFR bands a placement test walks through, easiest first --
/// mirrors src/data/placement.ts's `PLACEMENT_ORDER` exactly. `Level` on
/// the web side is just `"A1" | ... | "C1"`; iOS represents CEFR levels
/// as plain strings everywhere else too (`Unit.level`, `ReviewItem.level`),
/// so this stays a `[String]` rather than introducing a new enum only
/// placement would use.
public let placementOrder: [String] = ["A1", "A2", "B1", "B2", "C1"]

/// Mirrors the discriminated union in src/data/placement.ts's
/// `PlacementQuestion` type exactly -- the "type" field selects which
/// associated payload to decode, same pattern as `Question` in
/// CurriculumModels.swift. Keep this in sync with that file; a schema
/// change on the TypeScript side (see ios-content-export.ts in the main
/// repo) must be mirrored here.
///
/// `speak` is deliberately absent, same reasoning as the TS type's own
/// doc comment: an exam that can be made unanswerable by a denied
/// microphone permission is the wrong trade for a test that sets
/// someone's whole course.
public enum PlacementQuestion: Decodable, Sendable {
    case multipleChoice(MultipleChoice)
    case listening(Listening)
    case translate(Translate)

    public struct MultipleChoice: Decodable, Sendable {
        public let id: String
        public let level: String
        public let prompt: String
        public let choices: [String]
        public let answer: Int
    }

    /// `answer` is the correct choice's TEXT, not an index -- matches
    /// `Question.Listening`'s own shape and reasoning.
    public struct Listening: Decodable, Sendable {
        public let id: String
        public let level: String
        public let prompt: String
        /// Spoken via AVSpeechSynthesizer before the learner answers.
        public let audioText: String
        public let choices: [String]
        public let answer: String
    }

    public struct Translate: Decodable, Sendable {
        public let id: String
        public let level: String
        public let prompt: String
        public let acceptableAnswers: [String]
    }

    /// Common to every case -- see `groupByBand`/`pickPlacementSet` in
    /// PlacementLogic.swift, which only ever need `id`/`level`, not the
    /// type-specific payload.
    public var id: String {
        switch self {
        case .multipleChoice(let q): return q.id
        case .listening(let q): return q.id
        case .translate(let q): return q.id
        }
    }

    public var level: String {
        switch self {
        case .multipleChoice(let q): return q.level
        case .listening(let q): return q.level
        case .translate(let q): return q.level
        }
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
        case "listening":
            self = .listening(try Listening(from: decoder))
        case "translate":
            self = .translate(try Translate(from: decoder))
        default:
            // Deliberately fails loudly -- same reasoning as Question's own
            // decoder in CurriculumModels.swift: this content ships inside
            // the same binary (CI fails the build if the exported JSON
            // drifts from source), so an app older than its own bundle
            // cannot happen.
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown placement question type: \(type)"
            )
        }
    }
}
