import Foundation

// The pure parts of the full-screen Practice call: which room, what the caption says, the clock, the "You" tile's
// bars and the state pill. The view (PracticeCallView.swift) only draws them.

/// The room behind Alphonso. One image per scenario, keyed by scenario id; everything else (campaigns, free talk) gets
/// the default study room. Adding a scenario's art is one entry in `scenariosWithArt` plus its file.
public struct CallRoom: Equatable, Sendable {
    /// The light-mode image name, without extension.
    public let light: String
    /// The dark-mode image name. The default room has its own evening picture; a scenario's image is the same
    /// picture dimmed by an overlay (`dimInDark`).
    public let dark: String
    public let dimInDark: Bool
}

public enum CallScenes {
    public static let scenarioIDs = [
        "coffee", "interview", "airport", "doctor", "smalltalk", "restaurant",
        "hotel", "directions", "apartment", "returns", "negotiation", "debate",
    ]
    /// Scenario ids that have their own image (AlphonsoScenes/<id>.webp). A scenario missing here gets the default room.
    public static let scenariosWithArt: Set<String> = Set(scenarioIDs)
    public static let defaultRoom = CallRoom(light: "room-light", dark: "room-dark", dimInDark: false)

    public static func room(for scenarioID: String?, withArt: Set<String> = scenariosWithArt) -> CallRoom {
        guard let scenarioID, withArt.contains(scenarioID) else { return defaultRoom }
        return CallRoom(light: scenarioID, dark: scenarioID, dimInDark: true)
    }

    /// The evening overlay on a scenario image in dark mode: navy #16203c, multiplied, at 50%.
    public static let eveningOverlayOpacity = 0.5
}

/// What the live caption shows: only the current utterance.
public struct CallCaption: Equatable, Sendable {
    public let text: String
    /// The learner's own words: drawn in a green tint.
    public let mine: Bool
    public init(text: String, mine: Bool) {
        self.text = text
        self.mine = mine
    }
}

public enum CallCaptionRules {
    /// The last turn of the conversation, unless the learner is holding the button (their words are not known yet).
    public static func caption(turns: [ChatMessage], isRecording: Bool) -> CallCaption? {
        guard !isRecording, let last = turns.last,
              !last.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return CallCaption(text: last.content, mine: last.role == "user")
    }

    /// How many of `wordCount` words are lit at `progress` (0...1) through the audio. A hair past linear so the last
    /// word lights before the audio ends, as on the web.
    public static func litWords(wordCount: Int, progress: Double) -> Int {
        guard wordCount > 0 else { return 0 }
        let clamped = min(max(progress, 0), 1)
        return min(wordCount, Int((clamped * Double(wordCount) * 1.03).rounded(.up)))
    }
}

public enum CallClock {
    /// "0:00", "1:05", "12:30".
    public static func format(seconds: Int) -> String {
        let s = max(0, seconds)
        return "\(s / 60):\(s % 60 < 10 ? "0" : "")\(s % 60)"
    }
}

public enum CallLevel {
    public static let barCount = 5
    public static let minHeight = 6.0
    public static let maxHeight = 34.0

    /// A bar's height for the microphone level in dBFS (nil: no metering, so the resting height: nothing is faked).
    /// Louder is taller; each bar leans a little differently so the five do not move as one block.
    public static func barHeight(dBFS: Double?, index: Int) -> Double {
        guard let dBFS, dBFS.isFinite else { return minHeight }
        let rms = pow(10, min(dBFS, 0) / 20)
        let shaped = min(1, rms.squareRoot() * 2.2)
        let lean = 0.65 + 0.35 * abs(sin(Double(index + 1) * 1.7))
        return minHeight + (maxHeight - minHeight) * min(1, shaped * lean)
    }
}

extension AvatarMode {
    /// The small pill under the caption.
    public var callLabel: String {
        switch self {
        case .idle: return "Listening"
        case .listening: return "Listening to you"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        case .reacting(.happy): return "Nice!"
        case .reacting(.encouraging): return "Let's fix that"
        }
    }
}
