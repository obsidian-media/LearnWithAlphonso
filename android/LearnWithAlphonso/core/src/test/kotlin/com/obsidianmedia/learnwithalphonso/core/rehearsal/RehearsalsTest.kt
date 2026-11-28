package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.AppConfigFeatures
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.RehearsalClient
import com.obsidianmedia.learnwithalphonso.core.net.RehearsalsFlag
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathDecoding
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * Decodes the SAME contract the web and iOS decode (rehearsal-api.json is a byte-for-byte copy of
 * tests/fixtures/rehearsal-api.json, guarded by src/lib/rehearsal-native-fixtures.test.ts), and pins the rules a
 * rehearsal screen relies on.
 */
class RehearsalsTest {
    private val fixture: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/rehearsal-api.json")!!.readText()).jsonObject
    private val paths: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-path.fixtures.json")!!.readText()).jsonObject

    private fun valid(kind: EventKind? = EventKind.INTERVIEW, date: String? = null, who: String = "a hiring manager", worries: String = "") =
        RehearsalRules.validate("en", kind, date, who, worries)

    // ---------------------------------------------------------------- the shared contract

    @Test fun `the active state decodes with every field the screens read`() {
        val state = RehearsalDecoding.state(fixture.getValue("state").toString())!!
        val active = state.active!!
        assertEquals("11111111-1111-4111-8111-111111111111", active.id)
        assertEquals(EventKind.INTERVIEW, active.kind)
        assertEquals("2026-12-01", active.eventDate)
        assertEquals("a hiring manager at a logistics company", active.counterpart)
        assertEquals("questions about salary", active.worries)
        assertTrue(active.free)
        assertEquals(3, active.brief!!.hardMoments.size)
        assertEquals("The salary question", active.brief!!.hardMoments.first().label)
        assertEquals(Stage.CONVERSATION, state.next)
        assertTrue(state.isDone(Stage.WARMUP))
        assertFalse(state.isDone(Stage.CONVERSATION))
        assertEquals(1, state.doneCount())
        assertEquals(listOf("I am hoping for around 3000"), state.latestRun(Stage.WARMUP)!!.corrections)
        assertNull(state.latestRun(Stage.HARD_MOMENTS))
        val past = state.history.single()
        assertEquals(EventKind.MEETING, past.kind)
        assertEquals(3, past.stagesDone)
        assertEquals(6, past.runs)
        assertEquals(4, past.corrections)
        assertFalse(state.freeAvailable)
    }

    @Test fun `the empty state decodes with no active rehearsal and the free one still available`() {
        val state = RehearsalDecoding.state(fixture.getValue("stateEmpty").toString())!!
        assertNull(state.active)
        assertNull(state.progress)
        assertNull(state.next)
        assertTrue(state.runs.isEmpty())
        assertTrue(state.freeAvailable)
    }

    @Test fun `an answer that is not a state is null, and an older server's missing runs read as none`() {
        assertNull(RehearsalDecoding.state("""{"nope":1}"""))
        assertNull(RehearsalDecoding.state("not json"))
        assertNull(RehearsalDecoding.state("""{"active":null,"history":[]}"""))
        val older = RehearsalDecoding.state("""{"active":null,"progress":null,"nextStage":null,"history":[],"freeAvailable":true}""")!!
        assertTrue(older.runs.isEmpty())
    }

    @Test fun `every error in the contract maps to the same meaning as the web`() {
        val errors = fixture.getValue("errors").jsonArray
        assertEquals(10, errors.size)
        for (e in errors) {
            val o = e.jsonObject
            val status = o.getValue("status").jsonPrimitive.content.toInt()
            val code = o.getValue("body").jsonObject["error"]?.jsonPrimitive?.content
            // Android tells a past day apart from "invalid" (its own line); the fixture keeps the web's coarser meaning.
            val means = if (code == "invalid_event_date") "INVALID_EVENT_DATE" else o.getValue("means").jsonPrimitive.content.uppercase()
            assertEquals(RehearsalError.valueOf(means), RehearsalError.of(status, code), "$status $code")
        }
    }

