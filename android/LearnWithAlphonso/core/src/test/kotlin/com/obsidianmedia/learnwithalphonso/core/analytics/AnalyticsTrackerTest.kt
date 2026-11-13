package com.obsidianmedia.learnwithalphonso.core.analytics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

private class MemoryStorage(var value: String? = null) : AnalyticsConsentStorage {
    override fun read() = value
    override fun write(value: String) { this.value = value }
}

private class RecordingSink : AnalyticsSink {
    val captured = mutableListOf<Pair<String, Map<String, Any>>>()
    var resets = 0
    override fun capture(event: String, properties: Map<String, Any>) { captured += event to properties }
    override fun reset() { resets++ }
}

class AnalyticsTrackerTest {
    @Test
    fun `nothing is sent and the sink is never built before consent`() {
        val tracker = AnalyticsTracker(MemoryStorage(), { false })
        var built = 0
        tracker.resume { built++; RecordingSink() }
        tracker.track(AnalyticsEvent.APP_OPEN)
        assertEquals(0, built)
        assertFalse(tracker.hasConsent)
        assertFalse(tracker.hasAnswered)
    }

    @Test
    fun `events flow after opt-in with allowed properties only`() {
        val tracker = AnalyticsTracker(MemoryStorage(), { false })
        val sink = RecordingSink()
        tracker.setConsent(true) { sink }
        tracker.track(
            AnalyticsEvent.LESSON_STARTED,
            mapOf("lesson_id" to "l-1", "level" to "A1", "course" to "en", "email" to "a@b.co"),
        )
        assertEquals(1, sink.captured.size)
        assertEquals("lesson_started", sink.captured[0].first)
        assertEquals(setOf("lesson_id", "level", "course", "platform"), sink.captured[0].second.keys)
    }

    @Test
    fun `opting out stops sending and resets the anonymous id`() {
        val tracker = AnalyticsTracker(MemoryStorage(), { false })
        val sink = RecordingSink()
        tracker.setConsent(true) { sink }
        tracker.setConsent(false) { null }
        assertEquals(1, sink.resets)
        tracker.track(AnalyticsEvent.APP_OPEN)
        assertTrue(sink.captured.isEmpty())
    }

    @Test
    fun `an under-13 device never sends even with a stored opt-in`() {
        val tracker = AnalyticsTracker(MemoryStorage("1"), { true })
        var built = 0
        tracker.resume { built++; RecordingSink() }
        tracker.setConsent(true) { built++; RecordingSink() }
        tracker.track(AnalyticsEvent.APP_OPEN)
        assertEquals(0, built)
        assertFalse(tracker.hasConsent)
    }

    @Test
    fun `email-like and free-text values are dropped`() {
        assertTrue(
            AnalyticsProperties.sanitize(
                AnalyticsEvent.LESSON_STARTED,
                mapOf("lesson_id" to "maria@example.com", "level" to "hello there friend"),
            ).isEmpty(),
        )
        assertTrue(AnalyticsProperties.sanitize(AnalyticsEvent.PAYWALL_VIEWED, mapOf("source" to "x".repeat(200))).isEmpty())
        assertEquals(2, AnalyticsProperties.sanitize(AnalyticsEvent.PRACTICE_CALL_COMPLETED, mapOf("scenario_id" to "cafe", "stars" to 3)).size)
        assertEquals(1, AnalyticsProperties.sanitize(AnalyticsEvent.PRACTICE_CALL_COMPLETED, mapOf("scenario_id" to "cafe", "stars" to "3")).size)
    }

    @Test
    fun `score buckets`() {
        assertEquals("100", AnalyticsProperties.scoreBucket(100.0))
        assertEquals("80-99", AnalyticsProperties.scoreBucket(85.0))
        assertEquals("50-79", AnalyticsProperties.scoreBucket(50.0))
        assertEquals("0-49", AnalyticsProperties.scoreBucket(10.0))
    }
}
