package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Ports of NotificationLogic.swift and nextWeeklyRecapDate in
 * LeaderboardEngagement.swift. "Today" for the streak check is the UTC
 * calendar date (the server's convention); the fire times are local.
 */

private fun at(nowMillis: Long, zone: ZoneId, hour: Int): ZonedDateTime =
    ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zone).withHour(hour).withMinute(0).withSecond(0).withNano(0)

/** Null when the user already studied today; else the next 20:00 local. */
fun nextStreakReminderMillis(lastActiveDate: String?, nowMillis: Long, zone: ZoneId): Long? {
    if (lastActiveDate == utcDateString(nowMillis)) return null
    val todayAt8pm = at(nowMillis, zone, 20)
    val now = Instant.ofEpochMilli(nowMillis)
    return if (now.isBefore(todayAt8pm.toInstant())) todayAt8pm.toInstant().toEpochMilli() else todayAt8pm.plusDays(1).toInstant().toEpochMilli()
}

fun dueReviewCount(items: List<ReviewItem>, today: String): Int = items.count { it.dueOn <= today }

fun weaknessPracticeNudgeCopy(openCategories: List<String>): Pair<String, String>? {
    val top = openCategories.firstOrNull() ?: return null
    return "A quick practice moment" to "You've got a ${top.replace("-", " ")} question waiting in your review queue."
}

/** The next 10:00 local; tomorrow when now is at or past 10:00. */
fun nextWeaknessPracticeNudgeMillis(nowMillis: Long, zone: ZoneId): Long {
    val todayAt10 = at(nowMillis, zone, 10)
    return if (Instant.ofEpochMilli(nowMillis).isBefore(todayAt10.toInstant())) todayAt10.toInstant().toEpochMilli() else todayAt10.plusDays(1).toInstant().toEpochMilli()
}

/** The next Monday at [hour] local; a Monday already past the hour means next week's. */
fun nextWeeklyRecapMillis(nowMillis: Long, hour: Int = 9, zone: ZoneId): Long {
    val now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zone)
    val isMonday = now.dayOfWeek == DayOfWeek.MONDAY
    val todayAtHour = at(nowMillis, zone, hour)
    if (isMonday && now.isBefore(todayAtHour)) return todayAtHour.toInstant().toEpochMilli()
    val daysUntilNextMonday = if (isMonday) 7 else (DayOfWeek.MONDAY.value - now.dayOfWeek.value + 7) % 7
    return todayAtHour.plusDays(daysUntilNextMonday.toLong()).toInstant().toEpochMilli()
}

enum class ReminderKind(val id: String) {
    STREAK("streak-reminder"),
    DUE_REVIEW("due-review-nudge"),
    WEEKLY_RECAP("weekly-recap"),
    WEAKNESS("weakness-practice-nudge"),
}

data class ReminderPlan(val kind: ReminderKind, val title: String, val body: String, val fireAtMillis: Long)

/** The four notification kinds NotificationScheduler.swift schedules; null means cancel that kind. */
object ReminderPlans {
    fun streak(lastActiveDate: String?, nowMillis: Long, zone: ZoneId): ReminderPlan? {
        val fireAt = nextStreakReminderMillis(lastActiveDate, nowMillis, zone) ?: return null
        return ReminderPlan(ReminderKind.STREAK, "Keep your streak alive", "You haven't studied today yet -- a quick lesson keeps it going.", fireAt)
    }

    /** Three hours out, so it does not fire the instant the queue loads while the app is open. */
    fun dueReview(items: List<ReviewItem>, nowMillis: Long): ReminderPlan? {
        val count = dueReviewCount(items, utcDateString(nowMillis))
        if (count == 0) return null
        val body = if (count == 1) "1 item is due for review." else "$count items are due for review."
        return ReminderPlan(ReminderKind.DUE_REVIEW, "Reviews are waiting", body, nowMillis + 3 * 60 * 60 * 1000L)
    }

    fun weeklyRecap(nowMillis: Long, zone: ZoneId): ReminderPlan =
        ReminderPlan(ReminderKind.WEEKLY_RECAP, "Your weekly recap is ready", "See how you did on the leaderboard last week.", nextWeeklyRecapMillis(nowMillis, 9, zone))

    fun weakness(openCategories: List<String>, nowMillis: Long, zone: ZoneId): ReminderPlan? {
        val (title, body) = weaknessPracticeNudgeCopy(openCategories) ?: return null
        return ReminderPlan(ReminderKind.WEAKNESS, title, body, nextWeaknessPracticeNudgeMillis(nowMillis, zone))
    }
}
