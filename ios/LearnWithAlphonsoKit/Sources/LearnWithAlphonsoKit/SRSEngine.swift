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

    public init(correct: Bool, ease: Double, intervalDays: Int, repetitions: Int, lapses: Int) {
        self.correct = correct
        self.ease = ease
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.lapses = lapses
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

/// Wrong answer: reset the item to the start and record a lapse. Correct
/// answer: grow the interval (1 day, then 3, then interval * ease), and
/// retire the item once it's been answered correctly 4 times running.
public func computeReviewGrade(_ input: ReviewGradeInput) -> ReviewGradeResult {
    if !input.correct {
        return ReviewGradeResult(
            retired: false,
            ease: max(minEase, input.ease - easeStepDown),
            intervalDays: 0,
            repetitions: 0,
            lapses: input.lapses + 1
        )
    }

    let repetitions = input.repetitions + 1
    let ease = min(maxEase, input.ease + easeStepUp)
    if repetitions >= retireAfterRepetitions {
        return ReviewGradeResult(retired: true, ease: ease, intervalDays: input.intervalDays, repetitions: repetitions, lapses: input.lapses)
    }

    let intervalDays: Int
    if repetitions == 1 {
        intervalDays = 1
    } else if repetitions == 2 {
        intervalDays = 3
    } else {
        let grown = Int((Double(input.intervalDays) * ease).rounded())
        intervalDays = grown != 0 ? grown : 6
    }
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
