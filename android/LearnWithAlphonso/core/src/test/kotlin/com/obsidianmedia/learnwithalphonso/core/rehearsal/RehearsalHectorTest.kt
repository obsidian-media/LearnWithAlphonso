package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Hector rehearsals and hard mode (slice F): the chat body, the refusals, the state's two new fields and the partner
 * sheet's rules, against the shared contract (rehearsal-api.json, a byte-for-byte copy of the server's fixture).
 */
class RehearsalHectorTest {
    private val fixture: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/rehearsal-api.json")!!.readText()).jsonObject

    private fun rehearsalOf(key: String) = fixture.getValue(key).jsonObject.getValue("rehearsal").jsonObject
    private val id = "11111111-1111-4111-8111-111111111111"

    private fun body(source: CallSource): JsonObject =
        ChatRequestBody.build(source, systemPrompt = null, cefrLevel = null, course = null, callId = null, messages = emptyList())

    // ---------------------------------------------------------------- the chat body

    @Test fun `a Hector turn carries exactly the contract's persona and nothing else`() {
        val actual = body(CallSource.Rehearsal(id, Stage.CONVERSATION, RehearsalPartner.HECTOR)).getValue("rehearsal").jsonObject
        assertEquals(rehearsalOf("chatBodyHector"), actual)
        assertFalse(actual.containsKey("hardMode"))
    }

    @Test fun `a hard mode turn carries persona and hardMode exactly as the contract has them`() {
        val actual = body(CallSource.Rehearsal(id, Stage.HARD_MOMENTS, RehearsalPartner.HECTOR, hardMode = true)).getValue("rehearsal").jsonObject
        assertEquals(rehearsalOf("chatBodyHard"), actual)
    }

    @Test fun `every turn of one call sends the same two values`() {
        val source = CallSource.Rehearsal(id, Stage.HARD_MOMENTS, RehearsalPartner.HECTOR, hardMode = true)
        val turns = (1..4).map { body(source).getValue("rehearsal").jsonObject }
        assertEquals(1, turns.toSet().size)
        assertEquals("hector", turns.first().getValue("persona").jsonPrimitive.content)
        assertEquals("true", turns.first().getValue("hardMode").jsonPrimitive.content)
    }

    @Test fun `Alphonso's body is exactly what it was before Hector rehearsals`() {
        val plain = body(CallSource.Rehearsal(id, Stage.CONVERSATION)).getValue("rehearsal").jsonObject
        assertEquals(rehearsalOf("chatBody"), plain)
        // Hard mode without Hector is never sent: the server would refuse it as invalid_mode.
        assertEquals(plain, body(CallSource.Rehearsal(id, Stage.CONVERSATION, RehearsalPartner.ALPHONSO, hardMode = true)).getValue("rehearsal").jsonObject)
    }

    @Test fun `hard mode is never sent for a stage other than the last`() {
        val actual = body(CallSource.Rehearsal(id, Stage.WARMUP, RehearsalPartner.HECTOR, hardMode = true)).getValue("rehearsal").jsonObject
        assertFalse(actual.containsKey("hardMode"))
        assertEquals("hector", actual.getValue("persona").jsonPrimitive.content)
    }

    // ---------------------------------------------------------------- the refusals

    @Test fun `every chat error of the contract means what the contract says`() {
        val expected = mapOf("paywall" to RehearsalChatRefusal.PRO_REQUIRED, "free_runs_used" to RehearsalChatRefusal.FREE_RUNS_USED, "invalid" to RehearsalChatRefusal.INVALID_MODE, "retry" to RehearsalChatRefusal.RETRY)
        val errors = fixture.getValue("chatErrors").jsonArray
        assertEquals(expected.keys, errors.map { it.jsonObject.getValue("means").jsonPrimitive.content }.toSet())
        errors.forEach {
            val o = it.jsonObject
            val status = o.getValue("status").jsonPrimitive.content.toInt()
            val code = o.getValue("body").jsonObject["error"]?.jsonPrimitive?.content
            assertEquals(expected.getValue(o.getValue("means").jsonPrimitive.content), RehearsalChatRefusal.of(status, code), "$status $code")
        }
    }

    @Test fun `pro_required opens the paywall and free_runs_used does not, and both have their own words`() {
        val pro = AiConversationError.Server(402, null, "pro_required")
        val free = AiConversationError.Server(402, null, "free_runs_used")
        assertEquals(RehearsalChatRefusal.PRO_REQUIRED, RehearsalChatRefusal.of(pro))
        assertEquals(RehearsalChatRefusal.FREE_RUNS_USED, RehearsalChatRefusal.of(free))
        assertTrue(RehearsalChatRefusal.message(pro).contains("Hector rehearsals are part of Alphonso Pro"))
        assertTrue(RehearsalChatRefusal.message(free).contains("used all the runs of your free rehearsal"))
    }

    @Test fun `a refusal that is not a server answer, or an unrelated one, is not the paywall`() {
        assertEquals(RehearsalChatRefusal.OTHER, RehearsalChatRefusal.of(java.io.IOException("offline")))
        assertEquals(RehearsalChatRefusal.OTHER, RehearsalChatRefusal.of(500, null))
        assertEquals(RehearsalChatRefusal.NOT_FOUND, RehearsalChatRefusal.of(404, "not_found"))
        assertEquals(RehearsalChatRefusal.CLOSED, RehearsalChatRefusal.of(409, "rehearsal_closed"))
        // The old rule (any 402 is the free rehearsal's limit) still holds for a 402 with no code.
        assertEquals(RehearsalChatRefusal.FREE_RUNS_USED, RehearsalChatRefusal.of(402, null))
    }

