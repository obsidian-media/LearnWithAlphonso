import Foundation

// The lesson flow's rules (visual round 6, part 2). Ports of the web's src/lib/lesson-xp.ts, lesson-time.ts,
// lesson-stage.ts and confetti.ts; LessonFlowTests uses the same vectors. Android keeps the same rules in
// core/logic/LessonFlow.kt.

// MARK: - XP

/// What the app knows about the learner's earlier tries of this lesson when it opens.
public enum LessonPreviousBest: Equatable, Sendable {
    /// Never completed: every right answer pays.
    case firstTry
    /// Completed before with this many right answers (the server's lesson_completions row).
    case best(Int)
    /// Not known (offline when the lesson opened): no XP is promised per answer.
    case unknown
}

/// The lesson's XP as the learner sees it, from the server's own formula (computeXpGain, paid by the replay rule).
public enum LessonXP {
    public static let perRightAnswer = 10
    public static let perfectBonus = 20

    /// The most a lesson of `total` questions can pay: every answer right, perfect bonus included.
    public static func maxXp(total: Int) -> Int {
        computeXpGain(correct: total, total: total)
    }

    /// The verdict's "+N XP" for a right answer, or nil for none. `rightSoFar` counts this answer. A replay pays
    /// only what improves on the best earlier score, so a right answer shows XP only once the learner is past it:
    /// the chips never promise XP the server will not pay.
    public static func answerChip(rightSoFar: Int, previousBest: LessonPreviousBest) -> Int? {
        switch previousBest {
        case .firstTry: return perRightAnswer
        case .best(let best): return rightSoFar > best ? perRightAnswer : nil
        case .unknown: return nil
        }
    }

    public struct Line: Equatable, Sendable {
        public enum Kind: String, Sendable { case answers, perfect, earlier, regraded }
        public let kind: Kind
        public let label: String
        public let xp: Int

        public init(kind: Kind, label: String, xp: Int) {
            self.kind = kind
            self.label = label
            self.xp = xp
        }

        /// "Perfect lesson +20", "Already earned on an earlier try −60" (a true minus sign).
        public var text: String { "\(label) \(xp < 0 ? "\u{2212}" : "+")\(abs(xp))" }
    }

    /// The complete screen's XP lines for `correct` of `total` (the server's count), given what it `awarded`. They
    /// always add up to the award: the only gap between the formula and the award is the replay rule.
    public static func breakdown(correct: Int, total: Int, awarded: Int) -> [Line] {
        var lines = [Line(kind: .answers, label: "\(correct) right answer\(correct == 1 ? "" : "s")", xp: correct * perRightAnswer)]
        if total > 0 && correct == total {
            lines.append(Line(kind: .perfect, label: "Perfect lesson", xp: perfectBonus))
        }
        let formula = lines.reduce(0) { $0 + $1.xp }
        if awarded < formula {
            lines.append(Line(kind: .earlier, label: "Already earned on an earlier try", xp: awarded - formula))
        }
        if awarded > formula {
            lines.append(Line(kind: .regraded, label: "Topped up to your best score", xp: awarded - formula))
        }
        return lines
    }
}

/// The last question's Finish completes the lesson once. A second tap while the completion is in flight would be a
/// zero-XP replay, and whichever answer landed last would set the screen.
public struct FinishGate: Sendable {
    public private(set) var started = false

    public init() {}

    /// True the first time only.
    public mutating func begin() -> Bool {
        if started { return false }
        started = true
        return true
    }

    /// For the next lesson in the same player.
    public mutating func reset() { started = false }
}

// MARK: - Time

/// How long a lesson takes, for lesson start's honest "About N min": the bundled copy of src/data/lesson-timing.json.
public struct LessonTiming: Decodable, Sendable {
    public let secondsPerQuestion: [String: Int]
    public let secondsPerNewWord: Int

