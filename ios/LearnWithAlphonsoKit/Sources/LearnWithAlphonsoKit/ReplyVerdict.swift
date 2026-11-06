import Foundation

/// What the reply says about the learner's last turn: right, corrected, or nothing to say (wire value "none"). Anything the server sends
/// that is not one of the first two (a missing field, a new word from a later server) reads as `.inconclusive`.
public enum ReplyVerdict: Sendable, Equatable {
    case correct, corrected, inconclusive

    public init(wire: Any?) {
        switch wire as? String {
        case "correct": self = .correct
        case "corrected": self = .corrected
        default: self = .inconclusive
        }
    }
}
