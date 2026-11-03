import Foundation

/// The status pill on Hector's screen, read from the voice state the screen already has.
public enum HectorStatus: Equatable, Sendable {
    case listening, thinking, speaking

    public static func from(phase: VoicePhase, handsFree: HandsFreeLoop.Status) -> HectorStatus? {
        switch phase {
        case .recording: return .listening
        case .transcribing, .thinking: return .thinking
        case .speaking: return .speaking
        default: break
        }
        switch handsFree {
        case .listening, .hearing: return .listening
        default: return nil
        }
    }

    public var label: String {
        switch self {
        case .listening: return "Listening"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        }
    }

    public var moment: MascotMoment {
        switch self {
        case .listening: return .hectorListening
        case .thinking: return .hectorThinking
        case .speaking: return .hectorSpeaking
        }
    }

    /// Hector's art for a status; no status is his idle pose.
    public static func moment(for status: HectorStatus?) -> MascotMoment {
        status?.moment ?? .hectorIdle
    }
}