    public static func bundled() throws -> LessonTiming {
        guard let url = Bundle.module.url(forResource: "lesson-timing", withExtension: "json") else {
            throw ContentStoreError.resourceNotFound("lesson-timing")
        }
        return try JSONDecoder().decode(LessonTiming.self, from: Data(contentsOf: url))
    }

    /// Whole minutes, rounded up, at least 1.
    public func estimateMinutes(questionTypes: [String], newWords: Int) -> Int {
        let seconds = questionTypes.reduce(0) { $0 + (secondsPerQuestion[$1] ?? 0) } + newWords * secondsPerNewWord
        return max(1, Int((Double(seconds) / 60).rounded(.up)))
    }
}

extension Question {
    /// The curriculum's type name ("mc", "fill"...), the key lesson-timing.json uses.
    public var typeKey: String {
        switch self {
        case .multipleChoice: return "mc"
        case .fillInBlank: return "fill"
        case .reorder: return "reorder"
        case .listening: return "listening"
        case .speak: return "speak"
        case .translate: return "translate"
        }
    }

    /// The one-line why, shown in the verdict sheet.
    public var explanationText: String {
        switch self {
        case .multipleChoice(let q): return q.explanation
        case .fillInBlank(let q): return q.explanation
        case .reorder(let q): return q.explanation
        case .listening(let q): return q.explanation
        case .speak(let q): return q.explanation
        case .translate(let q): return q.explanation
        }
    }

    public var prompt: String {
        switch self {
        case .multipleChoice(let q): return q.prompt
        case .fillInBlank(let q): return q.prompt
        case .reorder(let q): return q.prompt
        case .listening(let q): return q.prompt
        case .speak(let q): return q.prompt
        case .translate(let q): return q.prompt
        }
    }
}

/// Elapsed time that stops while paused (the app in the background). Times are passed in, so it is testable.
public struct ActiveTimer: Sendable {
    private var total: TimeInterval = 0
    private var since: TimeInterval?

    public init(now: TimeInterval) { since = now }

    public mutating func pause(now: TimeInterval) {
        guard let since else { return }
        total += now - since
        self.since = nil
    }

    public mutating func resume(now: TimeInterval) {
        if since == nil { since = now }
    }

    public func elapsed(now: TimeInterval) -> TimeInterval {
        total + (since.map { now - $0 } ?? 0)
    }
}

/// m:ss, minutes unbounded.
public func formatElapsed(_ seconds: TimeInterval) -> String {
    let s = max(0, Int(seconds.rounded()))
    return "\(s / 60):" + String(format: "%02d", s % 60)
}

// MARK: - Stage

/// Alphonso's five expressions, cut from the realistic kit with identical framing so a swap is a crossfade.
public enum LessonExpression: String, CaseIterable, Sendable {
    case talk, neutral, happy, hmm, wow

    /// VoiceOver's name for him, when he is not decorative.
    public var accessibilityLabel: String {
        switch self {
        case .talk: return "Alphonso, talking"
        case .neutral: return "Alphonso, listening"
        case .happy: return "Alphonso, smiling"
        case .hmm: return "Alphonso, thinking"
        case .wow: return "Alphonso, amazed"
        }
    }
}

public enum LessonStage {
    /// Alphonso's study by day: the room for a unit the map does not know.
    public static let fallbackRoom = "room-light"
    /// Below this height (pt) the phone counts as small.
    public static let smallPhoneHeight: Double = 700
    /// The HUD's bottom edge in the room (16 from the top, 40 tall). Alphonso's ears must stay below it.
    public static let hudBottom: Double = 56
    /// How far Alphonso sinks below the room's foot, so the bubble cuts him off at the robe.
    public static let alphonsoSink: Double = 14
    /// His ear tips, as a share of the square art's height from its top (5 px of 640).
    public static let earTop: Double = 5.0 / 640
    /// A prompt longer than this runs past two lines of the bubble.
    public static let longPromptChars = 60

    public static func roomID(forUnit unitID: String?, map: UnitRoomMap?) -> String {
        guard let unitID, let room = map?.roomID(forUnit: unitID) else { return fallbackRoom }
        return room
    }

