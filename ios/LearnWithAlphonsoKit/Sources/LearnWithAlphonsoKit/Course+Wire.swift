import Foundation

extension Course {
    /// The course code every API body and DB column uses ("en"/"fr"/"es"),
    /// identical to the web's `Course` type and `isCourse`. Named `wireCode`,
    /// not `code`, because the app target declares `private extension Course
    /// { var code }` in several files, and a public `code` here would make
    /// those call sites ambiguous.
    public var wireCode: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }

    public init?(wireCode: String) {
        switch wireCode {
        case "en": self = .english
        case "fr": self = .french
        case "es": self = .spanish
        default: return nil
        }
    }
}

/// The learner's active course, shared by Learn, Practice and Hector, and
/// remembered across launches. It used to live only in LessonBrowserView's own
/// @State and reset to English on every launch, so the conversation screens
/// had no course to follow.
public enum ActiveCoursePreference {
    public static let defaultsKey = "activeCourse"

    public static func load(from defaults: UserDefaults = .standard) -> Course {
        defaults.string(forKey: defaultsKey).flatMap(Course.init(wireCode:)) ?? .english
    }

    public static func save(_ course: Course, to defaults: UserDefaults = .standard) {
        defaults.set(course.wireCode, forKey: defaultsKey)
    }
}
