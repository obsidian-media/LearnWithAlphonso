import Foundation

/// Direct port of src/lib/srs.ts -- pure SM-2-style grading, no I/O.
/// Keep this in sync with that file; a scheduling-rule change there must
/// be mirrored here. The original's own comment: "extracted from
/// review.functions.ts, so it can be unit tested without a database. The
/// handler still owns reading/writing rows and computing the actual due
/// date from intervalDays" -- same division of responsibility here:
/// nothing in this file touches Supabase or any persistence.
public struct ReviewGradeInput: Sendable {
    public let correct: Bool
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let lapses: Int
    /// See src/lib/srs.ts's ReviewGradeInput.elapsedDays doc comment -- keep
    /// this Swift port in sync with that file.
    public let elapsedDays: Int

    public init(correct: Bool, ease: Double, intervalDays: Int, repetitions: Int, lapses: Int, elapsedDays: Int) {
        self.correct = correct
        self.ease = ease
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.lapses = lapses
        self.elapsedDays = elapsedDays
    }
}

public struct ReviewGradeResult: Sendable {
    public let retired: Bool
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let lapses: Int
}

private let minEase = 1.3
private let maxEase = 2.8
private let easeStepDown = 0.2
private let easeStepUp = 0.15
private let retireAfterRepetitions = 4
private let maxOverdueGrowthBonus = 1.5
private let lapseRepetitionsRetention = 0.5

/// Wrong answer: halve (rather than zero out) repetitions and record a
/// lapse. Correct answer: grow the interval (1 day, then 3, then interval
/// * ease * overdue-bonus), and retire the item once it's been answered
/// correctly 4 times running.
public func computeReviewGrade(_ input: ReviewGradeInput) -> ReviewGradeResult {
    let ease = input.correct
        ? min(maxEase, input.ease + easeStepUp)
        : max(minEase, input.ease - easeStepDown)

    if !input.correct {
        let repetitions = Int(Double(input.repetitions) * lapseRepetitionsRetention)
        let intervalDays: Int
        if repetitions == 0 {
            intervalDays = 1
        } else if repetitions == 1 {
            intervalDays = 3
        } else {
            let grown = Int((Double(input.intervalDays) * ease).rounded())
            intervalDays = grown != 0 ? grown : 6
        }
        return ReviewGradeResult(retired: false, ease: ease, intervalDays: intervalDays, repetitions: repetitions, lapses: input.lapses + 1)
    }

    let repetitions = input.repetitions + 1
    if repetitions >= retireAfterRepetitions {
        return ReviewGradeResult(retired: true, ease: ease, intervalDays: input.intervalDays, repetitions: repetitions, lapses: input.lapses)
    }

    if repetitions == 1 {
        return ReviewGradeResult(retired: false, ease: ease, intervalDays: 1, repetitions: repetitions, lapses: input.lapses)
    }
    if repetitions == 2 {
        return ReviewGradeResult(retired: false, ease: ease, intervalDays: 3, repetitions: repetitions, lapses: input.lapses)
    }

    let overdueBonus: Double
    if input.intervalDays > 0 {
        overdueBonus = min(maxOverdueGrowthBonus, max(1, Double(input.elapsedDays) / Double(input.intervalDays)))
    } else {
        overdueBonus = 1
    }
    let grown = Int((Double(input.intervalDays) * ease * overdueBonus).rounded())
    let intervalDays = grown != 0 ? grown : 6
    return ReviewGradeResult(retired: false, ease: ease, intervalDays: intervalDays, repetitions: repetitions, lapses: input.lapses)
}

public struct ScheduledReview: Sendable {
    public let dueOn: String
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let lapses: Int
}

public enum ReviewOutcome: Sendable {
    case retired(dueOn: String)
    case rescheduled(ScheduledReview)
}

/// gradeReview's full decision (grade + due-date), extracted so the branch
/// between "retire" and "reschedule" is testable without a database.
/// `today` and `addDays` are injected rather than read from the system
/// clock directly -- same reasoning as the TypeScript original.
public func computeReviewOutcome(
    _ input: ReviewGradeInput,
    today: String,
    addDays: (Int) -> String
) -> ReviewOutcome {
    let grade = computeReviewGrade(input)
    if grade.retired {
        return .retired(dueOn: today)
    }
    let dueOn = input.correct ? addDays(grade.intervalDays) : today
    return .rescheduled(ScheduledReview(
        dueOn: dueOn,
        ease: grade.ease,
        intervalDays: grade.intervalDays,
        repetitions: grade.repetitions,
        lapses: grade.lapses
    ))
}
