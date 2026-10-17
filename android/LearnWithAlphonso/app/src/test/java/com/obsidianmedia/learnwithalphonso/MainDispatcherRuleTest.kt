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
import org.junit.Test
import org.junit.runner.Description

/** The rule must survive work that resumes after the test body has returned. */
class MainDispatcherRuleTest {
    @Test
    fun `work that resumes after the rule finished neither crashes nor runs`() = runBlocking {
        val rule = MainDispatcherRule()
        val desc = Description.EMPTY
        rule.starting(desc)
        val gate = CompletableDeferred<Unit>()
        var uncaught: Throwable? = null
        var ranAfterGate = false
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate + CoroutineExceptionHandler { _, t -> uncaught = t })
        scope.launch { gate.await(); ranAfterGate = true }
        // The test "ends" while the work is still suspended, exactly like a view model awaiting the mock engine.
        rule.finished(desc)
        val thrown = runCatching { gate.complete(Unit) }.exceptionOrNull()
        assertNull("completing the gate must not throw", thrown)
        assertNull("no coroutine failure after the test ended", uncaught)
        assertFalse("late work from a finished test is dropped", ranAfterGate)
        // The next test starts cleanly.
        rule.starting(desc)
        var ran = false
        CoroutineScope(Dispatchers.Main.immediate).launch { ran = true }
        assertEquals(true, ran)
        rule.finished(desc)
    }
}
