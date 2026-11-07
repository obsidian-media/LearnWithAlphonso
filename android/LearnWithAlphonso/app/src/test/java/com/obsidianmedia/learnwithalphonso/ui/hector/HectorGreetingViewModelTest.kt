package com.obsidianmedia.learnwithalphonso.ui.hector

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.InstantRecorder
import com.obsidianmedia.learnwithalphonso.ui.practice.OpenerSpeechCache
import com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CompletableDeferred
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
import java.time.Instant

/** Hector speaks first (BACKLOG 0.0-bp): the greeting he says when a call opens. */
class HectorGreetingViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val recent = Instant.now().minusSeconds(2 * 86_400).toString()
    private val withWeakSpot = "Hi Sam! Last time the past tense tripped you up. Want to practice that in conversation?"
    private val generic = "Hi Sam! Good to see you. What's been happening lately? Tell me about it."

    private fun server(weakSpot: Boolean = true, ttsFails: Boolean = false) = FakeServer { req ->
        when {
            req.path.endsWith("/api/tts") -> if (ttsFails) json("""{"error":"x"}""", HttpStatusCode.InternalServerError) else json("mp3")
            req.path.endsWith("/api/stt") -> json("""{"text":"yes please"}""")
            req.path.endsWith("/api/hector-respond") -> json("""{"request_id":"r","session_id":"s","agent":"tutor","reply":"Great! What did you do yesterday?","audio_base64":"AQID","tts_model":"m","tts_provider":"p","language":"en","state":"ok","timings_ms":{"llm":1,"tts":2,"total":3}}""")
            req.path.endsWith("get_my_name_status") -> json("""[{"display_name":"Sam","name_confirmed_at":"2026-10-01T00:00:00+00:00"}]""")
            req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
            req.path.endsWith("weakness_events") -> json(if (weakSpot) """[{"category":"past-tense","event_type":"detected","created_at":"$recent"}]""" else "[]")
            else -> json("[]")
        }
    }

    private fun ai(s: FakeServer) = AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine))
    private fun tutor(s: FakeServer) = TutorConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine), "dev-1")
    private fun tts(s: FakeServer) = s.seen.filter { it.path.endsWith("/api/tts") }.map { Json.parseToJsonElement(it.body).jsonObject }

    private fun vm(s: FakeServer, player: ReplyPlayer = ReplyPlayer { true }, cache: OpenerSpeechCache = OpenerSpeechCache()) =
        HectorViewModel(
            InstantRecorder(), { true }, tutor(s), ai(s), s.progressClient, player, course = Course.ENGLISH,
            hectorVoice = { "aura-2-atlas-en" }, openerCache = cache,
        )

    @Test
    fun `the call start greets by name, names the weak spot, and says it in Hector's voice`() = runBlocking {
        val s = server()
        val played = ArrayList<Int>()
        val v = vm(s, ReplyPlayer { played.add(it.size); true })
        assertTrue("nothing is said before the screen asks", tts(s).isEmpty())
        v.greet()
        awaitTrue("greeting played") { played.isNotEmpty() && v.state.value.phase == ConversationPhase.IDLE }
        assertEquals(listOf(ChatMessage("assistant", withWeakSpot)), v.state.value.turns)
        val body = tts(s).single()
        assertEquals(withWeakSpot, body["text"]!!.jsonPrimitive.content)
        assertEquals("aura-2-atlas-en", body["voice"]!!.jsonPrimitive.content)
        assertEquals("hector", body["character"]!!.jsonPrimitive.content)
        assertEquals(setOf(0), v.state.value.openerIndices)
    }

    @Test
    fun `without a recent weak spot it is the generic greeting`() = runBlocking {
        val s = server(weakSpot = false)
        val v = vm(s)
        v.greet()
        awaitTrue("greeting") { v.state.value.turns.isNotEmpty() }
        assertEquals(generic, v.state.value.turns.single().content)
    }

    @Test
    fun `the greeting is in the history the tutor gets with the learner's first turn`() = runBlocking {
        val s = server()
        val v = vm(s)
        v.greet()
        awaitTrue("greeted") { tts(s).isNotEmpty() && v.state.value.phase == ConversationPhase.IDLE }
        v.pressBegan(); v.pressEnded()
        awaitTrue("reply") { v.state.value.turns.size == 3 && v.state.value.phase == ConversationPhase.IDLE }
        val body = Json.parseToJsonElement(s.seen.first { it.path.endsWith("/api/hector-respond") }.body).jsonObject
        val history = body["history"]!!.jsonArray.map { it.jsonObject }
        assertTrue(history.any { it["role"]!!.jsonPrimitive.content == "assistant" && it["content"]!!.jsonPrimitive.content == withWeakSpot })
        assertEquals("yes please", body["text"]!!.jsonPrimitive.content)
        assertNull("answered: not said again", v.pendingGreeting)
    }

    @Test
    fun `holding to talk cuts the greeting off`() = runBlocking {
        val s = server()
        val gate = CompletableDeferred<Unit>()
        var started = 0
        val v = vm(s, ReplyPlayer { started++; gate.await(); true })
        v.greet()
        awaitTrue("speaking") { started == 1 && v.state.value.phase == ConversationPhase.SPEAKING }
        v.pressBegan()
        assertEquals(ConversationPhase.IDLE, v.state.value.phase)
        v.pressEnded()
        gate.complete(Unit)
        awaitTrue("reply") { v.state.value.turns.size == 3 && v.state.value.phase == ConversationPhase.IDLE }
    }

    @Test
    fun `a second call says the greeting again from the cache, not from TTS`() = runBlocking {
        val s = server()
        val cache = OpenerSpeechCache()
        repeat(2) { i ->
            val played = ArrayList<Int>()
            val v = vm(s, ReplyPlayer { played.add(it.size); true }, cache)
            v.greet()
            awaitTrue("call $i") { played.size == 1 && v.state.value.phase == ConversationPhase.IDLE }
        }
        assertEquals(1, tts(s).size)
    }

    @Test
    fun `a conversation already underway is not greeted`() = runBlocking {
        val s = server()
        val v = vm(s)
        v.pressBegan(); v.pressEnded()
        awaitTrue("turn") { v.state.value.turns.size == 2 && v.state.value.phase == ConversationPhase.IDLE }
        v.greet()
        Thread.sleep(200)
        assertFalse(v.state.value.turns.any { it.content == withWeakSpot })
        assertTrue(tts(s).isEmpty())
    }
}
