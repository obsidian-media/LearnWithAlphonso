import Foundation

/// The app's short sound effects (Kenney.nl, CC0; see THIRD_PARTY_NOTICES.md). The files ship in the app bundle as
/// `<fileName>.mp3`. This file is the pure logic; the app's SoundEffectsPlayer plays them.
public enum SoundEffect: String, CaseIterable, Sendable {
    case right, wrong, lessonComplete, xp, heartLost, tap, callStart, callEnd, achievement

    public var fileName: String {
        switch self {
        case .right: return "sfx-right"
        case .wrong: return "sfx-wrong"
        case .lessonComplete: return "sfx-lesson-complete"
        case .xp: return "sfx-xp"
        case .heartLost: return "sfx-heart-lost"
        case .tap: return "sfx-tap"
        case .callStart: return "sfx-call-start"
        case .callEnd: return "sfx-call-end"
        case .achievement: return "sfx-achievement"
        }
    }

    /// Seconds, rounded up. The call-start cue must be over before Alphonso's opening line.
    public var duration: TimeInterval {
        switch self {
        case .right: return 0.48
        case .wrong: return 0.32
        case .lessonComplete: return 1.16
        case .xp: return 0.07
        case .heartLost: return 0.18
        case .tap: return 0.07
        case .callStart: return 0.73
        case .callEnd: return 0.72
        case .achievement: return 0.3
        }
    }

    /// The light haptic that goes with the moment on a phone (it follows the system haptics setting and the Sound effects switch: off is no haptics too).
    public var haptic: SoundEffectHaptic? {
        switch self {
        case .right, .lessonComplete, .achievement: return .success
        case .wrong: return .warning
        case .xp, .heartLost, .tap, .callStart, .callEnd: return nil
        }
    }
}

public enum SoundEffectHaptic: Equatable, Sendable {
    case success, warning
}

/// The Settings "Sound effects" switch, stored on this device. On by default; off is completely silent.
public enum SoundEffectsPreference {
    public static let key = "soundEffectsEnabled"
    public static let defaultValue = true

    /// The switch as stored on this device. Haptics read this too: with sound effects off, nothing buzzes.
    public static func isOn(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: key) as? Bool ?? defaultValue
    }
}

public struct SoundEffectCue: Equatable, Sendable {
    public let effect: SoundEffect
    public let delay: TimeInterval

    public init(effect: SoundEffect, delay: TimeInterval) {
        self.effect = effect
        self.delay = delay
    }
}

public enum SoundEffectCues {
    /// A right or wrong answer; a lost heart follows the wrong-answer sound rather than playing over it.
    public static func verdict(correct: Bool, losesHeart: Bool) -> [SoundEffectCue] {
        if correct { return [.init(effect: .right, delay: 0)] }
        var cues = [SoundEffectCue(effect: .wrong, delay: 0)]
        if losesHeart { cues.append(.init(effect: .heartLost, delay: SoundEffect.wrong.duration)) }
        return cues
    }

    /// The complete screen: the jingle with the confetti, XP once it is over, the achievement as its card lands (1.7 s).
    public static func finish(xp: Int, unlocked: Int) -> [SoundEffectCue] {
        var cues = [SoundEffectCue(effect: .lessonComplete, delay: 0)]
        if xp > 0 { cues.append(.init(effect: .xp, delay: 1.2)) }
        if unlocked > 0 { cues.append(.init(effect: .achievement, delay: 1.7)) }
        return cues
    }
}

/// Decides whether an effect plays: never with the switch off, never while Alphonso or Hector is speaking, and once
/// per key (so a re-render cannot double it). Not thread-safe: the app uses it on the main actor.
public final class SoundEffectGate {
    private let isEnabled: () -> Bool
    private let isSwitchOn: () -> Bool
    private let isVoiceActive: () -> Bool
    private let now: () -> Date
    private var playedKeys = Set<String>()
    private var callCueEndsAt = Date.distantPast

    /// `isSwitchOn` is the Settings switch alone (default: the same as `isEnabled`); haptics follow it.
    public init(isEnabled: @escaping () -> Bool, isVoiceActive: @escaping () -> Bool,
                now: @escaping () -> Date = Date.init, isSwitchOn: (() -> Bool)? = nil) {
        self.isEnabled = isEnabled
        self.isSwitchOn = isSwitchOn ?? isEnabled
        self.isVoiceActive = isVoiceActive
        self.now = now
    }

    public func shouldPlay(_ effect: SoundEffect, key: String?) -> Bool {
        guard isEnabled() else { return false }
        if let key, playedKeys.contains(key) { return false }
        guard !isVoiceActive() else { return false }
        if let key { playedKeys.insert(key) }
        if effect == .callStart { callCueEndsAt = now().addingTimeInterval(effect.duration) }
        return true
    }

    /// Whether an effect's haptic fires: only with the Sound effects switch on, and only for effects that have one.
    public func shouldVibrate(_ effect: SoundEffect) -> Bool {
        effect.haptic != nil && isSwitchOn()
    }

    /// How long the call-start sound still has to play: the opening line waits this long.
    public func callCueRemaining() -> TimeInterval {
        max(0, callCueEndsAt.timeIntervalSince(now()))
    }
}
