import Foundation

/// The Learn screen's climbing map ("Path B"), as data: one climb per unit, its lesson nodes (done / next / locked),
/// the reward chest that crowns it, the unit strip, the trailhead and the start sheet for the next lesson, and where
/// each node sits on the winding trail. No drawing here: web, iOS and Android draw the same climb from it.
///
/// Mirrors `learnMap` in src/lib/learn-map.ts and LearnMap in the Android core. All three replay shared/learn-map.json.
public enum LearnMap {
    /// A lesson as the map needs it, built from the curriculum lesson. `subtitle` is the one-line coverage.
    public struct Lesson: Equatable, Sendable {
        public let id: String
        public let title: String
        public let subtitle: String
        public let questionTypes: [String]
        public let wordCount: Int

        public init(id: String, title: String, subtitle: String, questionTypes: [String], wordCount: Int) {
            self.id = id
            self.title = title
            self.subtitle = subtitle
            self.questionTypes = questionTypes
            self.wordCount = wordCount
        }
    }

    /// A unit of the level on screen, in curriculum order.
    public struct Unit: Equatable, Sendable {
        public let id: String
        public let title: String
        public let lessons: [Lesson]

        public init(id: String, title: String, lessons: [Lesson]) {
            self.id = id
            self.title = title
            self.lessons = lessons
        }
    }

    /// A spot on the climb, as fractions of the map's width (x, from the left) and height (y, from the top).
    public struct Point: Equatable, Sendable {
        public let x: Double
        public let y: Double
    }

    public struct Node: Equatable, Sendable {
        public let id: String
        public let title: String
        public let state: UnitPathState
        public let point: Point
    }

    /// The unit's reward chest, the top of the climb: earned once every lesson of the unit is done.
    public struct Chest: Equatable, Sendable {
        public let earned: Bool
        public let point: Point
    }

    /// Where the climb starts: the plain trailhead, or (once a unit is finished) its earned chest at the foot of the
    /// next unit's climb.
    public enum Trailhead: Equatable, Sendable {
        case start
        case earnedChest(unitID: String)
    }

    /// "Unit N · name" with "done/total" and a thin progress bar. N is the unit's place in the level.
    public struct Strip: Equatable, Sendable {
        public let number: Int
        public let count: Int
        public let name: String
        public let done: Int
        public let total: Int
        public let progress: Double
    }

    /// The start sheet for the next lesson: name, one-line coverage, and its time / XP / word chips.
    public struct StartSheet: Equatable, Sendable {
        public let lessonID: String
        public let title: String
        public let coverage: String
        public let minutes: Int
        public let xp: Int
        public let words: Int
    }

    public struct Climb: Equatable, Sendable {
        public let unitID: String
        public let strip: Strip
        /// Bottom of the climb first.
        public let nodes: [Node]
        public let chest: Chest
        public let trailhead: Trailhead
        /// nil when the unit is finished.
        public let next: StartSheet?
    }

    public static let trailBottom = 0.9
    public static let trailTop = 0.06
    /// The winding: lesson nodes swing left, centre, right, centre, and the chest sits in the middle at the top.
    public static let trailSwing = [0.36, 0.5, 0.64, 0.5]
    public static let chestX = 0.5

    /// Where slot `index` of a climb with `slots` slots sits (the lessons, bottom first, then the chest last).
    public static func point(index: Int, slots: Int) -> Point {
        // Measured down from the top, so the chest (the last slot) sits at exactly trailTop on every platform.
        let y = slots <= 1
            ? trailTop
            : trailTop + (trailBottom - trailTop) * Double(slots - 1 - index) / Double(slots - 1)
        let x = index == slots - 1 ? chestX : trailSwing[index % trailSwing.count]
        return Point(x: x, y: y)
    }

    private static func isDone(_ unit: Unit, _ completed: Set<String>) -> Bool {
        unit.lessons.allSatisfy { completed.contains($0.id) }
    }

    /// The climb for one unit of the level. Without `unitID` it is the learner's current unit: the first with a lesson
    /// not done, or the last unit when the whole level is done. nil for a level with no units (or an unknown unitID).
    ///
    /// A unit with no lessons is never a climb, a current unit or a trailhead: there is nothing to climb and no chest to
    /// earn. It is skipped as if done, the same as `LearnFold.currentUnitOf`, which looks for the first lesson not done
    /// and so passes over it. It still counts in the strip's "Unit N of M", which numbers every unit of the level.
    public static func climb(units: [Unit], completed: Set<String>, timing: LessonTiming, unitID: String? = nil) -> Climb? {
        let found: Int?
        if let unitID {
            found = units.firstIndex { $0.id == unitID }
        } else {
            found = units.firstIndex { !$0.lessons.isEmpty && !isDone($0, completed) }
                ?? units.lastIndex { !$0.lessons.isEmpty }
        }
        guard let index = found, !units[index].lessons.isEmpty else { return nil }
        let unit = units[index]
        let slots = unit.lessons.count + 1
        let nextIndex = unit.lessons.firstIndex { !completed.contains($0.id) }
        let nodes = unit.lessons.enumerated().map { i, lesson in
            Node(
                id: lesson.id,
                title: lesson.title,
                state: completed.contains(lesson.id) ? .done : (i == nextIndex ? .next : .locked),
                point: point(index: i, slots: slots)
            )
        }
        let done = unit.lessons.filter { completed.contains($0.id) }.count
        let total = unit.lessons.count
        // The trailhead looks back past empty units to the last unit that had a climb.
        let previous = units[..<index].last { !$0.lessons.isEmpty }
        let next = nextIndex.map { unit.lessons[$0] }.map { lesson in
            StartSheet(
                lessonID: lesson.id,
                title: lesson.title,
                coverage: lesson.subtitle,
                minutes: timing.estimateMinutes(questionTypes: lesson.questionTypes, newWords: lesson.wordCount),
                xp: LessonXP.maxXp(total: lesson.questionTypes.count),
                words: lesson.wordCount
            )
        }
        return Climb(
            unitID: unit.id,
            strip: Strip(
                number: index + 1, count: units.count, name: unit.title, done: done, total: total,
                progress: total == 0 ? 0 : Double(done) / Double(total)
            ),
            nodes: nodes,
            chest: Chest(earned: done == total, point: point(index: slots - 1, slots: slots)),
            trailhead: previous.map { isDone($0, completed) ? Trailhead.earnedChest(unitID: $0.id) : Trailhead.start } ?? .start,
            next: next
        )
    }
}
