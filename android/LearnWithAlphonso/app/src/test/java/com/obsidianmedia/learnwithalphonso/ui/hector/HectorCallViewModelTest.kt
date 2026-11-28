package com.obsidianmedia.learnwithalphonso.ui.hector

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.HectorGreetingVariants
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.InstantRecorder
import com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext

/** A Hector call as a unit: what is sent when it ends, what "Call again" resets, and what the opening line is. */
class HectorCallViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val reply = """{"request_id":"r","session_id":"s","agent":"tutor","reply":"Nice!","audio_base64":"AQID","tts_model":"m","tts_provider":"p","language":"en","state":"ok","timings_ms":{"llm":1,"tts":2,"total":3}}"""

    private fun server(callEnd: String = """{"saved":true,"lines":2}""", callEndStatus: HttpStatusCode = HttpStatusCode.OK, greeting: String? = null) = FakeServer { req ->
        when {
            req.path.endsWith("/api/stt") -> json("""{"text":"hello hector"}""")
            req.path.endsWith("/api/hector-respond") -> json(reply)
            req.path.endsWith("/api/hector-call-end") -> json(callEnd, callEndStatus)
            req.path.endsWith("/api/hector-greeting") -> if (greeting != null) json(greeting) else json("""{"error":"x"}""", HttpStatusCode.ServiceUnavailable)
            req.path.endsWith("/api/analyze-weaknesses") -> json("""{"weaknessesDetected":1}""")
            req.path.endsWith("/api/tts") -> json("mp3")
            req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
            else -> json("[]")
        }
    }

    private fun ai(s: FakeServer) = AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine))
    private fun tutor(s: FakeServer) = TutorConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine), "dev-1")
    private fun bodies(s: FakeServer, suffix: String) = s.seen.filter { it.path.endsWith(suffix) }.map { Json.parseToJsonElement(it.body).jsonObject }

    /** Counts every coroutine the view model hands to its background scope, so "nothing was started" is exact, not a sleep. */
    private class CountingDispatcher : CoroutineDispatcher() {
        val count = AtomicInteger()
        override fun dispatch(context: CoroutineContext, block: Runnable) { count.incrementAndGet(); Dispatchers.IO.dispatch(context, block) }
    }

    private class Fixture(val vm: HectorViewModel, val logs: MutableList<String>, val prefs: MutableMap<String, Int>, val background: CountingDispatcher)

    private fun fixture(s: FakeServer, greetingTimeoutMs: Long = 5_000): Fixture {
        // Copy-on-write: a plain or synchronized list throws ConcurrentModificationException when a test polls it with `any` while the VM logs from another thread.
        val logs: MutableList<String> = java.util.concurrent.CopyOnWriteArrayList()
        val prefs = HashMap<String, Int>()
        val background = CountingDispatcher()
        val vm = HectorViewModel(
            InstantRecorder(), { true }, tutor(s), ai(s), s.progressClient, ReplyPlayer { true }, course = com.obsidianmedia.learnwithalphonso.core.content.Course.ENGLISH,
            hectorLimit = { 150 }, greetingVariants = HectorGreetingVariants({ prefs[it] }, { k, v -> prefs[k] = v }),
            log = { m, _ -> logs.add(m) }, workScope = CoroutineScope(SupervisorJob() + background), greetingTimeoutMs = greetingTimeoutMs,
        )
        return Fixture(vm, logs, prefs, background)
    }

    private suspend fun speak(vm: HectorViewModel, exchanges: Int) {
        val start = vm.state.value.turns.size
        repeat(exchanges) { i ->
            vm.pressBegan(); vm.pressEnded()
            awaitTrue("exchange $i") { vm.state.value.phase == ConversationPhase.IDLE && vm.state.value.turns.size == start + 2 * (i + 1) }
        }
    }

    @Test
    fun `call again is a true new call with a fresh session, an empty thread and a new greeting`() = runBlocking {
        val s = server(greeting = """{"greeting":"Welcome back, Sam","topic":null,"variant":1,"remembered":true}""")
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 1)
        f.vm.hangUp()
        f.vm.startNewCall()
        awaitTrue("new greeting") { f.vm.state.value.turns.map { it.content } == listOf("Welcome back, Sam") }
        assertTrue(f.vm.state.value.openerIndices == setOf(0))
        speak(f.vm, 1)
        val respond = bodies(s, "/api/hector-respond")
        assertEquals(2, respond.size)
        assertNotEquals("a new tutor session", respond[0]["session_id"]!!.jsonPrimitive.content, respond[1]["session_id"]!!.jsonPrimitive.content)
        // The old call's turns are not in the new call's history: only its own greeting is.
        assertEquals(1, respond[1]["history"]!!.jsonArray.size)
    }

    @Test
    fun `hang-up sends the call to Hector's memory once, with a call id, and says it was saved`() = runBlocking {
        val s = server()
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 3)
        f.vm.hangUp()
        awaitTrue("sent") { bodies(s, "/api/hector-call-end").size == 1 }
        awaitTrue("saved") { f.vm.savedToMemory.value }
        val body = bodies(s, "/api/hector-call-end").single()
        assertEquals("en", body["course"]!!.jsonPrimitive.content)
        assertEquals("B1", body["cefrLevel"]!!.jsonPrimitive.content)
        assertEquals("the whole call, greeting included", 7, body["messages"]!!.jsonArray.size)
        assertTrue(body["callId"]!!.jsonPrimitive.content.isNotEmpty())
        // Leaving the screen afterwards (and the view model going away) sends nothing more for this call.
        val started = f.background.count.get()
        f.vm.onLeave(); f.vm.onCleared()
        assertEquals("nothing more is started for this call", started, f.background.count.get())
        assertEquals(1, bodies(s, "/api/hector-call-end").size)
        assertEquals("call-end already recorded the weakness events: no separate analysis", 0, bodies(s, "/api/analyze-weaknesses").size)
    }

    @Test
    fun `a new call after Call again gets its own call end with a different call id`() = runBlocking {
        val s = server()
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 3); f.vm.hangUp()
        awaitTrue("first") { bodies(s, "/api/hector-call-end").size == 1 }
        f.vm.startNewCall()
        awaitTrue("regreeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 3); f.vm.hangUp()
        awaitTrue("second") { bodies(s, "/api/hector-call-end").size == 2 }
        val ids = bodies(s, "/api/hector-call-end").map { it["callId"]!!.jsonPrimitive.content }
        assertNotEquals(ids[0], ids[1])
        assertEquals("the second call's transcript is its own", 7, bodies(s, "/api/hector-call-end")[1]["messages"]!!.jsonArray.size)
    }

    @Test
    fun `a short call sends nothing to Hector's memory`() = runBlocking {
        val s = server()
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 2)
        f.vm.hangUp()
        // Too short for call-end: the weakness analysis is the fallback, and no call-end is ever sent.
        awaitTrue("fallback analysis") { bodies(s, "/api/analyze-weaknesses").size == 1 }
        assertTrue(bodies(s, "/api/hector-call-end").isEmpty())
        assertFalse(f.vm.savedToMemory.value)
    }

    @Test
    fun `leaving the screen mid-call analyses it, but a rotation does not`() = runBlocking {
        val s = server()
        val f = fixture(s)
        speak(f.vm, 2)
        f.vm.onLeave(configChange = true)
        assertEquals("a rotation starts no background work", 0, f.background.count.get())
        f.vm.onLeave()
        awaitTrue("analysed on leaving") { bodies(s, "/api/analyze-weaknesses").size == 1 }
    }

    @Test
    fun `failures and unsaved calls are logged with a reason, never swallowed`() = runBlocking {
        val s = server(callEnd = """{"error":"quota-exceeded"}""", callEndStatus = HttpStatusCode.TooManyRequests)
        val f = fixture(s)
        speak(f.vm, 3)
        f.vm.hangUp()
        awaitTrue("call-end failure logged") { f.logs.any { it.contains("hector-call-end failed: reason=quota") } }

        val unsaved = server(callEnd = """{"saved":false,"reason":"not_pro"}""")
        val g = fixture(unsaved)
        speak(g.vm, 3)
        g.vm.hangUp()
        awaitTrue("unsaved logged") { g.logs.any { it.contains("hector-call-end not saved: reason=not_pro") } }
        assertFalse(g.vm.savedToMemory.value)
    }

    @Test
    fun `the weakness analysis failure is logged with its reason`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("/api/stt") -> json("""{"text":"hello hector"}""")
                req.path.endsWith("/api/hector-respond") -> json(reply)
                req.path.endsWith("/api/analyze-weaknesses") -> json("""{"error":"ai-consent-required"}""", HttpStatusCode.Forbidden)
                else -> json("[]")
            }
        }
        val f = fixture(s)
        speak(f.vm, 2)
        f.vm.hangUp()
        awaitTrue("logged") { f.logs.any { it.contains("analyze-weaknesses failed: reason=consent") } }
    }

    @Test
    fun `the server greeting is used and its variant sent back next time, and a failure falls back to the local template`() = runBlocking {
        val s = server(greeting = """{"greeting":"Hi Sam, how was the trip?","topic":"travel","variant":2,"remembered":true}""")
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("server greeting") { f.vm.state.value.turns.singleOrNull()?.content == "Hi Sam, how was the trip?" }
        assertEquals(2, f.prefs["hector.greetingVariant.en"])
        f.vm.startNewCall()
        awaitTrue("again") { bodies(s, "/api/hector-greeting").size == 2 }
        assertEquals(2, bodies(s, "/api/hector-greeting")[1]["lastVariant"]!!.jsonPrimitive.content.toInt())

        val down = server(greeting = null)
        val g = fixture(down)
        g.vm.greet()
        awaitTrue("local greeting") { g.vm.state.value.turns.size == 1 }
        assertFalse("the local template, not a server line", g.vm.state.value.turns.single().content.contains("trip"))
        awaitTrue("fallback logged") { g.logs.any { it.contains("hector-greeting fell back to the local greeting") } }
    }

    @Test
    fun `leaving mid-call saves it, and talking again after returning is saved as a new call with only the new turns`() = runBlocking {
        val s = server()
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        speak(f.vm, 3)
        f.vm.onLeave()
        awaitTrue("first sent") { bodies(s, "/api/hector-call-end").size == 1 }
        speak(f.vm, 3)
        f.vm.hangUp()
        awaitTrue("second sent") { bodies(s, "/api/hector-call-end").size == 2 }
        val sent = bodies(s, "/api/hector-call-end")
        assertNotEquals(sent[0]["callId"]!!.jsonPrimitive.content, sent[1]["callId"]!!.jsonPrimitive.content)
        assertEquals(7, sent[0]["messages"]!!.jsonArray.size)
        assertEquals("only the turns since the leave", 6, sent[1]["messages"]!!.jsonArray.size)
    }

    @Test
    fun `a call end that succeeded needs no analysis, but an error, a 429 or an unsaved call falls back to it`() = runBlocking {
        val kept = server()
        val a = fixture(kept)
        speak(a.vm, 3); a.vm.hangUp()
        awaitTrue("kept") { a.logs.any { it.contains("hector-call-end kept") } }
        assertTrue(bodies(kept, "/api/analyze-weaknesses").isEmpty())

        val already = server(callEnd = """{"saved":false,"reason":"already_saved"}""")
        val b = fixture(already)
        speak(b.vm, 3); b.vm.hangUp()
        awaitTrue("kept") { b.logs.any { it.contains("hector-call-end kept") } }
        assertTrue("already_saved is a success: no analysis", bodies(already, "/api/analyze-weaknesses").isEmpty())

        for ((name, callEnd, status) in listOf(
            Triple("429", """{"error":"quota-exceeded"}""", HttpStatusCode.TooManyRequests),
            Triple("no_recap", """{"saved":false,"reason":"no_recap"}""", HttpStatusCode.OK),
            Triple("write_failed", """{"saved":false,"reason":"write_failed"}""", HttpStatusCode.OK),
            Triple("not_configured", """{"saved":false,"reason":"not_configured"}""", HttpStatusCode.OK),
            Triple("503", """{"error":"switch"}""", HttpStatusCode.ServiceUnavailable),
        )) {
            val s = server(callEnd = callEnd, callEndStatus = status)
            val f = fixture(s)
            speak(f.vm, 3); f.vm.hangUp()
            awaitTrue("fallback analysis after $name") { bodies(s, "/api/analyze-weaknesses").size == 1 }
        }
    }


    @Test
    fun `a reply that arrives after Call again is dropped, not added to the new call`() = runBlocking {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = FakeServer { req ->
            when {
                req.path.endsWith("/api/stt") -> json("""{"text":"hello hector"}""")
                req.path.endsWith("/api/hector-respond") -> { gate.await(); json(reply.replace("Nice!", "Late reply from the old call")) }
                req.path.endsWith("/api/hector-greeting") -> json("""{"error":"x"}""", HttpStatusCode.ServiceUnavailable)
                req.path.endsWith("/api/tts") -> json("mp3")
                req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
                else -> json("[]")
            }
        }
        val f = fixture(s)
        f.vm.greet()
        awaitTrue("greeted") { f.vm.state.value.turns.size == 1 }
        f.vm.pressBegan(); f.vm.pressEnded()
        awaitTrue("thinking") { f.vm.state.value.phase == ConversationPhase.THINKING }
        f.vm.hangUp()
        f.vm.startNewCall()
        awaitTrue("new greeting") { f.vm.state.value.turns.size == 1 }
        gate.complete(Unit)
        awaitTrue("the stale reply was seen and dropped") { f.logs.any { it.contains("dropped a reply that belongs to an earlier call") } }
        assertEquals(listOf("assistant"), f.vm.state.value.turns.map { it.role })
        assertFalse(f.vm.state.value.turns.any { it.content.contains("Late reply") })
    }

    @Test
    fun `a slow greeting request gives way to the local greeting`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("/api/hector-greeting") -> { kotlinx.coroutines.delay(3_000); json("""{"greeting":"Too late","topic":null,"variant":1,"remembered":true}""") }
                req.path.endsWith("/api/tts") -> json("mp3")
                req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
                else -> json("[]")
            }
        }
        val f = fixture(s, greetingTimeoutMs = 100)
        f.vm.greet()
        awaitTrue("local greeting") { f.vm.state.value.turns.size == 1 }
        assertFalse(f.vm.state.value.turns.single().content.contains("Too late"))
        assertTrue(f.logs.any { it.contains("hector-greeting fell back to the local greeting: reason=network") })
        assertEquals("a timed-out greeting changes no variant", null, f.prefs["hector.greetingVariant.en"])
    }
}
