package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.max

/**
 * The server's streak step, mirrored exactly (StreakRule.swift): `computeStreakUpdate` in
 * supabase/functions/complete-lesson/progress-math.ts and src/lib/progress-math.ts, and its SQL twin in
 * 20261114100000_local_days.sql. Every streak number the app shows (the Learn header, the profile, the widget) is derived
 * from this one function, so the app shows what the server will actually do.
 *
 * `gap` is the number of calendar days from the last active day to today:
 * - 0: same day, no change. A last active day in the future counts as today (the server never moves it back).
 * - 1: the next day, +1.
 * - 2 with `bridgeUtcDay` (the account's day_basis is still "utc"): the one-time bridge from UTC days to local days,
 *   +1, no freeze spent.
 * - 2 with a freeze: +1, one freeze spent.
 * - anything else: the run starts again at 1.
 * After that, a streak that grew to a multiple of 10 earns a freeze.
 */
object StreakRule {
    data class Outcome(val streak: Int, val longestStreak: Int, val freezes: Int, val spentFreeze: Boolean)

    fun next(streak: Int, longestStreak: Int, lastActiveDate: String?, today: String, freezes: Int, dayBasis: String?): Outcome {
        var next = streak
        var left = freezes
        var spent = false
        if (!lastActiveDate.isNullOrEmpty()) {
            val gap = dayGap(lastActiveDate, today) ?: Int.MAX_VALUE
            when {
                gap <= 0 -> Unit // Same day (or a skewed future day): no change.
                gap == 1 || (gap == 2 && bridgesUtcDay(dayBasis)) -> next = streak + 1
                gap == 2 && left > 0 -> {
                    next = streak + 1
                    left -= 1
                    spent = true
                }
                else -> next = 1
            }
        } else {
            next = 1
        }
        if (next > streak && next % 10 == 0) left += 1
        return Outcome(next, max(longestStreak, next), left, spent)
    }

    /** `streakBridge` (supabase/functions/_shared/local-day.ts): anything but "local" still counts UTC days, unread included. */
    fun bridgesUtcDay(dayBasis: String?): Boolean = dayBasis != "local"

    /** Whole calendar days between two "yyyy-MM-dd" days (negative when `to` is earlier); null when unreadable. */
    fun dayGap(from: String, to: String): Int? =
        runCatching { ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to)).toInt() }.getOrNull()
}

/**
 * The streak as it should read right now (StreakDisplay.swift). The `streak` column is only rewritten when the learner
 * next studies, so after missed days it still holds the old run. The answer is what the server would do with a lesson
 * today ([StreakRule]):
 * - it continues the run without a freeze: the streak as it is ([State.ACTIVE]);
 * - it continues the run only by spending a freeze: the streak, marked [State.PROTECTED];
 * - it would restart the run: 0 ([State.LAPSED]).
 */
object StreakDisplay {
    enum class State { ACTIVE, PROTECTED, LAPSED }

    data class Shown(val streak: Int, val state: State)

    /** `today` is the learner's local day, "yyyy-MM-dd" ([localDateString]). */
    fun shown(streak: Int, lastActiveDate: String?, streakFreezes: Int?, dayBasis: String?, today: String): Shown {
        if (streak <= 0 || lastActiveDate.isNullOrEmpty()) return Shown(max(0, streak), State.ACTIVE)
        if ((StreakRule.dayGap(lastActiveDate, today) ?: Int.MAX_VALUE) <= 0) return Shown(streak, State.ACTIVE)
        val outcome = StreakRule.next(streak, streak, lastActiveDate, today, max(0, streakFreezes ?: 0), dayBasis)
        if (outcome.streak != streak + 1) return Shown(0, State.LAPSED)
        return Shown(streak, if (outcome.spentFreeze) State.PROTECTED else State.ACTIVE)
    }

    fun shown(streak: Int, lastActiveDate: String?, streakFreezes: Int?, dayBasis: String?, nowMillis: Long, zone: ZoneId = ZoneId.systemDefault()): Shown =
        shown(streak, lastActiveDate, streakFreezes, dayBasis, localDateString(nowMillis, zone))

    fun shown(progress: com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress, nowMillis: Long, zone: ZoneId = ZoneId.systemDefault()): Shown =
        shown(progress.streak, progress.lastActiveDate, progress.streakFreezes, progress.dayBasis, nowMillis, zone)

    /** The header pill's (and the profile tile's) TalkBack label. */
    fun accessibilityLabel(shown: Shown): String =
        if (shown.state == State.PROTECTED) "${shown.streak}-day streak, protected by a streak freeze"
        else "Streak: ${shown.streak} day${if (shown.streak == 1) "" else "s"}"

    /** The widget's and the profile's line while the streak is protected. */
    const val PROTECTED_CAPTION = "Protected by a streak freeze"
}
