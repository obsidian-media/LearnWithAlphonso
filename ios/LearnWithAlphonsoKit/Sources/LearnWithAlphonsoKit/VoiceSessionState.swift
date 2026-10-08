import Foundation

/// Where a hold-to-talk voice turn is.
public enum VoicePhase: Equatable, Sendable {
    case idle
    case requestingPermission(generation: Int)
    case recording(generation: Int)
    case transcribing(generation: Int)
    case thinking(generation: Int)
    case speaking(generation: Int)
    case failed(TutorError)

    var generation: Int? {
        switch self {
        case let .requestingPermission(g), let .recording(g), let .transcribing(g),
             let .thinking(g), let .speaking(g):
            return g
        case .idle, .failed:
            return nil
        }
    }
}

/// Side effects the app-target controller performs. The reducer itself
/// touches no audio API, which is what makes it testable on any platform.
public enum VoiceEffect: Equatable, Sendable {
    case pauseOtherAudio
    case requestPermission(generation: Int)
    case startRecorder(generation: Int)
    case stopRecorderAndSubmit(generation: Int)
    case cancelRecorder
    case stopPlayback
    case deactivateAudioSession
}

/// The pure state machine every voice screen runs (Hector, Practice,
/// Campaigns, speaking questions).
///
/// **Why generations, not a torn-down flag.** The four screens used to
/// set `isTornDown = true` in onDisappear and never reset it. In a TabView
/// the screen's @State survives a tab switch, so one switch left the mic
/// permanently dead. Here every appearance AND disappearance bumps
/// `generation`. Asynchronous results (permission callback, recorder start,
/// transcript, reply, playback end) carry the generation they began in and
/// are ignored when it is no longer current. A late callback can never act
/// on a screen that left, and a returning screen always works.
public struct VoiceSessionState: Equatable, Sendable {
    public enum Event: Equatable, Sendable {
        case appeared
        case disappeared
        case pressBegan
        case pressEnded
        case permissionResolved(generation: Int, granted: Bool)
        case recorderStarted(generation: Int)
        case recorderFailed(generation: Int)
        case transcribed(generation: Int)
        case replyReady(generation: Int, hasAudio: Bool)
        case playbackFinished(generation: Int)
        case failed(generation: Int, TutorError)
        case turnFinished(generation: Int)
        case interrupted
        case outputRouteLost
    }

    public private(set) var phase: VoicePhase = .idle
    public private(set) var generation = 0
    public private(set) var isVisible = false
    /// The finger lifted while permission was still being requested.
    public private(set) var stopRequested = false
    /// Permission denied. Screens offer typing instead. Cleared if a later attempt is granted.
    public private(set) var microphoneUnavailable = false
    /// The recorder could not start this time (for example while a call holds the audio session). Transient: it
    /// clears on the next press and on a successful start, and never turns typing on by itself.
    public private(set) var recorderStartFailed = false

    public init() {}

    /// A spinner is showing: the turn is with the network.
    public var isBusy: Bool {
        switch phase {
        case .transcribing, .thinking: return true
        default: return false
        }
    }

    /// A press would start a new recording now (speaking can be interrupted).
    public var canStartPress: Bool {
        guard isVisible else { return false }
        switch phase {
        case .idle, .failed, .speaking: return true
        default: return false
        }
    }

    public func accepts(generation candidate: Int) -> Bool {
        isVisible && candidate == generation
    }

