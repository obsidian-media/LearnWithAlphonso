import Foundation

public enum AvatarReaction: Equatable, Sendable {
    case happy, encouraging
}

public enum AvatarMode: Equatable, Sendable {
    case idle, listening, thinking, speaking
    case reacting(AvatarReaction)
}

/// What the avatar's face shows right now. Body motion (breathing, sway, ears, glint) is separate: it is the view's
/// to run or not, depending on Reduce Motion.
public struct AvatarPose: Equatable, Sendable {
    public let mouth: AvatarViseme
    public let brows: AvatarBrows
    public init(mouth: AvatarViseme, brows: AvatarBrows) {
        self.mouth = mouth
        self.brows = brows
    }
}

/// Where the reply's audio is, and the plan for its words.
public struct AvatarSpeechPosition: Sendable {
    public let plan: AvatarLipSyncPlan
    public let time: TimeInterval
    public init(plan: AvatarLipSyncPlan, time: TimeInterval) {
        self.plan = plan
        self.time = time
    }
}

/// The avatar's state machine. It follows the voice session's phase (so interruptions come for free: the session
/// leaves `speaking` the moment the learner presses talk, and the avatar follows in the same update) and turns it
/// plus a few inputs into a face. The learner talking never moves his mouth.
public struct AvatarMachine: Sendable {
    /// Brows stay up this long after a loud moment.
    public static let loudBrowHold: TimeInterval = 0.5
    /// Average input level above which the learner counts as loud, in dBFS.
    public static let loudThresholdDBFS: Double = -20
    /// A reaction (happy or encouraging) lasts about this long.
    public static let reactionDuration: TimeInterval = 1.2

    public private(set) var mode: AvatarMode = .idle
    private var lastPhase: VoicePhase?
    private var browsRaisedUntil: TimeInterval = -.infinity
    private var reactionUntil: TimeInterval = -.infinity

    public init() {}

    /// Call every frame with the session's current phase; only a change does anything.
    public mutating func update(phase: VoicePhase, now: TimeInterval) {
        guard phase != lastPhase else { return }
        lastPhase = phase
        let next: AvatarMode
        switch phase {
        case .idle, .failed: next = .idle
        case .requestingPermission, .recording: next = .listening
        case .transcribing, .thinking: next = .thinking
        case .speaking: next = .speaking
        }
        mode = next
        if next != .listening { browsRaisedUntil = -.infinity }
    }

    /// A moment of the learner's voice while they hold the button.
    public mutating func heard(levelDBFS: Double, now: TimeInterval) {
        guard mode == .listening, levelDBFS > Self.loudThresholdDBFS else { return }
        browsRaisedUntil = now + Self.loudBrowHold
    }

    /// A short reaction to the learner's answer. Nothing in the app calls this yet: the reply data does not say
    /// whether the learner was right.
    public mutating func react(_ reaction: AvatarReaction, now: TimeInterval) {
        mode = .reacting(reaction)
        reactionUntil = now + Self.reactionDuration
    }

    public func pose(now: TimeInterval, speech: AvatarSpeechPosition?) -> AvatarPose {
        switch mode {
        case .idle:
            return AvatarPose(mouth: .closed, brows: .neutral)
        case .listening:
            return AvatarPose(mouth: .closed, brows: now < browsRaisedUntil ? .raised : .neutral)
        case .thinking:
            return AvatarPose(mouth: .closed, brows: .lowered)
        case .speaking:
            guard let speech else { return AvatarPose(mouth: .closed, brows: .neutral) }
            return AvatarPose(mouth: speech.plan.viseme(at: speech.time), brows: speech.plan.brows(at: speech.time))
        case let .reacting(reaction):
            guard now < reactionUntil else { return AvatarPose(mouth: .closed, brows: .neutral) }
            switch reaction {
            case .happy: return AvatarPose(mouth: .ee, brows: .raised)
            case .encouraging: return AvatarPose(mouth: .talk, brows: .neutral)
            }
        }
    }
}
