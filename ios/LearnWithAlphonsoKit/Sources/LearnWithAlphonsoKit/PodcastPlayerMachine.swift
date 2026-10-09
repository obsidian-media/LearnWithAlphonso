import Foundation

public enum PodcastPlayerPhase: Equatable, Sendable {
    case idle
    /// Waiting for AVPlayer to actually play (first load, resume after pause, retry).
    case loading
    /// AVPlayer confirmed `timeControlStatus == .playing`. The only phase shown as playing.
    case playing
    case buffering
    case paused
    /// Reached the end: rewound to 0, marked complete, Play shown.
    case finished
    case failed(PodcastPlaybackFailure)
}

/// The one control the mini bar shows next to the title.
public enum PodcastPlayerControl: Equatable, Sendable {
    case none, play, pause, spinner, retry
}

public enum PodcastPlayerEvent: Equatable, Sendable {
    case start(isRemote: Bool, isOnline: Bool)
    case itemReady
    case itemFailed(PodcastPlaybackFailure)
    case timeControlPlaying
    case stalled
    case stallTimedOut(generation: Int)
    /// No first frame arrived in `loadTimeoutSeconds` after a start or resume.
    case loadTimedOut(generation: Int)
    case didPlayToEnd
    case togglePressed
    /// The system or the app paused us: a call (resumable), headphones pulled or a voice
    /// turn (not resumable).
    case pausedExternally(resumable: Bool)
    case interruptionEnded(shouldResume: Bool)
    case closed
}

public enum PodcastPlayerEffect: Equatable, Sendable {
    case loadItem
    case play
    case pause
    case seekToStart
    case savePosition
    case saveCompletion
    case flushPlayEvent
    case scheduleStallTimeout(generation: Int)
    case scheduleLoadTimeout(generation: Int)
}

/// The podcast player's rules, with no AVFoundation in sight.
///
/// `PodcastAudioPlayer` feeds it AVPlayer's signals and performs the effects it returns.
/// Keeping the rules here is what makes "a 404 or offline episode never shows as playing"
/// a unit test instead of a hope.
public struct PodcastPlayerMachine: Equatable, Sendable {
    /// How long a stall may last before it is reported as a network failure.
    public static let stallTimeoutSeconds: UInt64 = 20
    /// How long loading may last with no first frame before it is reported as a network
    /// failure with Retry (a stream that neither plays nor errors would spin forever).
    public static let loadTimeoutSeconds: UInt64 = 20

    public private(set) var phase: PodcastPlayerPhase = .idle
    /// Bumped by every stall, start, resume and close, so a stall or load timeout scheduled
    /// earlier does nothing.
    public private(set) var stallGeneration = 0
    private var resumeAfterInterruption = false

    public init() {}

    public var isAudible: Bool { phase == .playing }

    /// Loading, playing or buffering: the learner expects sound.
    public var isActive: Bool { [.loading, .playing, .buffering].contains(phase) }

    public var failure: PodcastPlaybackFailure? {
        if case let .failed(failure) = phase { return failure }
        return nil
    }

    public var control: PodcastPlayerControl {
        switch phase {
        case .idle: return .none
        case .loading, .buffering: return .spinner
        case .playing: return .pause
        case .paused, .finished: return .play
        case .failed: return .retry
        }
    }

    public mutating func send(_ event: PodcastPlayerEvent) -> [PodcastPlayerEffect] {
        switch event {
        case let .start(isRemote, isOnline):
            resumeAfterInterruption = false
            stallGeneration += 1
            if isRemote && !isOnline {
                phase = .failed(.offlineNotDownloaded)
                return []
            }
            phase = .loading
            return [.loadItem, .play, .scheduleLoadTimeout(generation: stallGeneration)]

        case .itemReady:
            // Ready is not playing. timeControlPlaying decides.
            return []

        case let .itemFailed(failure):
            guard phase != .idle else { return [] }
            phase = .failed(failure)
            resumeAfterInterruption = false
            return [.pause]

        case .timeControlPlaying:
            switch phase {
            case .loading, .buffering:
                phase = .playing
            default:
                break
            }
            return []

        case .stalled:
            guard phase == .playing else { return [] }
            phase = .buffering
            stallGeneration += 1
            return [.scheduleStallTimeout(generation: stallGeneration)]

        case let .loadTimedOut(generation):
            guard phase == .loading, generation == stallGeneration else { return [] }
            phase = .failed(.network)
            return [.pause]

        case let .stallTimedOut(generation):
            guard phase == .buffering, generation == stallGeneration else { return [] }
            phase = .failed(.network)
            return [.pause, .savePosition]

        case .didPlayToEnd:
            guard phase == .playing || phase == .buffering else { return [] }
            phase = .finished
            return [.seekToStart, .saveCompletion, .flushPlayEvent]

        case .togglePressed:
            switch phase {
            case .loading, .playing, .buffering:
                phase = .paused
                resumeAfterInterruption = false
                return [.pause, .savePosition]
            case .paused, .finished:
                phase = .loading
                stallGeneration += 1
                return [.play, .scheduleLoadTimeout(generation: stallGeneration)]
            case .idle, .failed:
                return []
            }

        case let .pausedExternally(resumable):
            guard isActive else { return [] }
            phase = .paused
            resumeAfterInterruption = resumable
            return [.pause, .savePosition]

        case let .interruptionEnded(shouldResume):
            let mayResume = resumeAfterInterruption
            resumeAfterInterruption = false
            guard phase == .paused, shouldResume, mayResume else { return [] }
            phase = .loading
            stallGeneration += 1
            return [.play, .scheduleLoadTimeout(generation: stallGeneration)]

        case .closed:
            phase = .idle
            resumeAfterInterruption = false
            stallGeneration += 1
            return []
        }
    }
}
