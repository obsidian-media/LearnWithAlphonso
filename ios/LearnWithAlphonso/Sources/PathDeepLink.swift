import Observation
import LearnWithAlphonsoKit

/// A stop on "Your learning path" that lives in another tab. The path screen sets `pending`; RootView switches to the
/// tab that owns it and Practice opens the sheet. The decision of where a stop goes is `PathStopRouting` in the Kit
/// (tested); this only carries it between tabs.
@Observable
@MainActor
final class PathDeepLink {
    var pending: PathDestination?

    func open(_ destination: PathDestination) { pending = destination }

    /// The tab a destination lives in. A lesson opens on the Learn tab (the path opens its own lessons directly; a video's
    /// "practice this" arrives here), a video in the Library.
    static func tab(for destination: PathDestination) -> RootTab? {
        switch destination {
        case .lesson: return .learn
        case .podcastLibrary, .video: return .listen
        case .talk, .campaign: return .practice
        }
    }
}
