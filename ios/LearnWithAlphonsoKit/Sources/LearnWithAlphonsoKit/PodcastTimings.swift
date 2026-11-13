import Foundation

/// One sentence of an episode's transcript with the second it starts. Mirrors src/lib/podcast-timings.ts (web) and
/// PodcastTimings.kt (Android). Produced offline by aligning the stored transcript to the audio; the text is the
/// transcript's own words, never re-transcribed.
public struct TimedLine: Sendable, Equatable, Decodable {
    /// Start, in seconds from the beginning of the audio.
    public let s: Double
    public let t: String
    /// True when this sentence opens a paragraph.
    public let p: Bool

    public init(s: Double, t: String, p: Bool) {
        self.s = s
        self.t = t
        self.p = p
    }
}

public enum PodcastTimings {
    private struct Entry: Decodable { let lines: [TimedLine] }

    /// The bundled timing file: episode id to its lines. A malformed file is no timings, not a crash.
    public static func decode(_ data: Data) -> [String: [TimedLine]] {
        guard let all = try? JSONDecoder().decode([String: Entry].self, from: data) else { return [:] }
        return all.mapValues(\.lines)
    }

    /// The line being spoken at `seconds`: the last line whose start is at or before it. Before the first start (or for a
    /// non-finite time) it is the first line; with no lines it is -1. Binary search: it runs on every time update.
    public static func activeIndex(_ lines: [TimedLine], at seconds: Double) -> Int {
        guard !lines.isEmpty else { return -1 }
        let t = seconds.isFinite ? seconds : 0
        var lo = 0
        var hi = lines.count - 1
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if lines[mid].s <= t { lo = mid } else { hi = mid - 1 }
        }
        return lo
    }

    private static func squash(_ s: String) -> String {
        String(s.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) })
    }

    /// The lines, only if they still spell the transcript word for word (whitespace aside) and the starts never go
    /// backwards. Anything else is nil and the player shows the plain transcript, so an episode whose text was edited
    /// after alignment can never highlight the wrong words.
    public static func lines(_ lines: [TimedLine]?, matching transcript: String?) -> [TimedLine]? {
        guard let lines, !lines.isEmpty, let transcript else { return nil }
        if lines.count > 1 {
            for i in 1..<lines.count where lines[i].s < lines[i - 1].s { return nil }
        }
        return lines.map { squash($0.t) }.joined() == squash(transcript) ? lines : nil
    }
}

/// The full player's sleep timer choices.
public enum SleepChoice: String, Sendable, CaseIterable, Equatable {
    case off, fifteen, thirty, fortyFive, endOfEpisode

    public var label: String {
        switch self {
        case .off: return "Off"
        case .fifteen: return "15 min"
        case .thirty: return "30 min"
        case .fortyFive: return "45 min"
        case .endOfEpisode: return "End of episode"
        }
    }

    public var minutes: Int? {
        switch self {
        case .fifteen: return 15
        case .thirty: return 30
        case .fortyFive: return 45
        case .off, .endOfEpisode: return nil
        }
    }
}

/// The sleep timer as pure logic: the clock and the "episode ended" signal come in as arguments.
public struct SleepTimerState: Sendable, Equatable {
    public let choice: SleepChoice
    /// Clock time (seconds) at which a timed choice fires; nil for off and end of episode.
    public let endsAt: TimeInterval?

    public static let off = SleepTimerState(choice: .off, endsAt: nil)

    public static func start(_ choice: SleepChoice, now: TimeInterval) -> SleepTimerState {
        SleepTimerState(choice: choice, endsAt: choice.minutes.map { now + Double($0) * 60 })
    }

    /// Seconds left on a timed choice (never negative); nil for off and end of episode.
    public func remaining(now: TimeInterval) -> TimeInterval? {
        endsAt.map { max(0, $0 - now) }
    }

    /// True when playback should pause now: a timed choice reached its deadline, or end-of-episode and it ended.
    public func shouldPause(now: TimeInterval, episodeEnded: Bool) -> Bool {
        if choice == .endOfEpisode { return episodeEnded }
        guard let endsAt else { return false }
        return now >= endsAt
    }
}