    @Test fun `the chat body of the contract is exactly the rehearsal id and stage`() {
        val expected = fixture.getValue("chatBody").jsonObject.getValue("rehearsal").jsonObject
        val body = ChatRequestBody.build(
            CallSource.Rehearsal(expected.getValue("id").jsonPrimitive.content, Stage.fromWire(expected.getValue("stage").jsonPrimitive.content)!!),
            systemPrompt = null, cefrLevel = null, course = null, callId = null, messages = emptyList(),
        )
        assertEquals(expected, body.getValue("rehearsal").jsonObject)
    }

    @Test fun `the path fixtures carry the pinned rehearsal items`() {
        fun path(key: String) = LearningPathDecoding.path(buildJsonObject { put("path", paths.getValue(key)) }.toString())!!
        val stage = path("rehearsalStage")
        val item = stage.pinned.single()
        assertEquals("stage", item.kind)
        assertEquals(Stage.CONVERSATION, item.stageOrNull)
        assertEquals("The real conversation", item.title)
        assertEquals(10, item.minutes)
        assertFalse(item.hero)
        assertNull(stage.heroPinned)
        assertEquals(item, stage.todayPinned)

        val day = path("rehearsalEventDay")
        val warmup = day.pinned.single()
        assertEquals("warmup_today", warmup.kind)
        assertEquals(Stage.WARMUP, warmup.stageOrNull)
        assertEquals(2, warmup.minutes)
        assertTrue(warmup.hero)
        assertEquals(EventKind.INTERVIEW, warmup.kindOrNull)
        assertEquals("Interview today", RehearsalCopy.heroOverline(warmup.kindOrNull))
        assertEquals(warmup, day.heroPinned)

        // Every other scenario has none, and a path without the key (an older server) decodes with none too.
        assertTrue(path("onTrack").pinned.isEmpty())
        assertTrue(path("behind").pinned.isEmpty())
        val stripped = paths.getValue("onTrack").jsonObject.filterKeys { it != "pinned" }
        assertTrue(LearningPathDecoding.path(buildJsonObject { put("path", JsonObject(stripped)) }.toString())!!.pinned.isEmpty())
    }

    // ---------------------------------------------------------------- the intake

