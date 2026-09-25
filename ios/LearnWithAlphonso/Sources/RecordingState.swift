import Foundation

/// Tracks whether any screen in the app is currently recording.
///
/// Exists for one decision: when an audio interruption ends, the podcast
/// player must honour `.shouldResume` for a system interruption (a phone
/// call, an alarm, Siri) but **suppress** it when the interruption was one
/// of this app's own mic screens taking the session. Resuming a podcast
/// over someone mid-speaking-exercise is the failure to avoid; never
/// resuming at all would make a podcast silently die after a phone call,
/// which reads as a bug.
///
/// **Why an explicit flag rather than reading
/// `AVAudioSession.sharedInstance().category`:** the category is
/// process-wide and is known to linger in this app — see
/// SpeakQuestionCard's comment about a plain `.playAndRecord` leaving every
/// sound in the app coming out of the earpiece "for the rest of the
/// session". A category check would therefore suppress resume forever
/// after the first speaking question.
///
/// **Why the player reads this at `.began` and not at `.ended`:** every
/// recorder's `stop()` calls `setActive(false, [.notifyOthersOnDeactivation])`,
/// which is what makes iOS deliver an interruption-ended carrying
/// `.shouldResume`. By then the recorder has already finished, so a flag
/// read at `.ended` races with it. Deciding when the interruption *begins*
/// is ordering-independent.
///
/// A counter rather than a bool because the screens are independent and a
/// review queue interleaves speaking items: one screen's stop must not
/// clear another's start.
final class RecordingState: @unchecked Sendable {
    static let shared = RecordingState()

    private let lock = NSLock()
    private var activeRecorders = 0

    var isRecording: Bool {
        lock.lock()
        defer { lock.unlock() }
        return activeRecorders > 0
    }

    func began() {
        lock.lock()
        defer { lock.unlock() }
        activeRecorders += 1
    }

    func ended() {
        lock.lock()
        defer { lock.unlock() }
        activeRecorders = max(0, activeRecorders - 1)
    }
}
