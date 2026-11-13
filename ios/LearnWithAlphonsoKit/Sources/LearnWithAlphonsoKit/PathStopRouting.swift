import Foundation

/// Where tapping a stop on "Your learning path" goes. Web and Android open every kind of stop; iOS used to open only
/// lessons. The decision is pure so it can be tested; the app target only performs it.
public enum PathDestination: Equatable, Sendable {
    case lesson(String)
    /// A podcast stop opens the Listen library (the stop names an episode, but the library is where it lives).
    case podcastLibrary
    /// A talk opens that scenario's pre-call sheet in Practice.
    case talk(String)
    /// A campaign stop opens that scene's pre-call sheet in Practice.
    case campaign(String, scene: Int)
}

/// What Practice should open for a campaign or talk destination, resolved against the content that is really there.
public enum PracticeChoice: Equatable, Sendable {
    case scenario(String)
    case campaign(String, scene: Int)
}

public enum PathStopRouting {
    /// The destination for a stop's reference, or nil when there is nothing to open: no reference, a finished stop,
    /// or a reference with an empty id. Any reference that is not a lesson, talk or campaign is a podcast, as on web and Android.
    public static func destination(for ref: PathItemRef?, done: Bool) -> PathDestination? {
        guard let ref, !done, !ref.id.isEmpty else { return nil }
        switch ref.kind {
        case "lesson": return .lesson(ref.id)
        case "talk": return .talk(ref.id)
        case "campaign": return .campaign(ref.id, scene: max(0, ref.sceneIndex ?? 0))
        default: return .podcastLibrary
        }
    }

    /// Which Practice sheet to open for `destination`, or nil if it is not a Practice destination or the scenario or
    /// campaign is not in this course's content (a stale or foreign id opens nothing rather than a wrong screen).
    /// A scene index past the last scene is clamped to the last scene.
    public static func practiceChoice(
        for destination: PathDestination,
        scenarioIDs: [String],
        campaignSceneCounts: [String: Int]
    ) -> PracticeChoice? {
        switch destination {
        case let .talk(id):
            return scenarioIDs.contains(id) ? .scenario(id) : nil
        case let .campaign(id, scene):
            guard let count = campaignSceneCounts[id], count > 0 else { return nil }
            return .campaign(id, scene: min(max(0, scene), count - 1))
        case .lesson, .podcastLibrary:
            return nil
        }
    }
}
