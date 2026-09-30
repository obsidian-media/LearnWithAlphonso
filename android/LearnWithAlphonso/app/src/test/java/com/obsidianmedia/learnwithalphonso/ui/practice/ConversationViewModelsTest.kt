package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.testContent
import com.obsidianmedia.learnwithalphonso.ui.lesson.SpeakQuestionViewModel
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** A recorder that "captures" a fixed number of bytes instantly. */
class InstantRecorder(private val bytes: Int = 8_000) : RecorderPort {
    var cancelled = 0
    override fun start() {}
    override fun remainingMillisToMinimumDuration(): Long? = null
    override fun elapsedMillis(): Long? = 500
    override suspend fun stop(): ByteArray? = ByteArray(bytes)
    override fun cancelIfRecording() { cancelled++ }
}

class ConversationViewModelsTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(transcript: String = "I would like a coffee", chatError: Boolean = false) = FakeServer { req ->
        when {
            req.path.endsWith("/api/stt") -> json("""{"text":"$transcript","confidence":0.9}""")
            req.path.endsWith("/api/chat") -> if (chatError) json("""{"error":"AI quota reached for today"}""", HttpStatusCode.TooManyRequests) else json("""{"content":"Certainly, what size?"}""")
            req.path.endsWith("/api/tts") -> respond(byteArrayOf(1, 2, 3), HttpStatusCode.OK)
            req.path.endsWith("/api/analyze-weaknesses") -> json("""{"weaknessesDetected":1}""")
            req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
            else -> json("[]")
        }
    }

    private fun ai(s: FakeServer) = AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine))
    private val played = ArrayList<Int>()
    private val player = ReplyPlayer { b -> played.add(b.size); true }

    private fun scenarioVm(s: FakeServer) = ScenarioConversationViewModel(testContent.scenarios.first(), InstantRecorder(), { true }, ai(s), s.progressClient, player)

    @Test
    fun `a turn transcribes, chats with the scenario prompt and level, speaks the reply and plays it`() = runBlocking {
        val s = server()
        val v = scenarioVm(s)
        awaitTrue("level") { v.state.value.cefrLevel == "B1" }
        assertEquals(1, v.state.value.turns.size)
        v.pressBegan(); v.pressEnded()
        awaitTrue("reply") { v.state.value.turns.size == 3 && v.state.value.phase == ConversationPhase.IDLE }
        assertEquals(listOf("assistant", "user", "assistant"), v.state.value.turns.map { it.role })
        assertEquals("I would like a coffee", v.state.value.turns[1].content)
        assertEquals(0.9, v.state.value.confidenceByTurn[1]!!, 1e-9)
        val chat = s.seen.first { it.path.endsWith("/api/chat") }
        assertTrue(chat.body.contains(""""systemPrompt":"${v.scenario.systemPrompt.take(20)}"""))
        assertTrue(chat.body.contains(""""cefrLevel":"B1""""))
        assertEquals(listOf(3), played)
        assertNull(v.state.value.error)
    }

    @Test
    fun `a server error message from chat is shown verbatim`() = runBlocking {
        val v = scenarioVm(server(chatError = true))
        v.pressBegan(); v.pressEnded()
        awaitTrue("error") { v.state.value.error != null }
        assertEquals("AI quota reached for today", v.state.value.error)
        assertEquals(2, v.state.value.turns.size)
    }

    @Test
    fun `clearing analyses only once and only after four turns, while a compose leave only cancels`() = runBlocking {
        val short = server()
        val v = scenarioVm(short)
        v.onCleared()
        Thread.sleep(200)
        assertFalse(short.seen.any { it.path.endsWith("analyze-weaknesses") })
        val long = server()
        val v2 = scenarioVm(long)
        repeat(2) { v2.pressBegan(); v2.pressEnded(); awaitTrue("turn") { v2.state.value.phase == ConversationPhase.IDLE && v2.state.value.turns.size == 1 + 2 * (it + 1) } }
        v2.onLeave() // a rotation: nothing analysed, the transcript survives
        Thread.sleep(100)
        assertEquals(0, long.seen.count { it.path.endsWith("analyze-weaknesses") })
        assertEquals(5, v2.state.value.turns.size)
        v2.onCleared(); v2.onCleared()
        awaitTrue("analysed") { long.seen.count { it.path.endsWith("analyze-weaknesses") } == 1 }
        Thread.sleep(200)
        assertEquals(1, long.seen.count { it.path.endsWith("analyze-weaknesses") })
    }

    @Test
    fun `campaign continue is gated per scene, restart keeps the opener, last scene finishes`() = runBlocking {
        val campaign = testContent.campaigns.first()
        val s = server()
        val v = CampaignConversationViewModel(campaign, InstantRecorder(), { true }, ai(s), s.progressClient, player)
        assertFalse(v.canContinue)
        v.continueToNextScene()
        assertEquals(0, v.campaignState.value.sceneIndex)
        repeat(campaign.scenes[0].minTurns) { i -> v.pressBegan(); v.pressEnded(); awaitTrue("turn $i") { v.state.value.phase == ConversationPhase.IDLE && v.state.value.turns.size == 1 + 2 * (i + 1) } }
        assertTrue(v.canContinue)
        val chat = s.seen.first { it.path.endsWith("/api/chat") }
        assertTrue(chat.body.contains(campaign.premise.take(15)))
        if (campaign.scenes.size > 1) {
            v.continueToNextScene()
            assertEquals(1, v.campaignState.value.sceneIndex)
            assertEquals(campaign.scenes[1].opener, v.state.value.turns.last().content)
            assertFalse("new scene starts with zero user turns", v.canContinue)
            v.pressBegan(); v.pressEnded(); awaitTrue("scene 2 turn") { v.state.value.phase == ConversationPhase.IDLE && v.state.value.turns.size == v.campaignState.value.sceneAnchor + 3 }
            v.restartScene()
            assertEquals(campaign.scenes[1].opener, v.state.value.turns.last().content)
            assertEquals(v.campaignState.value.sceneAnchor + 1, v.state.value.turns.size)
        }
        while (!v.campaignState.value.finished) {
            val already = v.userTurnsInScene
            repeat(v.scene.minTurns - already) { i -> v.pressBegan(); v.pressEnded(); awaitTrue("fill $i") { v.state.value.phase == ConversationPhase.IDLE && v.userTurnsInScene == already + i + 1 } }
            assertTrue(v.canContinue)
            v.continueToNextScene()
        }
        assertTrue(v.campaignState.value.finished)
    }

    @Test
    fun `speak question sets picked from a real transcript and never from silence`() = runBlocking {
        // Plan 3 Review Focus 2.
        var picked: String? = null
        val s = server(transcript = "she is a doctor")
        val v = SpeakQuestionViewModel(InstantRecorder(), { true }, ai(s), Course.ENGLISH) { picked = it }
        v.pressBegan(); v.pressEnded()
        awaitTrue("heard") { v.state.value.heard != null }
        assertEquals("she is a doctor", picked)
        val silent = SpeakQuestionViewModel(InstantRecorder(bytes = 10), { true }, ai(server()), Course.ENGLISH) { picked = it }
        picked = null
        silent.pressBegan(); silent.pressEnded()
        awaitTrue("empty") { silent.state.value.error != null }
        assertNull(picked)
        val denied = SpeakQuestionViewModel(InstantRecorder(), { false }, ai(server()), Course.ENGLISH) { }
        denied.pressBegan()
        awaitTrue("denied") { denied.state.value.micUnavailable }
    }
}
