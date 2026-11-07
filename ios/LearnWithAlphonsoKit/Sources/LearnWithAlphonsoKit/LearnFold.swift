import Foundation

/// Learn screen folding (round 6.1, option A). Pure: the screen passes in a level's units and the completed set.
/// Mirrors src/lib/learn-fold.ts on the web and LearnFold in the Android core.
///
///  - done units fold into ONE slim row per unbroken run ("Units 1-9")
///  - the current unit (first with an undone lesson) is open
///  - units after it are folded with only their name
public struct FoldUnit: Equatable, Sendable {
    public let id: String
    public let eyebrow: String
    public let title: String
    public let lessonIDs: [String]

    public init(id: String, eyebrow: String, title: String, lessonIDs: [String]) {
        self.id = id
        self.eyebrow = eyebrow
        self.title = title
        self.lessonIDs = lessonIDs
    }
}

public enum FoldRow: Equatable, Sendable {
    public enum UnitState: String, Sendable { case current, ahead }

    case doneRun(key: String, unitIDs: [String], first: String, last: String, done: Int, total: Int)
    case unit(key: String, unitID: String, state: UnitState, done: Int, total: Int)

    public var key: String {
        switch self {
        case .doneRun(let key, _, _, _, _, _), .unit(let key, _, _, _, _): return key
        }
    }
}

public enum LearnFold {
    public static func foldLearn(_ units: [FoldUnit], completed: Set<String>) -> [FoldRow] {
        var rows: [FoldRow] = []
        var currentTaken = false
        for u in units {
            let done = u.lessonIDs.filter { completed.contains($0) }.count
            let total = u.lessonIDs.count
            let finished = total > 0 && done == total
            if finished {
                if case .doneRun(let key, let ids, let first, _, let d, let t)? = rows.last {
                    rows[rows.count - 1] = .doneRun(key: key, unitIDs: ids + [u.id], first: first, last: u.eyebrow, done: d + done, total: t + total)
                } else {
                    rows.append(.doneRun(key: "run-\(u.id)", unitIDs: [u.id], first: u.eyebrow, last: u.eyebrow, done: done, total: total))
                }
                continue
            }
            let state: FoldRow.UnitState = currentTaken ? .ahead : .current
            currentTaken = true
            rows.append(.unit(key: u.id, unitID: u.id, state: state, done: done, total: total))
        }
        return rows
    }

    /// "Unit 3" / "Units 1-9" label for a done run.
    public static func runLabel(first: String, last: String) -> String {
        func num(_ s: String) -> String {
            s.replacingOccurrences(of: "^Unit\\s+", with: "", options: [.regularExpression, .caseInsensitive])
        }
        return first == last ? first : "Units \(num(first))-\(num(last))"
    }

    public struct CurrentUnit: Equatable, Sendable {
        /// 1-based place in the course.
        public let index: Int
        public let count: Int
        public let unitID: String
        public let lessonID: String
    }

    /// The learner's place in the whole course: first lesson not done, with the unit's 1-based place of `count`.
    public static func currentUnitOf(_ units: [FoldUnit], completed: Set<String>) -> CurrentUnit? {
        for (i, u) in units.enumerated() {
            if let lessonID = u.lessonIDs.first(where: { !completed.contains($0) }) {
                return CurrentUnit(index: i + 1, count: units.count, unitID: u.id, lessonID: lessonID)
            }
        }
        return nil
    }

    /// Painted rooms, in a fixed order; a unit's room is its place in the course modulo the list.
    public static let roomArt: [String] = [
        "classroom", "market", "garden", "station", "kitchen", "seaside", "library", "radio", "office", "farm",
        "gallery", "gym", "lab", "newsroom", "theatre", "bank", "bedroom", "dining", "techshop", "courtroom", "chamber",
    ]

    public static func roomArtFor(_ unitIndex0: Int) -> String {
        let n = roomArt.count
        return roomArt[((unitIndex0 % n) + n) % n]
    }

    public static func roomName(_ art: String) -> String {
        let names = ["techshop": "Tech Shop", "newsroom": "Newsroom"]
        return names[art] ?? art.prefix(1).uppercased() + art.dropFirst()
    }

    /// Future rooms fold too: the current room is open, the NEXT room is one collapsed row, and every room after it
    /// hides behind a "Show all units" control. `hidden` is how many rooms that control reveals (same as limitAhead
    /// in src/lib/learn-fold.ts).
    public static func limitAhead(_ rows: [FoldRow], showAll: Bool) -> (rows: [FoldRow], hidden: Int) {
        if showAll { return (rows, 0) }
        var seenAhead = 0
        var hidden = 0
        var out: [FoldRow] = []
        for r in rows {
            if case .unit(_, _, let state, _, _) = r, state == .ahead {
                seenAhead += 1
                if seenAhead > 1 { hidden += 1; continue }
            }
            out.append(r)
        }
        return (out, hidden)
    }
}
