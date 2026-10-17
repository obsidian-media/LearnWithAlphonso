package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OnboardingFlowTest {
    private fun start(prefill: String = "Ana") = DisplayNameOnboarding.start(prefill, "Learner-4F2A")

    @Test
    fun `the launch work runs once per account, a rotation does not redo it`() {
        val flow = OnboardingFlow()
        assertTrue(flow.tryBegin("a"))
        assertFalse(flow.tryBegin("a"), "a rotation recomposes the same account")
    }

    @Test
    fun `a run cancelled before it finished is run again`() {
        val flow = OnboardingFlow()
        assertTrue(flow.tryBegin("a"))
        flow.abandon("a")
        assertTrue(flow.tryBegin("a"))
    }

    @Test
    fun `the name step comes first, then placement, and a finished step is not offered twice`() {
        val flow = OnboardingFlow()
        flow.tryBegin("a")
        flow.record("a", nameConfirmed = false, placementTaken = false)
        assertEquals(OnboardingStep.DISPLAY_NAME, flow.next("a"))
        flow.presentName("a", start())
        assertEquals(OnboardingStep.DISPLAY_NAME, flow.next("a"), "the prompt is still on screen, so placement waits")
        flow.finish("a", OnboardingStep.DISPLAY_NAME)
        assertNull(flow.nameFor("a"))
        assertEquals(OnboardingStep.PLACEMENT, flow.next("a"))
        flow.finish("a", OnboardingStep.PLACEMENT)
        assertNull(flow.next("a"))
    }

    @Test
    fun `a failed check skips its step and a name step with nothing to show is skipped`() {
        val flow = OnboardingFlow()
        flow.tryBegin("a")
        flow.record("a", nameConfirmed = null, placementTaken = false)
        assertEquals(OnboardingStep.PLACEMENT, flow.next("a"))
        flow.record("a", nameConfirmed = false, placementTaken = false)
        flow.presentName("a", null)
        assertEquals(OnboardingStep.PLACEMENT, flow.next("a"))
        assertNull(flow.nameFor("a"))
    }

    @Test
    fun `another account never inherits the previous account's prompt or prefilled name`() {
        val flow = OnboardingFlow()
        flow.tryBegin("a")
        flow.record("a", nameConfirmed = false, placementTaken = false)
        flow.presentName("a", start("Alice Real-Name"))
        val aPrompt = flow.name.value!!
        assertEquals("Alice Real-Name", aPrompt.start.name)

        // Account B signs in: A's prompt is gone before B's launch work even starts.
        assertTrue(flow.tryBegin("b"))
        assertNull(flow.name.value)
        assertNull(flow.nameFor("a"))
        assertNull(flow.nameFor("b"))
        assertNull(flow.next("b"), "nothing recorded for B yet")
        // A late answer for A (a slow request) cannot reach B's flow.
        flow.record("a", nameConfirmed = false, placementTaken = false)
        flow.presentName("a", start("Alice Real-Name"))
        assertNull(flow.name.value)
        assertNull(flow.next("b"))

        flow.record("b", nameConfirmed = false, placementTaken = true)
        flow.presentName("b", start("Bob"))
        val bPrompt = flow.nameFor("b")!!
        assertEquals("Bob", bPrompt.start.name)
        assertNotEquals(aPrompt.id, bPrompt.id, "each prompt has its own id, so no screen state is reused")
        assertNull(flow.nameFor("a"), "A's id is not B's")
    }

    @Test
    fun `signing out drops everything`() {
        val flow = OnboardingFlow()
        flow.tryBegin("a")
        flow.record("a", nameConfirmed = false, placementTaken = false)
        flow.presentName("a", start())
        flow.reset()
        assertNull(flow.name.value)
        assertNull(flow.next("a"))
        assertTrue(flow.tryBegin("a"), "the same account signing back in starts afresh")
    }
}
