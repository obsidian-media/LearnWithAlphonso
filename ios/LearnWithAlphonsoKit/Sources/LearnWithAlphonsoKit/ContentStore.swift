import Foundation

public enum Course: Sendable {
    case english
    case french
    case spanish

    fileprivate var resourceName: String {
        switch self {
        case .english: return "curriculum-en"
        case .french: return "curriculum-fr"
        case .spanish: return "curriculum-es"
        }
    }
}

public enum ContentStoreError: Error {
    case resourceNotFound(String)
}

/// Loads the bundled curriculum JSON (see scripts/export-ios-content.ts in
/// the main repo for how these files are generated) once at launch. No
/// network calls, no async -- this is app-bundle content, not
/// server-fetched, per the native app design doc's V1 scope.
///
/// Uses `Bundle.module`, which SwiftPM generates per-target -- this only
/// resolves correctly from inside THIS target (LearnWithAlphonsoKit),
/// which is why loading happens here rather than in the app or test target
/// reaching into this target's resources directly.
public final class ContentStore {
    public let english: ContentBundle
    public let french: ContentBundle
    public let spanish: ContentBundle
    public let scenarios: [Scenario]
    public let achievements: [Achievement]
    /// Vocab-term (lowercased) -> stock-photo lookup, same keying
    /// deriveVocab(lesson:images:) expects. Empty entries just mean no
    /// image exists for that term -- not an error.
    public let vocabImages: [String: VocabImageRef]

    public init() throws {
        english = try Self.loadBundle(for: .english)
        french = try Self.loadBundle(for: .french)
        spanish = try Self.loadBundle(for: .spanish)
        scenarios = try Self.loadScenarios()
        achievements = try Self.loadJSON([Achievement].self, resource: "achievements")
        vocabImages = try Self.loadJSON([String: VocabImageRef].self, resource: "vocab-images")
    }

    public func bundle(for course: Course) -> ContentBundle {
        switch course {
        case .english: return english
        case .french: return french
        case .spanish: return spanish
        }
    }

    public func findLesson(id: String, course: Course) -> (unit: Unit, lesson: Lesson)? {
        for unit in bundle(for: course).units {
            if let lesson = unit.lessons.first(where: { $0.id == id }) {
                return (unit, lesson)
            }
        }
        return nil
    }

    private static func loadBundle(for course: Course) throws -> ContentBundle {
        guard let url = Bundle.module.url(forResource: course.resourceName, withExtension: "json") else {
            throw ContentStoreError.resourceNotFound(course.resourceName)
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(ContentBundle.self, from: data)
    }

    private static func loadScenarios() throws -> [Scenario] {
        try loadJSON([Scenario].self, resource: "scenarios")
    }

    private static func loadJSON<T: Decodable>(_ type: T.Type, resource: String) throws -> T {
        guard let url = Bundle.module.url(forResource: resource, withExtension: "json") else {
            throw ContentStoreError.resourceNotFound(resource)
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
