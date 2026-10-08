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
/// remembered across launches, per account: the next person to sign in on this device starts in their own course,
/// not the previous account's. It used to live only in LessonBrowserView's own
/// @State and reset to English on every launch, so the conversation screens
/// had no course to follow.
public enum ActiveCoursePreference {
    public static let defaultsKeyPrefix = "activeCourse."

    public static func defaultsKey(for userID: String) -> String { defaultsKeyPrefix + userID }

    /// English when signed out or when this account has never chosen.
    public static func load(for userID: String?, from defaults: UserDefaults = .standard) -> Course {
        guard let userID else { return .english }
        return defaults.string(forKey: defaultsKey(for: userID)).flatMap(Course.init(wireCode:)) ?? .english
    }

    /// Nothing is remembered while signed out.
    public static func save(_ course: Course, for userID: String?, to defaults: UserDefaults = .standard) {
        guard let userID else { return }
        defaults.set(course.wireCode, forKey: defaultsKey(for: userID))
    }
}
