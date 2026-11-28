import Foundation

/// The words under a phrase after "Say it" in the phrasebook. They describe how clearly the learner was UNDERSTOOD,
/// never a pronunciation score, and are neutral in tone (no "wrong", no red). The same lines as the web (say-it-copy.ts).
public enum PhraseSayCopy {
    public static let checking = "Checking how clearly that came across\u{2026}"
    public static let listening = "Listening\u{2026}"
    public static let offline = "You're offline. You can still hear each phrase."
    public static let tapAgain = "Tap Say it again"
    public static let framing = "Say a phrase to hear how clearly you were understood."

    /// The inline result line for one attempt.
    public static func resultText(_ check: PhraseCheck) -> String {
        switch check.result {
        case .clear:
            return "Understood clearly"
        case .mostly:
            let words = check.listenAgain
            if words.count >= 2 { return "Mostly understood: listen to \u{201C}\(words[0])\u{201D} and \u{201C}\(words[1])\u{201D} again" }
            if let first = words.first { return "Mostly understood: listen to \u{201C}\(first)\u{201D} again" }
            return "Mostly understood"
        case .notYet:
            return "Not understood yet: try again"
        }
    }

    /// VoiceOver name of a row's microphone.
    public static func micLabel(phrase: String) -> String { "Say: \(phrase)" }

}

/// What the screen should do after a tap on a row's microphone.
public enum PhraseSayAction: Equatable, Sendable {
    case startRecording(row: Int)
    case stopRecording
    case ignore
}

/// "Say it" in the phrasebook: one recording at a time across the rows. The learner's words are never kept: only the
/// outcome for the phrase they were saying (a PhraseCheck made of the EXPECTED phrase's own words) is held, in memory,
/// for as long as the screen is open. Nothing is stored, logged or replayed.
public struct PhraseSayState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case recording(row: Int)
        case checking(row: Int)
    }

    public private(set) var phase: Phase = .idle
    public private(set) var results: [Int: PhraseCheck] = [:]

    public init() {}

    /// The row being recorded or checked.
    public var busyRow: Int? {
        switch phase {
        case .idle: return nil
        case let .recording(row), let .checking(row): return row
        }
    }

    public var isRecording: Bool { if case .recording = phase { return true } else { return false } }
    public var isChecking: Bool { if case .checking = phase { return true } else { return false } }

    /// A row's microphone is usable while idle, and for the row being recorded (the second tap sends it). Every other
    /// row, and every row while a recording is being checked, is disabled.
    public func micEnabled(row: Int) -> Bool {
        switch phase {
        case .idle: return true
        case let .recording(active): return active == row
        case .checking: return false
        }
    }

    /// "Hear" is off while a recording or a check is under way, so the speaker never talks over the microphone.
    public var hearEnabled: Bool { phase == .idle }

    /// The line under a row: "Listening...", "Checking...", or the row's result. Nil when the row has nothing to show.
    ///
    /// "Listening..." shows only once the voice engine is actually recording, never during the permission prompt.
    public func status(row: Int, voicePhase: VoicePhase = .recording(generation: 0)) -> String? {
        switch phase {
        case .recording(row):
            if case .recording = voicePhase { return PhraseSayCopy.listening }
            return nil
        case .checking(row): return PhraseSayCopy.checking
        default: break
        }
        return results[row].map(PhraseSayCopy.resultText)
    }

    /// The result line, or nil while the row is busy.
    public func resultLine(row: Int) -> String? {
        busyRow == row ? nil : results[row].map(PhraseSayCopy.resultText)
    }

    /// A tap on row `row`'s microphone. Starting clears that row's earlier result.
    public mutating func micTapped(row: Int) -> PhraseSayAction {
        switch phase {
        case .idle:
            results[row] = nil
            phase = .recording(row: row)
            return .startRecording(row: row)
        case let .recording(active):
            guard active == row else { return .ignore }
            phase = .checking(row: row)
            return .stopRecording
        case .checking:
            return .ignore
        }
    }

    /// The recording ended on its own (time limit): the same as the second tap.
    public mutating func recordingEnded() {
        if case let .recording(row) = phase { phase = .checking(row: row) }
    }

    /// The transcript for the row's phrase came back.
    public mutating func transcribed(expected: String, heard: String, words: [HeardWord]?) {
        guard let row = busyRow else { return }
        results[row] = PhraseChecker.check(expected: expected, heard: heard, words: words)
        phase = .idle
    }

    /// Nothing was heard (an empty capture): reads "Not understood yet".
    public mutating func heardNothing() {
        guard let row = busyRow else { return }
        results[row] = PhraseCheck(result: .notYet, listenAgain: [])
        phase = .idle
    }

    /// The voice engine moved. An interruption (a phone call, Siri) or a refused microphone sends it back to idle or
    /// failed WITHOUT a capture, so a row left recording or checking would keep every mic and Hear button disabled.
    /// Anything the engine is still doing (permission prompt, recording, transcribing, replying) leaves the row alone.
    public mutating func voiceChanged(to voicePhase: VoicePhase) {
        guard busyRow != nil else { return }
        switch voicePhase {
        case .idle, .failed: phase = .idle
        default: break
        }
    }

    /// The attempt failed (mic, upload, quota): no result is shown, and the existing error message takes the row.
    public mutating func failed() {
        phase = .idle
    }

    /// The screen left or the list changed: nothing in flight, nothing remembered.
    public mutating func reset() {
        phase = .idle
        results = [:]
    }
}
