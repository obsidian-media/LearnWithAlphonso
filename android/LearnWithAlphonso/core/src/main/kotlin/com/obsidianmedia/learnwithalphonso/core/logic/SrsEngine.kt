package com.obsidianmedia.learnwithalphonso.core.logic

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class ReviewGradeInput(
    val correct: Boolean,
    val ease: Double,
    val intervalDays: Int,
    val repetitions: Int,
    val lapses: Int,
    val elapsedDays: Int,
)

data class ReviewGradeResult(
    val retired: Boolean,
    val ease: Double,
    val intervalDays: Int,
    val repetitions: Int,
    val lapses: Int,
)

private const val MIN_EASE = 1.3
private const val MAX_EASE = 2.8
private const val EASE_STEP_DOWN = 0.2
private const val EASE_STEP_UP = 0.15
private const val RETIRE_AFTER_REPETITIONS = 4
private const val MAX_OVERDUE_GROWTH_BONUS = 1.5
private const val LAPSE_REPETITIONS_RETENTION = 0.5
private const val LAPSE_INTERVAL_RETENTION = 0.5

/**
 * Port of computeReviewGrade in src/lib/srs.ts. Keep in sync with the TS
 * source; SrsEngineTest carries the same vectors as srs.test.ts.
 *
 * JS Math.round rounds half up; Kotlin roundToInt rounds half away from
 * zero. Every value rounded here is positive, so the two agree.
 */
fun computeReviewGrade(input: ReviewGradeInput): ReviewGradeResult {
    val ease = if (input.correct) {
        min(MAX_EASE, input.ease + EASE_STEP_UP)
    } else {
        max(MIN_EASE, input.ease - EASE_STEP_DOWN)
    }

    if (!input.correct) {
        val repetitions = floor(input.repetitions * LAPSE_REPETITIONS_RETENTION).toInt()
        val intervalDays = max(1, (input.intervalDays * LAPSE_INTERVAL_RETENTION).roundToInt())
        return ReviewGradeResult(
            retired = false,
            ease = ease,
            intervalDays = intervalDays,
            repetitions = repetitions,
            lapses = input.lapses + 1,
        )
    }

    val repetitions = input.repetitions + 1
    if (repetitions >= RETIRE_AFTER_REPETITIONS) {
        return ReviewGradeResult(true, ease, input.intervalDays, repetitions, input.lapses)
    }
    if (repetitions == 1) return ReviewGradeResult(false, ease, 1, repetitions, input.lapses)
    if (repetitions == 2) return ReviewGradeResult(false, ease, 3, repetitions, input.lapses)

    val overdueBonus = if (input.intervalDays > 0) {
        min(MAX_OVERDUE_GROWTH_BONUS, max(1.0, input.elapsedDays.toDouble() / input.intervalDays))
    } else {
        1.0
    }
    val grown = (input.intervalDays * ease * overdueBonus).roundToInt()
    return ReviewGradeResult(false, ease, if (grown != 0) grown else 6, repetitions, input.lapses)
}

sealed interface ReviewOutcome {
    val dueOn: String

    data class Retired(override val dueOn: String) : ReviewOutcome

    data class Rescheduled(
        override val dueOn: String,
        val ease: Double,
        val intervalDays: Int,
        val repetitions: Int,
        val lapses: Int,
    ) : ReviewOutcome
}

/**
 * What the server's grade-review would answer, computed locally so the
 * offline review queue can show the same dueOn the server will store.
 * A wrong answer stays due today (Review Focus 2 in the plan).
 */
fun computeReviewOutcome(input: ReviewGradeInput, today: String, addDays: (Int) -> String): ReviewOutcome {
    val grade = computeReviewGrade(input)
    if (grade.retired) return ReviewOutcome.Retired(today)
    val dueOn = if (input.correct) addDays(grade.intervalDays) else today
    return ReviewOutcome.Rescheduled(dueOn, grade.ease, grade.intervalDays, grade.repetitions, grade.lapses)
}
