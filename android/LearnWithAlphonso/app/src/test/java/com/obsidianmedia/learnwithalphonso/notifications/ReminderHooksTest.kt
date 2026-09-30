package com.obsidianmedia.learnwithalphonso.notifications

import com.obsidianmedia.learnwithalphonso.core.logic.ReminderKind
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPlan
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class ReminderHooksTest {
    private class Recording : ReminderScheduler {
        val events = ArrayList<String>()
        override fun schedule(plan: ReminderPlan) { events.add("schedule:${plan.kind.id}@${Instant.ofEpochMilli(plan.fireAtMillis)}:${plan.body}") }
        override fun cancel(kind: ReminderKind) { events.add("cancel:${kind.id}") }
    }

    private val utc: ZoneId = ZoneId.of("UTC")
    private val now = Instant.parse("2026-09-23T12:00:00Z").toEpochMilli() // a Wednesday
    private fun item(dueOn: String) = ReviewItem("k", "l", "A1", 2.3, 1, 1, dueOn)

    @Test
    fun `lesson finished today cancels the streak reminder, yesterday schedules 8pm`() {
        val s = Recording()
        val hooks = ReminderHooks(s, { utc }) { now }
        hooks.onLessonFinished("2026-09-23")
        hooks.onLessonFinished("2026-09-22")
        assertEquals(
            listOf("cancel:streak-reminder", "schedule:streak-reminder@2026-09-23T20:00:00Z:You haven't studied today yet -- a quick lesson keeps it going."),
            s.events,
        )
    }

    @Test
    fun `launch schedules the streak from cached progress and the weekly recap`() {
        val s = Recording()
        ReminderHooks(s, { utc }) { now }.onLaunch(null)
        assertEquals(
            listOf("schedule:streak-reminder@2026-09-23T20:00:00Z:You haven't studied today yet -- a quick lesson keeps it going.", "schedule:weekly-recap@2026-09-28T09:00:00Z:See how you did on the leaderboard last week."),
            s.events,
        )
    }

    @Test
    fun `queue with three due schedules the nudge three hours out, empty cancels`() {
        val s = Recording()
        val hooks = ReminderHooks(s, { utc }) { now }
        hooks.onQueueLoaded(listOf(item("2026-09-20"), item("2026-09-23"), item("2026-09-23"), item("2026-09-30")))
        hooks.onQueueLoaded(listOf(item("2026-09-30")))
        assertEquals(listOf("schedule:due-review-nudge@2026-09-23T15:00:00Z:3 items are due for review.", "cancel:due-review-nudge"), s.events)
    }

    @Test
    fun `an empty weakness trend cancels, an open category schedules 10am`() {
        val s = Recording()
        val hooks = ReminderHooks(s, { utc }) { now }
        hooks.onWeaknessTrend(emptyList())
        hooks.onWeaknessTrend(listOf("past-tense"))
        assertEquals(listOf("cancel:weakness-practice-nudge", "schedule:weakness-practice-nudge@2026-09-24T10:00:00Z:You've got a past tense question waiting in your review queue."), s.events)
    }
}
