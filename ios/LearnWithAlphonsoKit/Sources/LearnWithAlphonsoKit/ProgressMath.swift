import Foundation

/// Direct port of src/lib/progress-math.ts -- pure XP/streak/league math and
/// the lesson-completion trust-boundary check, extracted so it's testable
/// without a database and, here, without a TanStack Start server function
/// either. Keep this in sync with that file.

public func computeXpGain(correct: Int, total: Int) -> Int {
    correct * 10 + (correct == total ? 20 : 0)
}

private let isoDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
}()

/// Matches the TypeScript original's `new Date(b).getTime() -
/// new Date(a).getTime()` on date-only ISO strings, which JS parses as UTC
/// midnight -- using a fixed UTC formatter here avoids the off-by-one bugs
/// a locale/device-timezone-dependent parse would introduce.
private func daysDiff(_ a: String, _ b: String) -> Int {
    guard let dateA = isoDateFormatter.date(from: a), let dateB = isoDateFormatter.date(from: b) else {
        return 0
    }
    let seconds = dateB.timeIntervalSince(dateA)
    return Int((seconds / (60 * 60 * 24)).rounded())
}

public struct StreakInput: Sendable {
    public let lastActiveDate: String?
    public let today: String
    public let streak: Int
    public let longestStreak: Int
    public let freezes: Int

    public init(lastActiveDate: String?, today: String, streak: Int, longestStreak: Int, freezes: Int) {
        self.lastActiveDate = lastActiveDate
        self.today = today
        self.streak = streak
        self.longestStreak = longestStreak
        self.freezes = freezes
    }
}

public struct StreakResult: Sendable, Equatable {
    public let streak: Int
    public let longestStreak: Int
    public let freezes: Int
}

/// Same-day: no change. First-ever activity: streak starts at 1. A
/// one-day gap continues the streak; a two-day gap continues it only by
/// spending a streak freeze; anything wider resets to 1. Every 10th streak
/// day earns back one freeze.
public func computeStreakUpdate(_ input: StreakInput) -> StreakResult {
    var streak = input.streak
    var freezes = input.freezes

    if input.lastActiveDate == input.today {
        // same day, no change
    } else if input.lastActiveDate == nil {
        streak = 1
    } else {
        let diff = daysDiff(input.lastActiveDate!, input.today)
        if diff == 1 {
            streak = input.streak + 1
        } else if diff == 2 && freezes > 0 {
            streak = input.streak + 1
            freezes -= 1
        } else {
            streak = 1
        }
    }

    if streak > input.streak && streak % 10 == 0 {
        freezes += 1
    }

    return StreakResult(streak: streak, longestStreak: max(input.longestStreak, streak), freezes: freezes)
}

public let LEAGUES = ["bronze", "silver", "sapphire", "ruby", "diamond"]
public let LEAGUE_THRESHOLDS = [0, 300, 1000, 3000, 8000]

public struct LeaguePromotion: Sendable, Equatable {
    public let leagueTier: String
    public let newIdx: Int
}

/// A league is never demoted -- newIdx is always >= oldIdx.
public func computeLeaguePromotion(xp: Int, oldIdx: Int) -> LeaguePromotion {
    var newIdx = oldIdx
    for i in stride(from: LEAGUES.count - 1, through: 0, by: -1) {
        if xp >= LEAGUE_THRESHOLDS[i] {
            newIdx = max(oldIdx, i)
            break
        }
    }
    return LeaguePromotion(leagueTier: LEAGUES[newIdx], newIdx: newIdx)
}

public struct LessonCompletionShape: Sendable {
    public let questionIds: [String]

    public init(questionIds: [String]) {
        self.questionIds = questionIds
    }
}

public struct LessonCompletion: Sendable, Equatable {
    public let correct: Int
}

public enum LessonCompletionError: Error, Equatable {
    case invalidPayload
}

/// The trust-boundary check for lesson completion, extracted so it's
/// testable without a database: `total` must match the lesson's real
/// question count, and every claimed-missed question id must actually
/// belong to this lesson. `correct` is derived, never trusted directly.
/// Throws on any mismatch -- the caller should let that reject the request.
/// This is exactly the check the design doc flags as needing a real
/// Supabase Edge Function equivalent on the native side (see "Data flow
/// changes vs. the web app" in
/// docs/superpowers/specs/2026-09-17-native-ios-app-design.md) -- this pure
/// function is the logic that Edge Function needs to run server-side; this
/// port itself does not (and must not) become the client-trusted source of
/// truth.
public func deriveLessonCompletion(
    lesson: LessonCompletionShape,
    total: Int,
    missedQuestionIds: [String]
) throws -> LessonCompletion {
    if total != lesson.questionIds.count {
        throw LessonCompletionError.invalidPayload
    }
    let realQuestionIds = Set(lesson.questionIds)
    let missedSet = Set(missedQuestionIds)
    if missedSet.count > total || missedSet.contains(where: { !realQuestionIds.contains($0) }) {
        throw LessonCompletionError.invalidPayload
    }
    return LessonCompletion(correct: total - missedSet.count)
}
