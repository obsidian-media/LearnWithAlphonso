package com.obsidianmedia.learnwithalphonso.core.goal

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * The wording of the learning-goal card. Kept in `:core` (not the Compose layer) so it is tested on the JVM, and
 * word for word the same as the web card (src/components/GoalCard.tsx) and iOS GoalCopy.swift: change all three
 * together. "Day" here is always a UTC day, like the rest of the app.
 */
object GoalCopy {
    const val ESTIMATE_NOTE = "An estimate of lessons, not of fluency."

    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    /**
     * "2026-11-10" -> "10 Nov 2026". A fixed English table (not the device locale) so it matches the web and iOS
     * cards exactly; anything that is not a real date comes back unchanged.
     */
    fun formatDate(iso: String): String {
        val date = parseDay(iso) ?: return iso
        return "${date.dayOfMonth} ${MONTHS[date.monthValue - 1]} ${date.year}"
    }

    fun headline(goal: StoredGoal): String = "Finish ${goal.targetLevel} by ${formatDate(goal.targetDate)}"

    fun progress(plan: GoalPlan): String = "${plan.lessonsInScope - plan.lessonsRemaining} of ${plan.lessonsInScope} lessons done"

    fun statusLine(status: GoalStatus): String = when (status) {
        GoalStatus.DONE -> "Goal reached."
        GoalStatus.EXPIRED -> "The date has passed. Pick a new date to keep going."
        GoalStatus.JUST_STARTED -> "Just started. Check back next week."
        GoalStatus.AHEAD -> "Ahead of plan."
        GoalStatus.ON_TRACK -> "On track."
        GoalStatus.BEHIND -> "Behind plan."
        GoalStatus.UNKNOWN -> "Keep going."
    }

    /** Null once the goal is reached or its date has passed: a weekly number would mean nothing. */
    fun weeklyLine(plan: GoalPlan): String? =
        if (plan.status == GoalStatus.DONE || plan.status == GoalStatus.EXPIRED) null
        else "${plan.requiredPerWeek} lessons a week to finish on time; ${plan.lessonsDoneLast7Days} in the last 7 days."

    data class PreviewLines(val perWeek: String, val left: String)

    /** The two lines shown under the date picker while setting a goal. */
    fun previewLines(plan: GoalPlan) = PreviewLines(
        perWeek = "${plan.requiredPerWeek} lessons a week",
        left = "${plan.lessonsRemaining} lessons left to finish ${plan.targetLevel}.",
    )

    /**
     * Shown whenever the server sent a suggested date (it only does when behind, expired, or unrealistic, and only
     * when there is a recent pace to extrapolate from).
     */
    fun suggestionLine(plan: GoalPlan): String? =
        plan.suggestedDate?.let { "At your recent pace, ${formatDate(it)} is realistic." }

    fun realismLine(plan: GoalPlan): String? = when (plan.realism) {
        GoalRealism.OK, GoalRealism.UNKNOWN -> null
        GoalRealism.AMBITIOUS -> "Ambitious: about two lessons a day or more."
        GoalRealism.UNREALISTIC -> "Unrealistic for most learners at this date."
    }

    /**
     * What to say when the goal could not be LOADED. "Showing your last saved plan" is only true when there is one:
     * offline with nothing cached must not promise a plan.
     */
    fun loadFailureMessage(error: LearningGoalError, hadCachedPlan: Boolean): String =
        if (error == LearningGoalError.Offline && !hadCachedPlan) "You're offline. Connect to load your goal." else error.userMessage

    /** What to say when SAVING or REMOVING failed: the plan on screen was not refreshed and nothing took effect. */
    fun actionFailureMessage(error: LearningGoalError): String =
        if (error == LearningGoalError.Offline) "You're offline. Try again when you're connected." else error.userMessage

    /** `months` ahead as "YYYY-MM-DD", clamped to the end of a shorter month (31 Aug + 6 months is 28 Feb). */
    fun monthsFromToday(months: Int, now: Instant = Instant.now()): String =
        now.atZone(ZoneOffset.UTC).toLocalDate().plusMonths(months.toLong()).toString()

    fun tomorrow(now: Instant = Instant.now()): String = now.atZone(ZoneOffset.UTC).toLocalDate().plusDays(1).toString()

    /** The UTC calendar day of [millis] as "YYYY-MM-DD" (what the server expects for a target date). */
    fun dayOf(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    /** Noon UTC on "YYYY-MM-DD", or null when it is not a real date. Noon, so a picker in any zone shows the same day. */
    fun millisOfDay(day: String): Long? =
        parseDay(day)?.atTime(12, 0)?.toInstant(ZoneOffset.UTC)?.toEpochMilli()

    private fun parseDay(iso: String): LocalDate? {
        if (!Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(iso)) return null
        return runCatching { LocalDate.parse(iso) }.getOrNull()
    }
}
