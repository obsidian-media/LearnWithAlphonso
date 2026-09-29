package com.obsidianmedia.learnwithalphonso.ui.hector

import android.app.Activity
import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.billing.BillingPackage
import com.obsidianmedia.learnwithalphonso.billing.BillingPort
import com.obsidianmedia.learnwithalphonso.billing.EntitlementStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.BillingPeriodUnit
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.ui.lesson.GeneratedPracticeViewModel
import com.obsidianmedia.learnwithalphonso.ui.lesson.PracticeStatus
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.InstantRecorder
import com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class HectorAndBillingTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(tutorError: Boolean = false, hang: Boolean = false, practice: String = """{"questions":[{"prompt":"p1","choices":["a","b"],"answerIndex":0,"explanation":"e"},{"prompt":"p2","choices":["c","d"],"answerIndex":1,"explanation":"e2"}]}""") = FakeServer { req ->
        when {
            req.path.endsWith("/api/stt") -> json("""{"text":"hello hector"}""")
            req.path.endsWith("/api/hector-respond") -> if (tutorError) json("""{"detail":"tutor is resting"}""", HttpStatusCode.ServiceUnavailable) else json("""{"request_id":"r","session_id":"s","agent":"tutor","reply":"Hello! Ready to practise?","audio_base64":"AQID","tts_model":"m","tts_provider":"p","language":"en","state":"ok","timings_ms":{"llm":1,"tts":2,"total":3}}""")
            req.path.endsWith("/api/generate-practice") -> { if (hang) delay(5_000); json(practice) }
            req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B2"}]""")
            req.path.endsWith("weakness_events") -> json("""[{"category":"past-tense","event_type":"detected","created_at":"2026-09-01T00:00:00+00:00"}]""")
            else -> json("[]")
        }
    }

    private fun ai(s: FakeServer) = AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine))
    private fun tutor(s: FakeServer) = TutorConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine), "dev-1")

    @Test
    fun `hector primes the tutor once with level and weak spots and keeps it at the head across turns`() = runBlocking {
        // Plan 3 Review Focus 4.
        val s = server()
        val played = ArrayList<Int>()
        val v = HectorViewModel(InstantRecorder(), { true }, tutor(s), ai(s), s.progressClient, ReplyPlayer { b -> played.add(b.size); true }, sessionId = "sess-1")
        awaitTrue("memory") { v.historyForTutor().isNotEmpty() }
        val priming = v.historyForTutor().single()
        assertEquals("user", priming.role)
        assertTrue(priming.content.contains("their current English level is B2"))
        assertTrue(priming.content.contains("past tense"))
        repeat(2) { i -> v.pressBegan(); v.pressEnded(); awaitTrue("turn $i") { v.state.value.phase == ConversationPhase.IDLE && v.state.value.turns.size == 2 * (i + 1) } }
        val bodies = s.seen.filter { it.path.endsWith("/api/hector-respond") }.map { Json.parseToJsonElement(it.body).jsonObject }
        assertEquals(2, bodies.size)
        bodies.forEach { b ->
            assertEquals("sess-1", b["session_id"]!!.jsonPrimitive.content)
            val history = b["history"]!!.jsonArray
            assertEquals(1, history.count { it.jsonObject["content"]!!.jsonPrimitive.content.startsWith("[Background for you") })
            assertTrue(history[0].jsonObject["content"]!!.jsonPrimitive.content.startsWith("[Background for you"))
        }
        // priming + first user turn = 2 entries; priming + 3 turns = 4 on the second call
        assertEquals(2, bodies[0]["history"]!!.jsonArray.size)
        assertEquals(4, bodies[1]["history"]!!.jsonArray.size)
        assertEquals(listOf(3, 3), played)
        assertEquals("dev-1", s.seen.first { it.path.endsWith("/api/hector-respond") }.headers["X-Alphonso-Device-Id"])
    }

    @Test
    fun `a tutor detail error is shown verbatim`() = runBlocking {
        val s = server(tutorError = true)
        val v = HectorViewModel(InstantRecorder(), { true }, tutor(s), ai(s), s.progressClient, ReplyPlayer { true })
        v.pressBegan(); v.pressEnded()
        awaitTrue("error") { v.state.value.error != null }
        assertEquals("tutor is resting", v.state.value.error)
    }

    private class FakePort(var pro: Boolean = false, val failPurchase: Boolean = false) : BillingPort {
        override suspend fun logIn(userId: String) = pro
        override suspend fun isPro() = pro
        override suspend fun packages() = listOf(BillingPackage("monthly", "\$4.99", BillingPeriodUnit.MONTH, 1))
        override suspend fun purchase(activity: Activity, pkg: BillingPackage): Boolean { if (failPurchase) throw IllegalStateException("cancelled"); pro = true; return true }
        override suspend fun restore() = pro
    }

    @Test
    fun `entitlement store without a port reports the build has no subscriptions`() = runBlocking {
        val store = EntitlementStore(null)
        store.login("u1"); store.refresh(); store.loadOffering(); store.restorePurchases()
        assertFalse(store.isPro)
        assertTrue(store.state.value.packages.isEmpty())
        assertEquals("Subscriptions aren't available in this build yet.", store.state.value.error)
    }

    @Test
    fun `entitlement store over a port logs in, lists packages, purchases and reports failures`() = runBlocking {
        val store = EntitlementStore(FakePort())
        store.login("u1")
        assertFalse(store.isPro)
        store.loadOffering()
        assertEquals(listOf("monthly"), store.state.value.packages.map { it.id })
        assertNull(store.state.value.error)
        val failing = EntitlementStore(FakePort(failPurchase = true))
        failing.purchase(FakeActivity, BillingPackage("monthly", "x", null, 1))
        assertEquals("Purchase couldn't be completed. Please try again.", failing.state.value.error)
        assertFalse(failing.isPro)
        val port = FakePort()
        val ok = EntitlementStore(port)
        ok.purchase(FakeActivity, BillingPackage("monthly", "x", null, 1))
        assertTrue(ok.isPro)
        port.pro = true
        val restored = EntitlementStore(port)
        restored.restorePurchases()
        assertTrue(restored.isPro)
    }

    private object FakeActivity : Activity()

    @Test
    fun `generated practice walks questions, reports empty, and maps a timeout`() = runBlocking {
        val v = GeneratedPracticeViewModel(ai(server()), "u1l1", Course.ENGLISH)
        v.generate()
        awaitTrue("ready") { v.state.value.status == PracticeStatus.READY }
        assertEquals(2, v.state.value.questions.size)
        v.pick("a"); v.check(); assertTrue(v.state.value.checked); v.next()
        assertEquals(1, v.state.value.idx)
        v.pick("d"); v.check(); v.next()
        assertTrue(v.state.value.done)
        val empty = GeneratedPracticeViewModel(ai(server(practice = """{"questions":[]}""")), "u1l1", Course.ENGLISH)
        empty.generate()
        awaitTrue("empty") { empty.state.value.status == PracticeStatus.EMPTY }
        // Plan 3 Review Focus 5: a hanging server ends in TIMEOUT, not a spinner (short timeout for the test).
        val slow = ai(server(hang = true))
        val timeout = runCatching { slow.generatePractice("u1l1", "en", timeoutMs = 100) }.exceptionOrNull()
        assertTrue(timeout is com.obsidianmedia.learnwithalphonso.core.net.AiConversationError.Timeout)
    }
}