    @Test fun `invalid_mode and retry keep the existing generic words`() {
        val generic = com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy.GENERIC
        assertEquals(generic, RehearsalChatRefusal.message(AiConversationError.Server(400, null, "invalid_mode")))
        assertEquals(generic, RehearsalChatRefusal.message(AiConversationError.Server(503, null, "retry")))
    }

    // ---------------------------------------------------------------- the state

    @Test fun `the active state carries hectorAvailable, hardModeDone and the run's persona`() {
        val state = RehearsalDecoding.state(fixture.getValue("state").toString())!!
        assertEquals(true, state.hectorAvailable)
        assertFalse(state.hardModeDone)
        val run = state.runs.first()
        assertEquals("alphonso", run.persona)
        assertFalse(run.hardMode)
    }

    @Test fun `an unknown Pro answer decodes as null, not as false`() {
        val state = RehearsalDecoding.state(fixture.getValue("stateEmpty").toString())!!
        assertNull(state.hectorAvailable)
        assertFalse(state.hardModeDone)
    }

    private fun withFields(base: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): RehearsalState? {
        val root = fixture.getValue(base).jsonObject
        return RehearsalDecoding.state(buildJsonObject {
            root.forEach { (k, v) -> if (k != "hectorAvailable" && k != "hardModeDone") put(k, v) }
            build()
        }.toString())
    }

    @Test fun `a server that sends neither field, or a wrong type, still gives a state`() {
        assertNull(withFields("state") {}!!.hectorAvailable)
        assertFalse(withFields("state") {}!!.hardModeDone)
        val odd = withFields("state") { put("hectorAvailable", "yes"); put("hardModeDone", "true") }!!
        assertNull(odd.hectorAvailable)
        assertFalse(odd.hardModeDone)
        assertEquals(false, withFields("state") { put("hectorAvailable", false); put("hardModeDone", true) }!!.hectorAvailable)
        assertTrue(withFields("state") { put("hardModeDone", true) }!!.hardModeDone)
    }

    // ---------------------------------------------------------------- the partner sheet

    @Test fun `the Pro badge and the paywall appear only for a definite no`() {
        assertTrue(StagePartnerRules.hectorLocked(false))
        assertFalse(StagePartnerRules.hectorLocked(true))
        assertFalse(StagePartnerRules.hectorLocked(null))
        assertEquals(StagePartnerRules.Choice.Paywall, StagePartnerRules.hector(Stage.CONVERSATION, false, hardRequested = false))
        // null lets the learner try: the server decides at the run's start.
        assertEquals(StagePartnerRules.Choice.Start(RehearsalPartner.HECTOR, false), StagePartnerRules.hector(Stage.CONVERSATION, null, hardRequested = false))
        assertEquals(StagePartnerRules.Choice.Start(RehearsalPartner.HECTOR, false), StagePartnerRules.hector(Stage.CONVERSATION, true, hardRequested = false))
    }

    @Test fun `hard mode is offered on the last stage only, and never to a learner who is locked out`() {
        assertTrue(StagePartnerRules.hardModeOffered(Stage.HARD_MOMENTS, true))
        assertTrue(StagePartnerRules.hardModeOffered(Stage.HARD_MOMENTS, null))
        assertFalse(StagePartnerRules.hardModeOffered(Stage.HARD_MOMENTS, false))
        assertFalse(StagePartnerRules.hardModeOffered(Stage.WARMUP, true))
        assertFalse(StagePartnerRules.hardModeOffered(Stage.CONVERSATION, true))
    }

    @Test fun `a hard mode request counts only where hard mode is offered`() {
        assertEquals(StagePartnerRules.Choice.Start(RehearsalPartner.HECTOR, true), StagePartnerRules.hector(Stage.HARD_MOMENTS, true, hardRequested = true))
        // A stale toggle from the last stage never leaks into another one.
        assertEquals(StagePartnerRules.Choice.Start(RehearsalPartner.HECTOR, false), StagePartnerRules.hector(Stage.CONVERSATION, true, hardRequested = true))
        assertEquals(StagePartnerRules.Choice.Paywall, StagePartnerRules.hector(Stage.HARD_MOMENTS, false, hardRequested = true))
    }

    @Test fun `Alphonso is always the plain choice`() {
        assertEquals(StagePartnerRules.Choice.Start(RehearsalPartner.ALPHONSO, false), StagePartnerRules.alphonso())
    }

    @Test fun `the Hector button says what it will do`() {
        assertEquals("Start with Hector (Pro)", StagePartnerRules.hectorButton(Stage.HARD_MOMENTS, false, true))
        assertEquals("Start hard mode with Hector", StagePartnerRules.hectorButton(Stage.HARD_MOMENTS, true, true))
        assertEquals("Start with Hector", StagePartnerRules.hectorButton(Stage.HARD_MOMENTS, true, false))
        assertEquals("Start with Hector", StagePartnerRules.hectorButton(Stage.CONVERSATION, true, true))
    }

    @Test fun `the call header names the partner and hard mode, and Alphonso's header is unchanged`() {
        assertEquals("Alphonso · Stage 2 of 3: The real conversation", RehearsalCopy.callSubline(Stage.CONVERSATION))
        assertEquals("Hector · Stage 2 of 3: The real conversation", RehearsalCopy.callSubline(Stage.CONVERSATION, RehearsalPartner.HECTOR))
        assertEquals("Hector · Stage 3 of 3: The hard moments · Hard mode", RehearsalCopy.callSubline(Stage.HARD_MOMENTS, RehearsalPartner.HECTOR, true))
    }
}
