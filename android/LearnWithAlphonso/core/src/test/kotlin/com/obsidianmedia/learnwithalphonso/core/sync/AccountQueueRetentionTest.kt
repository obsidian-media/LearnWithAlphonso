package com.obsidianmedia.learnwithalphonso.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AccountQueueRetentionTest {
    private val day = 24L * 60 * 60 * 1000
    private val now = 1_758_000_000_000L

    private fun lesson(id: String, owner: String?, queuedAt: Long = now - 1000) =
        PendingLessonCompletion(id, 5, emptyList(), "en", queuedAt, 50, ownerUserId = owner)

    private fun grade(key: String, owner: String?) = PendingReviewGrade(key, "a", "en", now - 1000, ownerUserId = owner)

    private fun clock(): ForeignOwnerClock {
        var raw: String? = null
        return ForeignOwnerClock({ raw }, { raw = it })
    }

    @Test
    fun `another account's rows expire only after 30 days since it left`() {
        val left = mapOf("old" to now - 30 * day - 1, "edge" to now - 30 * day, "recent" to now - 29 * day)
        val expired = AccountQueueRetention.expiredForeignRows(
            "me",
            listOf(lesson("a", "old"), lesson("b", "edge"), lesson("c", "recent"), lesson("d", "me"), lesson("e", null)),
            listOf(grade("g1", "old"), grade("g2", "recent")),
            now,
        ) { left[it] }
        assertEquals(listOf("a"), expired.lessons.map { it.lessonId })
        assertEquals(listOf("g1"), expired.grades.map { it.itemKey })
    }

    @Test
    fun `the 30 days run from the departure, not from when the row was queued`() {
        val expired = AccountQueueRetention.expiredForeignRows(
            "me", listOf(lesson("queued-long-ago", "them", queuedAt = now - 365 * day)), emptyList(), now,
        ) { now - 2 * day }
        assertTrue(expired.isEmpty)
    }

    @Test
    fun `the signed-in account's rows never expire, even with a departure on record`() {
        val expired = AccountQueueRetention.expiredForeignRows("me", listOf(lesson("mine", "me")), emptyList(), now) { now - 400 * day }
        assertTrue(expired.isEmpty)
    }

    @Test
    fun `an owner with no recorded departure is kept, and its clock is what startup starts`() {
        val lessons = listOf(lesson("a", "them"), lesson("b", "me"), lesson("c", null))
        assertTrue(AccountQueueRetention.expiredForeignRows("me", lessons, emptyList(), now) { null }.isEmpty)
        assertEquals(setOf("them"), AccountQueueRetention.ownersWithoutDeparture("me", lessons, listOf(grade("g", "known")), mapOf("known" to 1L)::get))
        assertEquals(setOf("them", "me"), AccountQueueRetention.ownersWithoutDeparture(null, lessons, emptyList()) { null })
    }

    @Test
    fun `the clock records, keeps and forgets departures`() {
        val c = clock()
        assertNull(c.retiredAt("u1"))
        c.markRetired("u1", 10)
        c.markRetiredIfUnknown("u1", 20)
        assertEquals(10L, c.retiredAt("u1"), "a known departure is not moved by the if-unknown write")
        c.markRetired("u1", 30)
        assertEquals(30L, c.retiredAt("u1"), "a later sign-out restarts the 30 days")
        c.markRetired("u2", 40)
        c.forget("u1")
        assertNull(c.retiredAt("u1"))
        assertEquals(40L, c.retiredAt("u2"))
    }

    @Test
    fun `an unreadable stored clock reads as empty instead of crashing`() {
        val c = ForeignOwnerClock({ "not json" }, { })
        assertNull(c.retiredAt("u1"))
    }

    @Test
    fun `sign-out goes straight through with nothing waiting and asks otherwise`() {
        assertEquals(SignOutGuard.Decision.SignOut, SignOutGuard.decide(0, 0))
        assertEquals(SignOutGuard.Decision.SignOut, SignOutGuard.decide(-1, 0))
        assertEquals("1 lesson hasn't synced yet. Sign out anyway?", (SignOutGuard.decide(1, 0) as SignOutGuard.Decision.Confirm).title)
        assertEquals("2 lessons haven't synced yet. Sign out anyway?", SignOutGuard.title(2, 0))
        assertEquals("1 review answer hasn't synced yet. Sign out anyway?", SignOutGuard.title(0, 1))
        assertEquals("3 review answers haven't synced yet. Sign out anyway?", SignOutGuard.title(0, 3))
        assertEquals("2 lessons and 1 review answer haven't synced yet. Sign out anyway?", SignOutGuard.title(2, 1))
    }
}
