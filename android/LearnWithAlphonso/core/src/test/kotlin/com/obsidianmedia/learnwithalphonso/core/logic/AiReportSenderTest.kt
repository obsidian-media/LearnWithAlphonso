package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class AiReportSenderTest {
    private fun report(text: String = "reply") = AiResponseReport(text, AiResponseSurface.HECTOR, "en", AiResponseReportReason.OTHER)

    @Test
    fun `a second report while one is in flight is ignored, so no second row is created`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val sent = ArrayList<String>()
        val sender = AiReportSender({ r -> sent.add(r.message); gate.await() }, TestScope(UnconfinedTestDispatcher(testScheduler)))
        val first = sender.submit(report("one"))
        assertNotNull(first)
        assertTrue(sender.state.value.sending)
        assertNull(sender.submit(report("two")))
        assertNull(sender.submit(report("three")))
        gate.complete(Unit)
        first!!.join()
        assertEquals(listOf("one"), sent)
        assertFalse(sender.state.value.sending)
        assertEquals(AiConsentCopy.reportThanks, sender.state.value.message)
    }

    @Test
    fun `a failure says so, and the next report can be sent after it is dismissed`() = runTest {
        var fail = true
        val sent = ArrayList<String>()
        val sender = AiReportSender({ r -> if (fail) throw IOException("offline"); sent.add(r.message) }, TestScope(UnconfinedTestDispatcher(testScheduler)))
        sender.submit(report("a"))!!.join()
        assertEquals(AiConsentCopy.reportFailed, sender.state.value.message)
        sender.dismissMessage()
        assertNull(sender.state.value.message)
        fail = false
        sender.submit(report("b"))!!.join()
        assertEquals(listOf("b"), sent)
        assertEquals(AiConsentCopy.reportThanks, sender.state.value.message)
    }

    @Test
    fun `the result outlives the bubble that asked, and cannot be dismissed while sending`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val sender = AiReportSender({ gate.await() }, TestScope(UnconfinedTestDispatcher(testScheduler)))
        val job = sender.submit(report())!!
        sender.dismissMessage()
        assertTrue(sender.state.value.sending, "still sending")
        gate.complete(Unit)
        job.join()
        // Nothing held the result in a bubble: it is in the sender's state until someone dismisses it.
        assertEquals(AiConsentCopy.reportThanks, sender.state.value.message)
    }
}
