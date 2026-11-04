package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderPromptPolicyTest {
    private val now = 1_800_000_000_000L
    private val day = 86_400_000L

    private fun show(lessons: Int, permission: ReminderPermission = ReminderPermission.UNDETERMINED, state: ReminderPromptState = ReminderPromptState(), at: Long = now) =
        ReminderPromptPolicy.shouldShowCard(lessons, permission, state, at)

    @Test
    fun `no card on the first completed lesson`() {
        assertFalse(show(0))
        assertFalse(show(1))
    }

    @Test
    fun `card from the second completed lesson`() {
        assertTrue(show(2))
        assertTrue(show(9))
    }

    @Test
    fun `no card when permission is already granted or denied`() {
        assertFalse(show(5, ReminderPermission.GRANTED))
        assertFalse(show(5, ReminderPermission.DENIED))
    }

    @Test
    fun `not now hides the card for three days`() {
        val after = ReminderPromptPolicy.afterNotNow(ReminderPromptState(), now)
        assertFalse(show(5, state = after, at = now))
        assertFalse(show(5, state = after, at = now + 3 * day - 1))
        assertTrue(show(5, state = after, at = now + 3 * day))
    }

    @Test
    fun `a second not now ends the offers for good`() {
        val once = ReminderPromptPolicy.afterNotNow(ReminderPromptState(), now)
        val twice = ReminderPromptPolicy.afterNotNow(once, now + 4 * day)
        assertEquals(2, twice.dismissals)
        assertFalse(show(50, state = twice, at = now + 400 * day))
    }

    @Test
    fun `a clock set backwards does not reopen the card early`() {
        val after = ReminderPromptPolicy.afterNotNow(ReminderPromptState(), now)
        assertFalse(show(5, state = after, at = now - 10 * day))
    }

    @Test
    fun `store round trips and starts fresh`() {
        val backing = mutableMapOf<String, Long>()
        val store = ReminderPromptStore(
            get = { backing[it] },
            put = { k, v -> backing[k] = v },
        )
        assertEquals(ReminderPromptState(), store.load())
        store.recordNotNow(now)
        assertEquals(ReminderPromptState(1, now), store.load())
        store.recordNotNow(now + 4 * day)
        assertEquals(2, store.load().dismissals)
    }

    @Test
    fun `copy has no em dashes`() {
        for (line in listOf(ReminderPromptCopy.TITLE, ReminderPromptCopy.BODY, ReminderPromptCopy.ACCEPT, ReminderPromptCopy.DECLINE)) {
            assertFalse(line.contains('—'))
        }
        assertEquals("Keep your streak going", ReminderPromptCopy.TITLE)
    }
}
