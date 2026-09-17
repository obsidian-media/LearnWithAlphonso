import Foundation

/// Mirrors the discriminated union in src/data/curriculum.ts's `Question`
/// type exactly -- the "type" field selects which associated payload to
/// decode. Keep this in sync with that file; a schema change on the
/// TypeScript side (see ios-content-export.ts in the main repo) must be
/// mirrored here.
public enum Question: Decodable, Sendable {
    case multipleChoice(MultipleChoice)
    case fillInBlank(FillInBlank)

    public struct MultipleChoice: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let choices: [String]
        public let answer: Int
        public let explanation: String
    }

    public struct FillInBlank: Decodable, Sendable {
        public let id: String
        public let prompt: String
        public let bank: [String]
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
