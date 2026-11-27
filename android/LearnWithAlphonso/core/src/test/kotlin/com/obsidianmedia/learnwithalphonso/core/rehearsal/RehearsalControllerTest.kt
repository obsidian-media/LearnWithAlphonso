package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RehearsalControllerTest {
    private val fixture = ContentJson.json.parseToJsonElement(javaClass.getResource("/rehearsal-api.json")!!.readText()).jsonObject
    private val active = RehearsalDecoding.state(fixture.getValue("state").toString())!!
    private val empty = RehearsalDecoding.state(fixture.getValue("stateEmpty").toString())!!
    private val rehearsal = active.active!!

    private class Fake(var state: RehearsalState, var createResult: RehearsalResult<Rehearsal>) : RehearsalApi {
        val calls = ArrayList<String>()
        override suspend fun state(course: String) = RehearsalResult.Ok(state)
        override suspend fun create(intake: RehearsalIntake): RehearsalResult<Rehearsal> { calls += "create"; return createResult }
        override suspend fun adjust(id: String, intake: RehearsalIntake): RehearsalResult<Rehearsal> { calls += "adjust"; return createResult }
        override suspend fun cancel(id: String): RehearsalResult<Rehearsal> { calls += "cancel:$id"; return createResult }
        override suspend fun outcome(id: String, choice: OutcomeChoice, newDate: String?): RehearsalResult<Rehearsal> {
            calls += "outcome:$id:${choice.wire}:$newDate"; return createResult
        }
        override suspend fun delete(id: String): RehearsalResult<Unit> { calls += "delete:$id"; return RehearsalResult.Ok(Unit) }
    }

    private val intake = RehearsalIntake("en", EventKind.INTERVIEW, null, "a manager", null)

    @Test fun `tapping the entry for a non-Pro learner with the free rehearsal used opens the Pro sheet`() = runTest {
        val c = RehearsalController(Fake(empty.copy(freeAvailable = false), RehearsalResult.Ok(rehearsal)), "en")
        c.load()
        assertEquals(RehearsalEntry.PAYWALL, c.entryTapped(isPro = false))
        assertTrue(c.ui.value.paywall)
        c.dismissPaywall()
        assertFalse(c.ui.value.paywall)
    }

    @Test fun `tapping the entry with the free rehearsal available opens the intake and no sheet`() = runTest {
        val c = RehearsalController(Fake(empty, RehearsalResult.Ok(rehearsal)), "en")
        c.load()
        assertEquals(RehearsalEntry.INTAKE, c.entryTapped(isPro = false))
        assertFalse(c.ui.value.paywall)
    }

    @Test fun `a 402 on create opens the Pro sheet and reports the paywall error`() = runTest {
        val c = RehearsalController(Fake(empty, RehearsalResult.Failed(RehearsalError.PAYWALL)), "en")
        c.load()
        assertFalse(c.create(intake))
        assertTrue(c.ui.value.paywall)
        assertEquals(RehearsalError.PAYWALL, c.ui.value.error)
    }

    @Test fun `a refusal other than 402 shows its error and no sheet`() = runTest {
        val c = RehearsalController(Fake(empty, RehearsalResult.Failed(RehearsalError.BLOCKED_TEXT)), "en")
        c.load()
        assertFalse(c.create(intake))
        assertFalse(c.ui.value.paywall)
        assertEquals(RehearsalError.BLOCKED_TEXT, c.ui.value.error)
    }

    @Test fun `each outcome tap sends its choice, and moved carries the new date`() = runTest {
        val api = Fake(active, RehearsalResult.Ok(rehearsal))
        val c = RehearsalController(api, "en")
        c.load()
        for (choice in listOf(OutcomeChoice.WELL, OutcomeChoice.OK, OutcomeChoice.HARD)) assertTrue(c.outcome(rehearsal.id, choice))
        assertTrue(c.outcome(rehearsal.id, OutcomeChoice.MOVED, "2026-12-04"))
        assertEquals(
            listOf("well", "ok", "hard", "moved").zip(listOf("null", "null", "null", "2026-12-04")).map { (ch, d) -> "outcome:${rehearsal.id}:$ch:$d" },
            api.calls,
        )
        assertTrue(c.close(rehearsal.id))
        assertEquals("cancel:${rehearsal.id}", api.calls.last())
    }

    @Test fun `a successful create reloads the state`() = runTest {
        val api = Fake(empty, RehearsalResult.Ok(rehearsal))
        val c = RehearsalController(api, "en")
        c.load()
        api.state = active
        assertTrue(c.create(intake))
        assertEquals(rehearsal.id, c.ui.value.state!!.active!!.id)
    }

    @Test fun `each course has its own stage openers`() {
        assertEquals("Let's warm up. Say hello and tell me what you are getting ready for.", RehearsalOpeners.opener("en", Stage.WARMUP))
        assertTrue(RehearsalOpeners.opener("fr", Stage.CONVERSATION).startsWith("Commencez"))
        assertTrue(RehearsalOpeners.opener("es", Stage.HARD_MOMENTS).startsWith("Practiquemos"))
    }

    @Test fun `the runs before a call are kept for that call, through a reload that adds the new run, and a repeat records its own`() = runTest {
        val api = Fake(active, RehearsalResult.Ok(rehearsal))
        val c = RehearsalController(api, "en")
        c.load()
        assertEquals(1, c.runsBefore("call-1", Stage.WARMUP))
        assertEquals(0, c.runsBefore("call-x", Stage.HARD_MOMENTS))
        val extra = active.runs.first().copy(finishedAt = "2026-11-28T10:00:00Z")
        api.state = active.copy(runs = active.runs + extra)
        c.load()
        // The run the call wrote is in the state now; the baseline must not move (a rotation asks again).
        assertEquals(1, c.runsBefore("call-1", Stage.WARMUP))
        assertEquals(2, c.runsBefore("call-2", Stage.WARMUP))
    }
}