    public mutating func handle(_ event: Event) -> [VoiceEffect] {
        switch event {
        case .appeared:
            generation += 1
            isVisible = true
            stopRequested = false
            if phase.generation != nil { phase = .idle }
            return []

        case .disappeared:
            let previous = phase
            generation += 1
            isVisible = false
            stopRequested = false
            if previous.generation != nil { phase = .idle }
            switch previous {
            case .recording: return [.cancelRecorder, .deactivateAudioSession]
            case .speaking: return [.stopPlayback, .deactivateAudioSession]
            default: return []
            }

        case .pressBegan:
            guard canStartPress else { return [] }
            let wasSpeaking: Bool
            if case .speaking = phase { wasSpeaking = true } else { wasSpeaking = false }
            phase = .requestingPermission(generation: generation)
            stopRequested = false
            recorderStartFailed = false
            let start: [VoiceEffect] = [.pauseOtherAudio, .requestPermission(generation: generation)]
            return wasSpeaking ? [.stopPlayback] + start : start

        case .pressEnded:
            switch phase {
            case .requestingPermission:
                stopRequested = true
                return []
            case let .recording(g):
                phase = .transcribing(generation: g)
                return [.stopRecorderAndSubmit(generation: g)]
            default:
                return []
            }

        case let .permissionResolved(g, granted):
            guard accepts(generation: g), phase == .requestingPermission(generation: g) else { return [] }
            guard granted else {
                phase = .idle
                stopRequested = false
                microphoneUnavailable = true
                return []
            }
            microphoneUnavailable = false
            return [.startRecorder(generation: g)]

        case let .recorderStarted(g):
            guard accepts(generation: g), phase == .requestingPermission(generation: g) else {
                // Started for a screen that has since left: release it.
                return [.cancelRecorder]
            }
            recorderStartFailed = false
            if stopRequested {
                stopRequested = false
                phase = .transcribing(generation: g)
                return [.stopRecorderAndSubmit(generation: g)]
            }
            phase = .recording(generation: g)
            return []

        case let .recorderFailed(g):
            guard accepts(generation: g), phase == .requestingPermission(generation: g) else { return [] }
            phase = .idle
            stopRequested = false
            recorderStartFailed = true
            return [.deactivateAudioSession]

        case let .transcribed(g):
            guard accepts(generation: g), phase == .transcribing(generation: g) else { return [] }
            phase = .thinking(generation: g)
            return []

        case let .replyReady(g, hasAudio):
            guard accepts(generation: g),
                  phase == .transcribing(generation: g) || phase == .thinking(generation: g) else { return [] }
            phase = hasAudio ? .speaking(generation: g) : .idle
            return []

        case let .playbackFinished(g):
            guard phase == .speaking(generation: g) else { return [] }
            phase = .idle
            return [.deactivateAudioSession]

        case let .failed(g, error):
            guard accepts(generation: g) else { return [] }
            switch phase {
            case .transcribing(generation: g), .thinking(generation: g):
                phase = .failed(error)
                return [.deactivateAudioSession]
            case .speaking(generation: g):
                phase = .failed(error)
                return [.stopPlayback, .deactivateAudioSession]
            default:
                return []
            }

        case let .turnFinished(g):
            if phase == .transcribing(generation: g) || phase == .thinking(generation: g) {
                phase = .idle
                return [.deactivateAudioSession]
            }
            // The screen left mid-turn: the turn that finishes now is stale. Hand the audio session back unless a
            // newer recording or reply is using it, so other apps' audio can resume.
            if g != generation, phase.generation == nil { return [.deactivateAudioSession] }
            return []

        case .interrupted:
            switch phase {
            case .recording:
                phase = .idle
                stopRequested = false
                return [.cancelRecorder, .deactivateAudioSession]
            case .requestingPermission:
                phase = .idle
                stopRequested = false
                return []
            case .speaking:
                phase = .idle
                return [.stopPlayback, .deactivateAudioSession]
            default:
                return []
            }

        case .outputRouteLost:
            guard case .speaking = phase else { return [] }
            phase = .idle
            return [.stopPlayback, .deactivateAudioSession]
        }
    }
}

/// Learner-facing copy for the microphone states of a voice screen.
public enum VoiceCopy {
    public static let microphoneOff = "Microphone access is off. Turn it on in Settings > Privacy > Microphone."
    public static let microphoneCouldNotStart = "Couldn't start the microphone. Try again."
}
