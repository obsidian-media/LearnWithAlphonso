package com.obsidianmedia.learnwithalphonso

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.Description

/** The rule must survive work that resumes after the test body has returned. */
class MainDispatcherRuleTest {
    private val desc = Description.createTestDescription("LeakyTest", "leaks")

    @Test
    fun `work that resumes after the rule finished neither crashes nor runs, and is counted`() = runBlocking {
        val rule = MainDispatcherRule()
        rule.starting(desc)
        val gate = CompletableDeferred<Unit>()
        var uncaught: Throwable? = null
        var started = false
        var ranAfterGate = false
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate + CoroutineExceptionHandler { _, t -> uncaught = t })
        scope.launch { started = true; gate.await(); ranAfterGate = true }
        // The coroutine really ran up to the gate: this test cannot pass because the launch never happened.
        assertTrue("the work reached its suspension point before the test ended", started)
        val droppedBefore = GatedMainDispatcher.droppedCount
        // The test "ends" while the work is still suspended, exactly like a view model awaiting the mock engine.
        rule.finished(desc)
        val thrown = runCatching { gate.complete(Unit) }.exceptionOrNull()
        assertNull("completing the gate must not throw", thrown)
        assertNull("no coroutine failure after the test ended", uncaught)
        assertFalse("late work from a finished test is dropped", ranAfterGate)
        assertEquals("the dropped resumption is counted", droppedBefore + 1, GatedMainDispatcher.droppedCount)
        assertEquals(desc.displayName, GatedMainDispatcher.finishedTest)
    }

    @Test
    fun `the next test starts cleanly after a leaked one`() = runBlocking {
        val rule = MainDispatcherRule()
        rule.starting(desc)
        rule.finished(desc)
        rule.starting(desc)
        var ran = false
        CoroutineScope(Dispatchers.Main.immediate).launch { ran = true }
        assertTrue("new work runs inline while the gate is open", ran)
        rule.finished(desc)
    }
}
