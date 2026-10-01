package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId

/** Ported from NotificationLogicTests.swift and LeaderboardEngagementTests.swift (UTC calendar). */
class NotificationLogicTest {
    private val utc: ZoneId = ZoneId.of("UTC")
    private fun at(iso: String): Long = Instant.parse(iso).toEpochMilli()
    private fun item(dueOn: String) = ReviewItem("en:lesson-1:q1", "lesson-1", "A1", 2.3, 1, 1, dueOn)

    @Test
    fun `streak reminder is null when already active today, else the next 8pm`() {
        assertNull(nextStreakReminderMillis("2026-09-13", at("2026-09-13T10:00:00Z"), utc))
        assertEquals(at("2026-09-13T20:00:00Z"), nextStreakReminderMillis("2026-09-12", at("2026-09-13T10:00:00Z"), utc))
        assertEquals(at("2026-09-14T20:00:00Z"), nextStreakReminderMillis("2026-09-12", at("2026-09-13T21:00:00Z"), utc))
        assertEquals(at("2026-09-13T20:00:00Z"), nextStreakReminderMillis(null, at("2026-09-13T09:00:00Z"), utc))
        assertEquals(at("2026-09-14T20:00:00Z"), nextStreakReminderMillis("2026-09-12", at("2026-09-13T20:00:00Z"), utc), "exactly 8pm is already past")
    }

    @Test
    fun `due review count`() {
        assertEquals(2, dueReviewCount(listOf(item("2026-09-13"), item("2026-09-13")), "2026-09-13"))
        assertEquals(1, dueReviewCount(listOf(item("2026-09-10")), "2026-09-13"))
        assertEquals(0, dueReviewCount(listOf(item("2026-09-14")), "2026-09-13"))
        assertEquals(0, dueReviewCount(emptyList(), "2026-09-13"))
    }

    @Test
    fun `weakness copy names only the first category humanized`() {
        assertNull(weaknessPracticeNudgeCopy(emptyList()))
        val (title, body) = weaknessPracticeNudgeCopy(listOf("past-tense", "articles"))!!
        assertEquals("A quick practice moment", title)
        assertTrue(body.contains("past tense"))
        assertFalse(body.contains("articles"))
    }

    @Test
    fun `weakness nudge is the next 10am`() {
        assertEquals(at("2026-09-13T10:00:00Z"), nextWeaknessPracticeNudgeMillis(at("2026-09-13T08:00:00Z"), utc))
        assertEquals(at("2026-09-14T10:00:00Z"), nextWeaknessPracticeNudgeMillis(at("2026-09-13T15:00:00Z"), utc))
        assertEquals(at("2026-09-14T10:00:00Z"), nextWeaknessPracticeNudgeMillis(at("2026-09-13T10:00:00Z"), utc))
    }

    @Test
    fun `weekly recap is the next Monday 9am`() {
        assertEquals(at("2026-09-21T09:00:00Z"), nextWeeklyRecapMillis(at("2026-09-21T08:00:00Z"), 9, utc), "Monday before the hour is today")
        assertEquals(at("2026-09-28T09:00:00Z"), nextWeeklyRecapMillis(at("2026-09-21T10:00:00Z"), 9, utc), "Monday after the hour is next week")
        assertEquals(at("2026-09-28T09:00:00Z"), nextWeeklyRecapMillis(at("2026-09-23T12:00:00Z"), 9, utc), "Wednesday")
        assertEquals(at("2026-09-28T09:00:00Z"), nextWeeklyRecapMillis(at("2026-09-27T12:00:00Z"), 9, utc), "Sunday")
    }

    @Test
    fun `reminder plans cancel when nothing to say and carry the exact copy`() {
        assertNull(ReminderPlans.streak("2026-09-13", at("2026-09-13T10:00:00Z"), utc))
        val streak = ReminderPlans.streak("2026-09-12", at("2026-09-13T10:00:00Z"), utc)!!
        assertEquals(ReminderKind.STREAK, streak.kind)
        assertEquals("Keep your streak alive", streak.title)
        assertEquals("You haven't studied today yet -- a quick lesson keeps it going.", streak.body)
        assertEquals(at("2026-09-13T20:00:00Z"), streak.fireAtMillis)

        assertNull(ReminderPlans.dueReview(listOf(item("2026-09-14")), at("2026-09-13T10:00:00Z")))
        val one = ReminderPlans.dueReview(listOf(item("2026-09-13")), at("2026-09-13T10:00:00Z"))!!
        assertEquals("1 item is due for review.", one.body)
        assertEquals(at("2026-09-13T13:00:00Z"), one.fireAtMillis)
        assertEquals("3 items are due for review.", ReminderPlans.dueReview(listOf(item("2026-09-10"), item("2026-09-11"), item("2026-09-13")), at("2026-09-13T10:00:00Z"))!!.body)

        val recap = ReminderPlans.weeklyRecap(at("2026-09-23T12:00:00Z"), utc)
        assertEquals("Your weekly recap is ready", recap.title)
        assertEquals(at("2026-09-28T09:00:00Z"), recap.fireAtMillis)

        assertNull(ReminderPlans.weakness(emptyList(), at("2026-09-13T08:00:00Z"), utc))
        assertEquals(ReminderKind.WEAKNESS, ReminderPlans.weakness(listOf("articles"), at("2026-09-13T08:00:00Z"), utc)!!.kind)
    }

    @Test
    fun `widget snapshot studiedToday follows the UTC date and round-trips through JSON`() {
        val now = at("2026-09-13T23:30:00Z")
        assertTrue(makeStreakWidgetSnapshot(4, 12, "2026-09-13", now).studiedToday)
        assertFalse(makeStreakWidgetSnapshot(4, 12, "2026-09-12", now).studiedToday)
        assertFalse(makeStreakWidgetSnapshot(4, 12, null, now).studiedToday)
        val snapshot = makeStreakWidgetSnapshot(4, 12, "2026-09-13", now)
        val encoded = ContentJson.json.encodeToString(StreakWidgetSnapshot.serializer(), snapshot)
        assertEquals(snapshot, ContentJson.json.decodeFromString(StreakWidgetSnapshot.serializer(), encoded))
    }
}