    /// He asks; he listens once you pick; he smiles when you are right and goes "hmm" when you are not.
    /// `verdict` is nil before Check, else whether the answer was right.
    public static func expression(picked: Bool, verdict: Bool?) -> LessonExpression {
        switch verdict {
        case true?: return .happy
        case false?: return .hmm
        case nil: return picked ? .neutral : .talk
        }
    }

    public struct RoomLayout: Equatable, Sendable {
        public enum Size: Sendable { case full, long, small }
        public let size: Size
        public let roomHeight: Double
        public let alphonsoWidth: Double

        public init(size: Size, roomHeight: Double, alphonsoWidth: Double) {
            self.size = size
            self.roomHeight = roomHeight
            self.alphonsoWidth = alphonsoWidth
        }
    }

    /// 380 with Alphonso 315 wide; 300 and 255 when the question runs past two lines; 248 and 205 on a phone under
    /// 700 tall. The same sizes as the web.
    public static func layout(viewportHeight: Double, prompt: String) -> RoomLayout {
        if viewportHeight > 0 && viewportHeight < smallPhoneHeight {
            return RoomLayout(size: .small, roomHeight: 248, alphonsoWidth: 205)
        }
        if prompt.count > longPromptChars { return RoomLayout(size: .long, roomHeight: 300, alphonsoWidth: 255) }
        return RoomLayout(size: .full, roomHeight: 380, alphonsoWidth: 315)
    }
}

/// An answer button's state: picked, right, wrong, or dimmed once the verdict is in.
public enum LessonAnswerState: Equatable, Sendable {
    case idle, selected, correct, incorrect, dimmed

    public static func of(checked: Bool, isPicked: Bool, isRight: Bool) -> LessonAnswerState {
        if checked && isRight { return .correct }
        if checked && isPicked { return .incorrect }
        if checked { return .dimmed }
        return isPicked ? .selected : .idle
    }
}

// MARK: - Confetti

/// The lesson-complete confetti, drawn in code: about 90 rectangles and stars burst from two points under the
/// title and fall; under Reduce Motion they are a still scatter. Deterministic for a seed, with the web's numbers.
public enum Confetti {
    /// The robe's colours only, as design-system colour names.
    public enum Color: CaseIterable, Sendable { case xp, onHeroKick, brand, choice, card, xpEdge }

    public struct Piece: Equatable, Sendable {
        public let x0, vx, vy, rot, vr, w, h: Double
        public let color: Color
        public let star: Bool
        public let restX, restY: Double
    }

    /// How long one burst is drawn.
    public static let seconds: Double = 2.2
    private static let count = 90
    private static let gravity: Double = 420
    private static let startY: Double = 70

    public static func pieces(seed: Int, width: Double) -> [Piece] {
        var s = Int64(seed)
        func r() -> Double {
            s = (s * 16807) % 2_147_483_647
            return Double(s) / 2_147_483_647
        }
        return (0..<count).map { i in
            // The draw order matches the web's object literal, so the same seed gives the same pieces.
            let vx = (r() - 0.5) * 340
            let vy = -180 - r() * 260
            let rot = r() * .pi * 2
            let vr = (r() - 0.5) * 12
            let w = 5 + r() * 5
            let h = 8 + r() * 6
            let restX = r() * width
            let restY = 20 + r() * 300
            return Piece(
                x0: (i % 2 == 1 ? 0.28 : 0.72) * width, vx: vx, vy: vy, rot: rot, vr: vr, w: w, h: h,
                color: Color.allCases[i % Color.allCases.count], star: i % 9 == 0, restX: restX, restY: restY)
        }
    }

    /// Where a piece is `t` seconds into the burst.
    public static func position(of p: Piece, at t: Double) -> (x: Double, y: Double, angle: Double) {
        (p.x0 + p.vx * t, startY + p.vy * t + gravity * t * t, p.rot + p.vr * t)
    }
}
