import Foundation

/// Hands-free conversation for Hector: instead of holding the mic, the learner talks and the turn ends on its own
/// after a pause, then the next turn starts listening once Hector has finished replying.
///
/// Pure and clock-free: the app feeds it the voice engine's phase and the recorder's average power (dBFS) with a
/// timestamp, and performs the effects through the existing `VoiceSessionController` (`beginTurn` is a press,
/// `endTurn` a release, `cancelTurn` an interruption). Nothing here touches audio.
///
/// Safety and privacy rules it enforces (each pauses hands-free; one tap resumes):
/// - a failure, a refused microphone, a phone call, Siri or lost earbuds;
/// - a turn in which nobody speaks for `noSpeechTimeout` (cancelled, nothing sent);
/// - a turn still going after `maxTurn` (cancelled, nothing sent: continuous sound for that long is a TV or a
///   crowd far more often than a learner);
/// - a turn whose transcript came back empty (background noise, not speech);
/// - `maxTurnsWithoutTouch` turns in a row without the learner touching the screen.
/// So a noisy room cannot keep sending bystanders' audio indefinitely.
public struct HandsFreeLoop: Equatable, Sendable {
    public struct Tuning: Equatable, Sendable {
        /// How far above the measured background level counts as speech.
        public var speechAboveFloor: Double = 14
        /// The background is measured over the first moment of each turn (the quietest sample wins).
        public var calibration: TimeInterval = 0.3
        /// The background is never taken as louder than this (dBFS), so speech that starts at once
        /// cannot raise the threshold above normal speaking levels.
        public var maximumBackground: Double = -35
        /// Speech must be at least this loud whatever the background (dBFS).
        public var minimumSpeechLevel: Double = -42
        /// Loud for this long before it counts as speech (filters taps and clicks).
        public var speechOnset: TimeInterval = 0.2
        /// Quiet for this long after speech ends the turn.
        public var endOfTurnSilence: TimeInterval = 1.2
        /// Nothing said for this long: cancel the turn and pause hands-free.
        public var noSpeechTimeout: TimeInterval = 8
        /// A turn still going after this is cancelled and hands-free pauses.
        public var maxTurn: TimeInterval = 30
        /// Readings below this are the recorder warming up (it reports -160 before any audio), not the room.
        public var ignoreBelow: Double = -100
        /// Turns in a row without a touch before hands-free pauses.
        public var maxTurnsWithoutTouch = 20

        public init() {}
    }

    public enum Event: Equatable, Sendable {
        case enable
        case disable
        /// The learner tapped pause or resume.
        case togglePause
        /// The voice engine moved to a new phase.
        case voicePhase(VoicePhase)
        /// One recorder level sample while recording.
        case level(dBFS: Double, at: TimeInterval)
        /// The finished turn's transcript was empty: it was noise, not speech.
        case turnHadNoWords
        /// A phone call, Siri or another app took the audio, or the earbuds were removed.
        case audioInterrupted
    }

    public enum Effect: Equatable, Sendable {
        case beginTurn
        case endTurn
        case cancelTurn
    }

    public enum Status: Equatable, Sendable {
        case off
        /// Waiting for Hector, or for the voice engine to be ready.
        case waiting
        case listening
        /// Speech detected in this turn.
        case hearing
        /// Paused by the learner, after a failure, or after nobody spoke.
        case paused(PauseReason)
    }

    public enum PauseReason: Equatable, Sendable {
        case byLearner
        case noSpeech
        case failure
        case longTurn
        case noWords
        case turnLimit
        case interrupted
    }

    public let tuning: Tuning
    public private(set) var status: Status = .off
    private var phase: VoicePhase = .idle
    private var turnStartedAt: TimeInterval?
    private var backgroundLevel: Double?
    private var loudSince: TimeInterval?
    private var lastLoudAt: TimeInterval?
    private var heardSpeech = false
    private var turnEnding = false
    private var turnsWithoutTouch = 0

    public init(tuning: Tuning = Tuning()) {
        self.tuning = tuning
    }

    public var isOn: Bool { status != .off }