    @Test fun `an intake needs a kind`() {
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.KIND_REQUIRED), valid(kind = null))
    }

    @Test fun `who you will talk to is required and at most 200 characters`() {
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.COUNTERPART_REQUIRED), valid(who = ""))
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.COUNTERPART_REQUIRED), valid(who = "   "))
        assertTrue(valid(who = "a".repeat(200)) is IntakeCheck.Valid)
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.COUNTERPART_TOO_LONG), valid(who = "a".repeat(201)))
    }

    @Test fun `worries are optional and at most 200 characters`() {
        val none = valid(worries = "") as IntakeCheck.Valid
        assertNull(none.intake.worries)
        assertNull((valid(worries = "   ") as IntakeCheck.Valid).intake.worries)
        assertEquals("salary", (valid(worries = " salary ") as IntakeCheck.Valid).intake.worries)
        assertTrue(valid(worries = "w".repeat(200)) is IntakeCheck.Valid)
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.WORRIES_TOO_LONG), valid(worries = "w".repeat(201)))
    }

    @Test fun `the date is optional but must be a real calendar day`() {
        assertNull((valid(date = null) as IntakeCheck.Valid).intake.eventDate)
        assertNull((valid(date = "") as IntakeCheck.Valid).intake.eventDate)
        assertEquals("2026-12-01", (valid(date = "2026-12-01") as IntakeCheck.Valid).intake.eventDate)
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.DATE_INVALID), valid(date = "2026-02-30"))
        assertEquals(IntakeCheck.Invalid(IntakeCheck.Reason.DATE_INVALID), valid(date = "1 Dec"))
    }

    @Test fun `a valid intake is trimmed and carries the course and kind`() {
        val v = valid(kind = EventKind.HOUSING, who = "  a landlord  ") as IntakeCheck.Valid
        assertEquals(RehearsalIntake("en", EventKind.HOUSING, null, "a landlord", null), v.intake)
    }

    @Test fun `there are seven kinds and each has an example for the who field`() {
        assertEquals(7, EventKind.entries.size)
        assertTrue(EventKind.entries.all { it.placeholder.startsWith("e.g. ") })
    }

    // ---------------------------------------------------------------- the call

    @Test fun `a rehearsal call body carries the rehearsal and no system prompt or course`() {
        val body = ChatRequestBody.build(
            CallSource.Rehearsal("11111111-1111-4111-8111-111111111111", Stage.CONVERSATION),
            systemPrompt = "SHOULD NEVER BE SENT", cefrLevel = "B1", course = "en", callId = "call-1",
            messages = listOf("assistant" to "hi", "user" to "hello"),
        )
        assertEquals("11111111-1111-4111-8111-111111111111", body.getValue("rehearsal").jsonObject.getValue("id").jsonPrimitive.content)
        assertEquals("conversation", body.getValue("rehearsal").jsonObject.getValue("stage").jsonPrimitive.content)
        assertFalse(body.containsKey("systemPrompt"))
        assertFalse(body.containsKey("course"))
        assertEquals("B1", body.getValue("cefrLevel").jsonPrimitive.content)
        assertEquals("call-1", body.getValue("callId").jsonPrimitive.content)
        assertEquals(2, body.getValue("messages").jsonArray.size)
    }

    @Test fun `a scenario call body still carries its prompt and course and no rehearsal`() {
        val body = ChatRequestBody.build(CallSource.Scenario, "persona", "A2", "fr", "c", listOf("user" to "hi"))
        assertEquals("persona", body.getValue("systemPrompt").jsonPrimitive.content)
        assertEquals("fr", body.getValue("course").jsonPrimitive.content)
        assertFalse(body.containsKey("rehearsal"))
    }

    @Test fun `the chat client sends the rehearsal body over the wire`() = runTest {
        var sent = ""
        val engine = MockEngine { req ->
            sent = req.body.toByteArray().decodeToString()
            respond("""{"content":"Good morning","verdict":"none"}""", HttpStatusCode.OK)
        }
        val ai = AiConversationClient(ApiHttp("https://learn.example", { "tok" }, engine))
        val reply = ai.chatReply(
            listOf(ChatMessage("user", "hello")), systemPrompt = "x", cefrLevel = null, course = "en", callId = "c1",
            source = CallSource.Rehearsal("11111111-1111-4111-8111-111111111111", Stage.WARMUP),
        )
        assertEquals("Good morning", reply.content)
        val o = ContentJson.json.parseToJsonElement(sent).jsonObject
        assertTrue(o.containsKey("rehearsal"))
        assertFalse(o.containsKey("systemPrompt"))
        assertFalse(o.containsKey("course"))
    }

    // ---------------------------------------------------------------- the client

    private data class Seen(val method: HttpMethod, val path: String, val query: String, val body: String)

    private fun client(seen: MutableList<Seen>, status: HttpStatusCode, body: String) = RehearsalClient(
        ApiHttp("https://learn.example", { "tok" }, MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.url.encodedQuery, req.body.toByteArray().decodeToString()))
            respond(body, status)
        }),
    )

    @Test fun `state asks for the course and decodes the answer`() = runTest {
        val seen = ArrayList<Seen>()
        val r = client(seen, HttpStatusCode.OK, fixture.getValue("state").toString()).state("en")
        assertEquals(HttpMethod.Get, seen.single().method)
        assertEquals("/api/rehearsal", seen.single().path)
        assertEquals("course=en", seen.single().query)
        assertEquals("11111111-1111-4111-8111-111111111111", (r as com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalResult.Ok).value.active!!.id)
    }

    @Test fun `a 402 on create is the paywall and a refusal never throws`() = runTest {
        val seen = ArrayList<Seen>()
        val intake = (valid() as IntakeCheck.Valid).intake
        val r = client(seen, HttpStatusCode.PaymentRequired, """{"error":"paywall"}""").create(intake)
        assertEquals(RehearsalResult.Failed(RehearsalError.PAYWALL), r)
        val body = ContentJson.json.parseToJsonElement(seen.single().body).jsonObject
        assertEquals("create", body.getValue("action").jsonPrimitive.content)
        assertEquals("interview", body.getValue("eventKind").jsonPrimitive.content)
        assertEquals(RehearsalResult.Failed(RehearsalError.BLOCKED_TEXT), client(ArrayList(), HttpStatusCode.BadRequest, """{"error":"blocked_text"}""").create(intake))
        assertEquals(RehearsalResult.Failed(RehearsalError.FAILED), client(ArrayList(), HttpStatusCode.OK, "{}").create(intake))
    }

    // ---------------------------------------------------------------- the quick-starts

    private val presetsJson = """{"presets":[
        {"id":"job_interview","eventKind":"interview","title":"Job interview","blurb":"A hiring manager asks about you.","counterpart":"a hiring manager",
         "stages":[{"key":"warmup","goal":"Say hello and your name"},{"key":"conversation","goal":"Answer the usual questions"},{"key":"hard_moments","goal":"Handle a tough question"}],
         "keyPhrases":[{"text":"Nice to meet you","meaning":"A polite hello"}],"futureField":{"x":1}},
        {"id":"first_day","eventKind":"first_day","title":"First day","blurb":"b","counterpart":"my new manager","stages":[],"keyPhrases":[]},
        {"id":"","title":"no id"},
        {"id":"no_title","title":""}
    ],"extra":true}"""

    @Test fun `the quick-start list decodes in the server's order, ignores unknown keys and drops entries with no id or title`() {
        val list = RehearsalDecoding.presets(presetsJson)!!
        assertEquals(listOf("job_interview", "first_day"), list.map { it.id })
        val first = list.first()
        assertEquals("a hiring manager", first.counterpart)
        assertEquals(listOf("warmup", "conversation", "hard_moments"), first.stages.map { it.key })
        assertEquals("Handle a tough question", first.stages.last().goal)
        assertEquals("Nice to meet you", first.keyPhrases.single().text)
        assertEquals("A polite hello", first.keyPhrases.single().meaning)
        assertNull(RehearsalDecoding.presets("""{"nope":1}"""))
        assertNull(RehearsalDecoding.presets("not json"))
        assertEquals(emptyList<RehearsalPreset>(), RehearsalDecoding.presets("""{"presets":[]}"""))
    }

    @Test fun `the shared fixture's preset list decodes to the eight presets in order, each with three stages and phrases`() {
        val list = RehearsalDecoding.presets(fixture.getValue("presets").jsonObject.getValue("response").toString())!!
        assertEquals(
            listOf("job_interview", "talk_to_manager", "doctor_appointment", "apartment_landlord", "bank_account", "parent_teacher", "first_day", "customer_service_call"),
            list.map { it.id },
        )
        for (p in list) {
            assertEquals(listOf("warmup", "conversation", "hard_moments"), p.stages.map { it.key }, p.id)
            assertTrue(p.title.isNotBlank() && p.blurb.isNotBlank() && p.counterpart.isNotBlank() && p.keyPhrases.isNotEmpty(), p.id)
        }
    }

    @Test fun `the quick-start create body is exactly the shared fixture's, and a date is carried when there is one`() {
        assertEquals(fixture.getValue("createFromPreset").jsonObject, RehearsalClient.presetBody("en", "doctor_appointment", null))
        val withDate = RehearsalClient.presetBody("fr", "bank_account", "2026-12-04")
        assertEquals("create", withDate.getValue("action").jsonPrimitive.content)
        assertEquals("fr", withDate.getValue("course").jsonPrimitive.content)
        assertEquals("bank_account", withDate.getValue("preset").jsonPrimitive.content)
        assertEquals("2026-12-04", withDate.getValue("eventDate").jsonPrimitive.content)
        assertFalse(withDate.containsKey("eventKind"))
        assertFalse(withDate.containsKey("counterpart"))
    }

    @Test fun `adding a date after creation is exactly the shared fixture's adjust body`() {
        assertEquals(fixture.getValue("addDate").jsonObject, RehearsalClient.dateBody("11111111-1111-4111-8111-111111111111", "2026-12-04"))
        assertTrue(RehearsalClient.dateBody("x", null).getValue("eventDate") is kotlinx.serialization.json.JsonNull)
    }

    @Test fun `the client asks for the presets of the course and posts a preset create over the wire`() = runTest {
        val seen = ArrayList<Seen>()
        val r = client(seen, HttpStatusCode.OK, presetsJson).presets("es")
        assertEquals(HttpMethod.Get, seen.single().method)
        assertEquals("/api/rehearsal-presets", seen.single().path)
        assertEquals("course=es", seen.single().query)
        assertEquals(2, (r as RehearsalResult.Ok).value.size)
        val seen2 = ArrayList<Seen>()
        val created = client(seen2, HttpStatusCode.OK, ContentJson.json.parseToJsonElement(fixture.getValue("state").toString()).jsonObject.let { buildJsonObject { put("rehearsal", it.getValue("active")) }.toString() })
            .createFromPreset("en", "talk_to_manager", null)
        assertTrue(created is RehearsalResult.Ok)
        assertEquals(HttpMethod.Post, seen2.single().method)
        assertEquals("/api/rehearsal", seen2.single().path)
        val body = ContentJson.json.parseToJsonElement(seen2.single().body).jsonObject
        assertEquals("talk_to_manager", body.getValue("preset").jsonPrimitive.content)
        assertTrue(body.getValue("eventDate") is kotlinx.serialization.json.JsonNull)
    }

    @Test fun `quick-start refusals map like create's, and an unknown preset is its own error`() = runTest {
        assertEquals(RehearsalResult.Failed(RehearsalError.INVALID_PRESET), client(ArrayList(), HttpStatusCode.BadRequest, """{"error":"invalid_preset"}""").createFromPreset("en", "x", null))
        assertEquals(RehearsalResult.Failed(RehearsalError.INVALID), client(ArrayList(), HttpStatusCode.BadRequest, """{"error":"invalid"}""").createFromPreset("en", "x", null))
        assertEquals(RehearsalResult.Failed(RehearsalError.PAYWALL), client(ArrayList(), HttpStatusCode.PaymentRequired, """{"error":"paywall"}""").createFromPreset("en", "x", null))
        assertEquals(RehearsalResult.Failed(RehearsalError.ACTIVE_EXISTS), client(ArrayList(), HttpStatusCode.Conflict, """{"error":"active_exists"}""").createFromPreset("en", "x", null))
        assertEquals(RehearsalResult.Failed(RehearsalError.NOT_ENABLED), client(ArrayList(), HttpStatusCode.NotFound, """{"error":"not_enabled"}""").presets("en"))
        assertEquals(RehearsalResult.Failed(RehearsalError.FAILED), client(ArrayList(), HttpStatusCode.OK, "{}").presets("en"))
        assertTrue(RehearsalCopy.errorText(RehearsalError.INVALID_PRESET).isNotBlank())
    }

    @Test fun `a past day is its own error with its own line, apart from invalid`() = runTest {
        assertEquals(RehearsalResult.Failed(RehearsalError.INVALID_EVENT_DATE), client(ArrayList(), HttpStatusCode.BadRequest, """{"error":"invalid_event_date"}""").createFromPreset("en", "x", "2020-01-01"))
        assertEquals("Pick today or a later day.", RehearsalCopy.errorText(RehearsalError.INVALID_EVENT_DATE))
    }

    @Test fun `the outcome body carries the choice, and the new date only with a value`() {
        val well = RehearsalClient.outcomeBody("id1", OutcomeChoice.WELL, null)
        assertEquals("outcome", well.getValue("action").jsonPrimitive.content)
        assertEquals("well", well.getValue("choice").jsonPrimitive.content)
        assertFalse(well.containsKey("newDate"))
        val moved = RehearsalClient.outcomeBody("id1", OutcomeChoice.MOVED, "2026-12-04")
        assertEquals("moved", moved.getValue("choice").jsonPrimitive.content)
        assertEquals("2026-12-04", moved.getValue("newDate").jsonPrimitive.content)
        assertEquals(listOf("well", "ok", "hard", "moved"), OutcomeChoice.entries.map { it.wire })
    }

    @Test fun `delete and outcome post to the rehearsal route`() = runTest {
        val seen = ArrayList<Seen>()
        assertEquals(RehearsalResult.Ok(Unit), client(seen, HttpStatusCode.OK, """{"ok":true}""").delete("id1"))
        assertEquals("delete", ContentJson.json.parseToJsonElement(seen.single().body).jsonObject.getValue("action").jsonPrimitive.content)
    }

    // ---------------------------------------------------------------- the entry and the paywall

    private fun state(active: Boolean, free: Boolean): RehearsalState {
        val base = if (active) "state" else "stateEmpty"
        return RehearsalDecoding.state(fixture.getValue(base).toString())!!.copy(freeAvailable = free)
    }

    @Test fun `a non-Pro learner whose free rehearsal is used, with none active, meets the paywall at the entry`() {
        assertEquals(RehearsalEntry.PAYWALL, RehearsalEntry.decide(state(active = false, free = false), isPro = false))
    }

    @Test fun `the entry opens the plan, the intake or the paywall by who the learner is`() {
        assertEquals(RehearsalEntry.PLAN, RehearsalEntry.decide(state(active = true, free = false), isPro = false))
        assertEquals(RehearsalEntry.INTAKE, RehearsalEntry.decide(state(active = false, free = true), isPro = false))
        assertEquals(RehearsalEntry.INTAKE, RehearsalEntry.decide(state(active = false, free = false), isPro = true))
    }

    @Test fun `the paywall sheet names what the learner did from the latest closed rehearsal`() {
        val past = RehearsalDecoding.state(fixture.getValue("state").toString())!!.history.single()
        assertEquals(
            "You rehearsed your meeting with Alphonso (AI): all 3 stages, 6 runs, and 4 mistakes sent to Fix before it sticks. " +
                "A new rehearsal, for a meeting, a landlord or a first day, needs Pro.",
            RehearsalCopy.paywallBody(past),
        )
        assertEquals("1 of 3 stages and 1 run", RehearsalCopy.paywallBody(past.copy(stagesDone = 1, runs = 1, corrections = 0)).substringAfter("(AI): ").substringBefore("."))
        assertEquals("You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro.", RehearsalCopy.paywallBody(null))
    }

    @Test fun `a 402 maps to the paywall error and its words`() {
        assertEquals(RehearsalError.PAYWALL, RehearsalError.of(402, null))
        assertTrue(RehearsalCopy.errorText(RehearsalError.PAYWALL).startsWith("You have used your free rehearsal."))
    }

    // ---------------------------------------------------------------- the words and the feature switch

    @Test fun `the plan and debrief words are the fixed ones`() {
        val today = LocalDate.of(2026, 11, 26)
        assertEquals("Tue 1 Dec · 5 days to go", RehearsalCopy.whenLine("2026-12-01", today))
        assertEquals("Tue 1 Dec · Today", RehearsalCopy.whenLine("2026-12-01", LocalDate.of(2026, 12, 1)))
        assertEquals("Next: The real conversation", RehearsalCopy.nextButton(Stage.CONVERSATION))
        assertEquals("Alphonso · Stage 2 of 3: The real conversation", RehearsalCopy.callSubline(Stage.CONVERSATION))
        assertEquals("Interview rehearsal", RehearsalCopy.callTitle(EventKind.INTERVIEW))
        assertEquals("That was a full interview", RehearsalCopy.debriefHeadline(EventKind.INTERVIEW, Stage.CONVERSATION))
        assertEquals("9 minutes · 14 turns", RehearsalCopy.debriefStats(540, 14))
        assertEquals("Added to Fix before it sticks: 2 items", RehearsalCopy.fixLine(2))
        assertNull(RehearsalCopy.fixLine(0))
        assertEquals("Rehearsal", RehearsalCopy.entryTitle(state(true, false).active))
        assertEquals("Job interview · Tue 1 Dec", RehearsalCopy.entryValue(state(true, false).active))
        assertEquals("a real talk", RehearsalCopy.entryValue(null))
        assertEquals("Move my rehearsal to Fri 4 Dec", RehearsalCopy.moveButton("2026-12-04"))
        assertTrue(RehearsalCopy.PLAN_FOOTER.endsWith("There is no readiness score."))
        assertTrue(RehearsalCopy.DEBRIEF_FOOTER.endsWith("Nothing here is a score."))
    }

    @Test fun `the new date must be after today`() {
        val today = LocalDate.of(2026, 12, 2)
        assertTrue(RehearsalRules.isFutureDay("2026-12-04", today))
        assertFalse(RehearsalRules.isFutureDay("2026-12-02", today))
        assertFalse(RehearsalRules.isFutureDay("2026-12-01", today))
    }

    @Test fun `rehearsals show only when the server says true`() {
        assertTrue(AppConfigFeatures.rehearsals(fixture.getValue("appConfig").toString()))
        assertFalse(AppConfigFeatures.rehearsals("""{"features":{"rehearsals":false}}"""))
        assertFalse(AppConfigFeatures.rehearsals("""{"features":{"rehearsals":"true"}}"""))
        assertFalse(AppConfigFeatures.rehearsals("""{"android":{"minBuild":null}}"""))
        assertFalse(AppConfigFeatures.rehearsals("<html>"))
    }

    @Test fun `the app-config fetch is off on any failure and on only for a true`() = runTest {
        assertTrue(AppConfigFeatures.fetchRehearsals("https://learn.example/", MockEngine { respond(fixture.getValue("appConfig").toString(), HttpStatusCode.OK) }))
        assertFalse(AppConfigFeatures.fetchRehearsals("https://learn.example", MockEngine { respond("x", HttpStatusCode.InternalServerError) }))
        assertFalse(AppConfigFeatures.fetchRehearsals("https://learn.example", MockEngine { throw java.io.IOException("offline") }))
        assertNotNull(Stage.fromWire("hard_moments"))
    }

    @Test fun `the switch is re-read after the ttl so the server kill switch works, and unreadable means off`() = runTest {
        var clock = 0L
        var answer: Boolean? = true
        var reads = 0
        val flag = RehearsalsFlag({ reads++; answer }, { clock }, ttlMs = 300_000)
        assertTrue(flag.enabled())
        answer = false
        clock = 299_999
        assertTrue(flag.enabled())
        assertEquals(1, reads)
        clock = 300_000
        assertFalse(flag.enabled())
        assertEquals(2, reads)
        answer = true
        clock = 700_000
        assertTrue(flag.enabled())
        // Cannot be read: off at once (never the old yes), and asked again next time.
        answer = null
        clock = 1_000_000
        assertFalse(flag.enabled())
        answer = true
        assertTrue(flag.enabled())
        assertEquals(5, reads)
    }
}
