import Foundation

/// The Library's four sub-tabs (web ListenLibrary.tsx, Android LibraryTab in ListenShelfUi.kt). "All" is the Continue card
/// plus a one-row peek of Watch and of Stories, each with "See all" that switches to that tab; the other three are the
/// focused screens. The selected tab is remembered for the session only: a fresh launch starts on All.
public enum LibraryTab: String, CaseIterable, Sendable, Equatable {
    case all, listen, watch, stories

    public var title: String {
        switch self {
        case .all: return "All"
        case .listen: return "Listen"
        case .watch: return "Watch"
        case .stories: return "Stories"
        }
    }

    /// How many items the All tab's one-row peek shows for Watch and for Stories.
    public static let watchPeekCount = 3
    public static let storiesPeekCount = 3

    /// The spoken name of a tab's "See all" link.
    public var seeAllLabel: String {
        switch self {
        case .watch: return "See all videos"
        case .stories: return "See all stories"
        case .listen: return "See all episodes"
        case .all: return "See all"
        }
    }

    /// The spoken name of the All tab's Podcasts rail "See all" (it opens the Listen tab).
    public static let podcastsSeeAllLabel = "See all podcasts"

    /// "Continue <series>, episode N of M: <title>, <left>": the Continue card's one spoken label.
    public static func continueLabel(series: String, number: Int, count: Int, title: String, detail: String) -> String {
        "Continue \(series), episode \(number) of \(count): \(title), \(detail)"
    }

    /// The Continue card's visible line: "Episode N of M · 4:10 left".
    public static func continueSubtitle(number: Int, count: Int, detail: String) -> String {
        "Episode \(number) of \(count) \u{00B7} \(detail)"
    }
}

/// The Library's course chip, "EN \u{25BE}": the compact chip in place of the full-width English / Francais / Espanol control
/// (owner pick, build 72 feedback). Mirrors CourseChip in ListenLibrary.tsx and ListenShelfUi.kt.
public enum LibraryCourse {
    public struct Option: Equatable, Sendable {
        public let code: String
        public let label: String
    }

    public static let options: [Option] = [
        Option(code: "en", label: "English"),
        Option(code: "fr", label: "Fran\u{00E7}ais"),
        Option(code: "es", label: "Espa\u{00F1}ol"),
    ]

    /// The chip's text: the course code in capitals ("EN").
    public static func chipTitle(_ code: String) -> String { code.uppercased() }

    /// The language's own name, or the code for one the Library does not list.
    public static func label(_ code: String) -> String { options.first { $0.code == code }?.label ?? code }

    /// The chip's one spoken label: "Course: English".
    public static func accessibilityLabel(_ code: String) -> String { "Course: \(label(code))" }
}