    public mutating func handle(_ event: Event) -> [Effect] {
        switch event {
        case .enable:
            guard status == .off else { return [] }
            status = .waiting
            turnsWithoutTouch = 0
            return startIfReady()

        case .disable:
            let wasRecording = isRecording
            status = .off
            resetTurn()
            return wasRecording ? [.cancelTurn] : []

        case .togglePause:
            switch status {
            case .off:
                return []
            case .paused:
                status = .waiting
                turnsWithoutTouch = 0
                return startIfReady()
            case .waiting, .listening, .hearing:
                let wasRecording = isRecording
                status = .paused(.byLearner)
                resetTurn()
                return wasRecording ? [.cancelTurn] : []
            }

        case .turnHadNoWords:
            guard isOn else { return [] }
            if case .paused = status { return [] }
            status = .paused(.noWords)
            return []

        case .audioInterrupted:
            guard isOn else { return [] }
            if case .paused = status { return [] }
            // The voice engine cancels the recording or reply itself; this only stops the next turn.
            status = .paused(.interrupted)
            resetTurn()
            return []

        case let .voicePhase(next):
            // Always recorded, even while off, so turning hands-free on mid-reply waits for the reply to end.
            let previous = phase
            phase = next
            guard isOn else { return [] }
            switch next {
            case .recording:
                if case .paused = status { return [.cancelTurn] }
                resetTurn()
                status = .listening
                return []
            case .failed:
                resetTurn()
                status = .paused(.failure)
                return []
            case .idle:
                resetTurn()
                if case .paused = status { return [] }
                // Permission refused or the recorder never started: asking again would loop forever.
                if case .requestingPermission = previous {
                    status = .paused(.failure)
                    return []
                }
                // A turn just finished (reply played, or no reply audio): listen again.
                if previous != .idle { status = .waiting }
                return startIfReady()
            case .requestingPermission, .transcribing, .thinking, .speaking:
                if case .paused = status { return [] }
                status = .waiting
                return []
            }

        case let .level(dBFS, at):
            guard isRecording, status == .listening || status == .hearing, !turnEnding else { return [] }
            guard dBFS >= tuning.ignoreBelow else { return [] }
            if turnStartedAt == nil { turnStartedAt = at }
            let started = turnStartedAt ?? at

            // The background is the quietest level heard: during calibration, and afterwards only while nobody has
            // spoken. It can fall but never rise, and is capped, so the learner's own voice never becomes the floor.
            if at - started < tuning.calibration || !heardSpeech {
                backgroundLevel = min(backgroundLevel ?? dBFS, dBFS, tuning.maximumBackground)
            }
            let threshold = max(tuning.minimumSpeechLevel, (backgroundLevel ?? tuning.maximumBackground) + tuning.speechAboveFloor)
            if at - started < tuning.calibration {
                // Still measuring the room: nothing counts as speech yet.
                loudSince = nil
            } else if dBFS >= threshold {
                if loudSince == nil { loudSince = at }
                lastLoudAt = at
                if let since = loudSince, at - since >= tuning.speechOnset {
                    heardSpeech = true
                    status = .hearing
                }
            } else {
                loudSince = nil
            }

            if at - started >= tuning.maxTurn {
                turnEnding = true
                status = .paused(heardSpeech ? .longTurn : .noSpeech)
                return [.cancelTurn]
            }
            if heardSpeech, let last = lastLoudAt, at - last >= tuning.endOfTurnSilence {
                turnEnding = true
                return [.endTurn]
            }
            if !heardSpeech, at - started >= tuning.noSpeechTimeout {
                turnEnding = true
                return cancelForNoSpeech()
            }
            return []
        }
    }

    private var isRecording: Bool {
        if case .recording = phase { return true }
        return false
    }

    private mutating func startIfReady() -> [Effect] {
        guard status == .waiting else { return [] }
        // The voice engine accepts a new press from idle or after a failure.
        switch phase {
        case .idle, .failed: break
        default: return []
        }
        turnsWithoutTouch += 1
        if turnsWithoutTouch > tuning.maxTurnsWithoutTouch {
            status = .paused(.turnLimit)
            return []
        }
        return [.beginTurn]
    }

    private mutating func cancelForNoSpeech() -> [Effect] {
        status = .paused(.noSpeech)
        return [.cancelTurn]
    }

    private mutating func resetTurn() {
        turnStartedAt = nil
        backgroundLevel = nil
        loudSince = nil
        lastLoudAt = nil
        heardSpeech = false
        turnEnding = false
    }
}

/// Learner-facing copy for hands-free mode.
public enum HandsFreeCopy {
    public static let toggle = "Hands-free"
    public static let firstUseTitle = "Talk without holding the button"
    public static let firstUseBody = "Hector listens after each reply and answers when you pause, also with the screen locked. It pauses after 8 seconds of quiet, after background noise, and after 20 turns, and anything it hears is sent for transcription like a held recording. Don't use it while driving or anywhere you need your full attention."
    public static let firstUseConfirm = "Turn on hands-free"
    public static let listening = "Listening. Just talk."
    public static let hearing = "Hearing you..."
    public static let waiting = "Hector is replying..."
    public static let pausedByLearner = "Hands-free is paused."
    public static let pausedNoSpeech = "Paused because nobody spoke. Tap Resume to keep talking."
    public static let pausedFailure = "Paused after a problem. Tap Resume to try again."
    public static let pausedLongTurn = "Paused after a very long turn. Tap Resume to keep talking."
    public static let pausedNoWords = "Paused because it only heard background noise. Tap Resume to keep talking."
    public static let pausedTurnLimit = "Paused after 20 turns. Tap Resume to keep talking."
    public static let pausedInterrupted = "Paused because the audio was interrupted. Tap Resume to keep talking."
    public static let pause = "Pause"
    public static let resume = "Resume"

    public static func statusLine(_ status: HandsFreeLoop.Status) -> String? {
        switch status {
        case .off: return nil
        case .waiting: return waiting
        case .listening: return listening
        case .hearing: return hearing
        case .paused(.byLearner): return pausedByLearner
        case .paused(.noSpeech): return pausedNoSpeech
        case .paused(.failure): return pausedFailure
        case .paused(.longTurn): return pausedLongTurn
        case .paused(.noWords): return pausedNoWords
        case .paused(.turnLimit): return pausedTurnLimit
        case .paused(.interrupted): return pausedInterrupted
        }
    }
}
