import Foundation

public enum AvatarBrows: String, CaseIterable, Sendable {
    case neutral, raised, lowered
}

/// One mouth shape held from `start` to `end` (seconds from the start of the spoken reply).
public struct AvatarMouthCue: Equatable, Sendable {
    public let start: TimeInterval
    public let end: TimeInterval
    public let viseme: AvatarViseme
}

/// A stretch of the reply with the brows raised.
public struct AvatarBrowSpan: Equatable, Sendable {
    public let start: TimeInterval
    public let end: TimeInterval
}

/// When each mouth shape and brow position happens during one spoken reply. Built once, from the reply's text and
/// the length of its audio, then read with the audio player's current time. Pure and deterministic.
public struct AvatarLipSyncPlan: Equatable, Sendable {
    public let cues: [AvatarMouthCue]
    public let raisedBrows: [AvatarBrowSpan]
    public static let empty = AvatarLipSyncPlan(cues: [], raisedBrows: [])

    /// The mouth at `time`. Closed outside the plan, so a player that has not started or has finished shows a
    /// closed mouth.
    public func viseme(at time: TimeInterval) -> AvatarViseme {
        guard let first = cues.first, let last = cues.last, time >= first.start, time < last.end else {
            return .closed
        }
        var low = 0, high = cues.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if cues[mid].start <= time { low = mid } else { high = mid - 1 }
        }
        return cues[low].viseme
    }

    public func brows(at time: TimeInterval) -> AvatarBrows {
        raisedBrows.contains { time >= $0.start && time < $0.end } ? .raised : .neutral
    }
}

public enum AvatarLipSync {
    /// A shape is held at least this long (except when a word itself is shorter), so the mouth never flickers.
    public static let minimumHold: TimeInterval = 0.07
    /// How long the brows stay up at the start of a greeting, at most.
    public static let greetingBrowHold: TimeInterval = 0.6

    private static let greetings: Set<String> = [
        "hello", "hi", "hey", "hola", "bonjour", "salut", "bonsoir", "buenas", "buenos",
    ]
    private static let closers: Set<Character> = ["\"", "'", "\u{201D}", "\u{2019}", ")", "]", "\u{00BB}"]

    private struct Word {
        let letters: Int
        let shapes: [AvatarViseme]
        /// Pause after the word, in letter units (0 for the last word).
        let gapUnits: Double
        let endsSentence: Bool
        let endsQuestion: Bool
        let isGreeting: Bool
    }

    /// Spreads the reply's words over `duration` seconds in proportion to their letters, with a one-letter gap
    /// between words, a longer one after a comma, a longer still after a full stop. The mouth closes in the gaps.
    public static func plan(text: String, course: Course, duration: TimeInterval) -> AvatarLipSyncPlan {
        guard duration > 0 else { return .empty }
        let tokens = text.components(separatedBy: .whitespacesAndNewlines)
        var words: [Word] = []
        for (index, token) in tokens.enumerated() {
            let letters = token.filter { $0.isLetter }.count
            guard letters > 0 else { continue }
            var trimmed = Substring(token)
            while let last = trimmed.last, closers.contains(last) { trimmed = trimmed.dropLast() }
            let end = trimmed.last
            let hasMoreWords = tokens[(index + 1)...].contains { $0.contains { $0.isLetter } }
            var gap = 0.0
            if hasMoreWords {
                gap = 1
                if let end, ",;:".contains(end) { gap += 3 }
                if let end, ".!?\u{2026}".contains(end) { gap += 5 }
            }
            let bare = token.lowercased().filter { $0.isLetter }
            words.append(Word(
                letters: letters,
                shapes: AvatarVisemes.sequence(for: token, course: course),
                gapUnits: gap,
                endsSentence: !hasMoreWords || (end.map { ".!?\u{2026}".contains($0) } ?? false),
                endsQuestion: end == "?",
                isGreeting: words.isEmpty && greetings.contains(bare)))
        }
        guard !words.isEmpty else { return .empty }

        let totalUnits = words.reduce(0.0) { $0 + Double($1.letters) + $1.gapUnits }
        let unit = duration / totalUnits

        var cues: [AvatarMouthCue] = []
        func append(_ start: TimeInterval, _ end: TimeInterval, _ shape: AvatarViseme) {
            guard end > start else { return }
            if let last = cues.last, last.viseme == shape {
                cues[cues.count - 1] = AvatarMouthCue(start: last.start, end: end, viseme: shape)
            } else {
                cues.append(AvatarMouthCue(start: start, end: end, viseme: shape))
            }
        }

        var t = 0.0
        var wordTimes: [(start: TimeInterval, end: TimeInterval)] = []
        for (i, word) in words.enumerated() {
            let wordStart = t
            let isLast = i == words.count - 1
            let wordEnd = isLast ? duration : t + Double(word.letters) * unit
            let picked = thin(word.shapes, wordDuration: wordEnd - wordStart)
            if picked.isEmpty {
                append(wordStart, wordEnd, .closed)
            } else {
                let each = (wordEnd - wordStart) / Double(picked.count)
                var cursor = wordStart
                for (k, shape) in picked.enumerated() {
                    let shapeEnd = k == picked.count - 1 ? wordEnd : cursor + each
                    append(cursor, shapeEnd, shape)
                    cursor = shapeEnd
                }
            }
            wordTimes.append((wordStart, wordEnd))
            t = wordEnd
            if !isLast {
                let gapEnd = t + word.gapUnits * unit
                append(t, gapEnd, .closed)
                t = gapEnd
            }
        }

        var raised: [AvatarBrowSpan] = []
        if words[0].isGreeting {
            raised.append(AvatarBrowSpan(start: 0, end: min(greetingBrowHold, duration * 0.25)))
        }
        for (i, word) in words.enumerated() where word.endsQuestion {
            // The last (up to) three words of the question sentence.
            var first = i
            while first > 0, i - first < 2, !words[first - 1].endsSentence { first -= 1 }
            raised.append(AvatarBrowSpan(start: wordTimes[first].start, end: wordTimes[i].end))
        }
        return AvatarLipSyncPlan(cues: cues, raisedBrows: raised)
    }

    /// Keeps evenly spaced shapes so each is held at least `minimumHold` where the word allows.
    private static func thin(_ shapes: [AvatarViseme], wordDuration: TimeInterval) -> [AvatarViseme] {
        let allowed = max(1, Int((wordDuration / minimumHold + 1e-9).rounded(.down)))
        guard shapes.count > allowed else { return shapes }
        return (0..<allowed).map { shapes[$0 * shapes.count / allowed] }
    }
}
