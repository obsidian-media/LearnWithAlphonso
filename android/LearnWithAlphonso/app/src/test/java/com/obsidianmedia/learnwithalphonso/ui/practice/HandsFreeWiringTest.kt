package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.PauseReason
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Status
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VoicePhase
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationClient
import com.obsidianmedia.learnwithalphonso.testContent
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorViewModel
import com.obsidianmedia.learnwithalphonso.ui.practice.call.HandsFreeBinding
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Hands-free as the call view models wire it (the loop itself is HandsFreeLoopTest in core): the switch is off at every
 * call start, Practice and Hector get their own end-of-turn silence, the mic opens only after the reply has finished
 * playing, and every safety stop pauses without sending anything.
 */
class HandsFreeWiringTest {
    @get:Rule val main = MainDispatcherRule()

    /** A recorder that counts how many times the mic was opened and cancelled. */
    private class CountingRecorder(private val bytes: Int = 8_000) : RecorderPort {
        @Volatile var started = 0
        @Volatile var cancelled = 0
        override fun start() { started++ }
        override fun remainingMillisToMinimumDuration(): Long? = null
        override fun elapsedMillis(): Long? = 500
        override suspend fun stop(): ByteArray? = ByteArray(bytes)
        override fun cancelIfRecording() { cancelled++ }
    }

    private fun server(transcript: String = "I would like a coffee", chatError: Boolean = false, hectorError: Boolean = false) = FakeServer { req ->
        when {
            req.path.endsWith("/api/stt") -> json("""{"text":"$transcript","confidence":0.9}""")
            req.path.endsWith("/api/chat") -> if (chatError) json("""{"error":"quota-exceeded","resetsAt":null,"message":"AI quota reached for today"}""", HttpStatusCode.TooManyRequests) else json("""{"content":"Certainly, what size?"}""")
            req.path.endsWith("/api/hector-respond") && hectorError -> json("""{"error":"boom"}""", HttpStatusCode.InternalServerError)
            req.path.endsWith("/api/hector-respond") -> json("""{"request_id":"r","session_id":"s","agent":"tutor","reply":"Great! What did you do yesterday?","audio_base64":"AQID","tts_model":"m","tts_provider":"p","language":"en","state":"ok","timings_ms":{"llm":1,"tts":2,"total":3}}""")
            req.path.endsWith("/api/tts") -> respond(byteArrayOf(1, 2, 3), HttpStatusCode.OK)
            req.path.endsWith("/api/analyze-weaknesses") -> json("""{"weaknessesDetected":1}""")
            req.query["select"] == "cefr_level" -> json("""[{"cefr_level":"B1"}]""")
            else -> json("[]")
        }
    }

    private fun ai(s: FakeServer) = AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine))
    private fun tutor(s: FakeServer) = TutorConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine), "dev-1")
    private fun count(s: FakeServer, suffix: String) = s.seen.count { it.path.endsWith(suffix) }

    private fun scenarioVm(s: FakeServer, recorder: RecorderPort, player: ReplyPlayer = ReplyPlayer { true }) =
        ScenarioConversationViewModel(testContent.scenarios.first(), recorder, { true }, ai(s), s.progressClient, player)

    private fun hectorVm(s: FakeServer, recorder: RecorderPort, player: ReplyPlayer = ReplyPlayer { true }) =
        HectorViewModel(recorder, { true }, tutor(s), ai(s), s.progressClient, player, course = Course.ENGLISH, hectorVoice = { null }, openerCache = OpenerSpeechCache(), hectorLimit = { 150 })

    /** The running clock of the level samples: one turn follows another, so time only moves forward. */
    private var clock = 0.0

    private fun feed(vm: com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation, level: Double, seconds: Double) {
        var t = 0.0
        while (t < seconds - 1e-9) {
            vm.handsFree.level(level, clock)
            clock += 0.1
            t += 0.1
        }
    }

    private fun listening(vm: com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation) =
        awaitTrue("listening") { vm.handsFree.status.value == Status.Listening && vm.engine.phase.value == TurnPhase.RECORDING }

    /** One spoken turn: half a second of room, a second of speech. The caller feeds the quiet that ends it. */
    private fun speak(vm: com.obsidianmedia.learnwithalphonso.ui.practice.call.CallConversation) {
        feed(vm, -60.0, 0.5)
        feed(vm, -20.0, 1.0)
    }

    @Test
    fun `hands-free is off when a call starts, on every screen, and Practice and Hector are tuned apart`() {
        val s = server()
        val scenario = scenarioVm(s, CountingRecorder())
        val campaign = CampaignConversationViewModel(testContent.campaigns.first(), CountingRecorder(), { true }, ai(s), s.progressClient, ReplyPlayer { true })
        val hector = hectorVm(s, CountingRecorder())
        for (vm in listOf(scenario, campaign, hector)) {
            assertEquals(Status.Off, vm.handsFree.status.value)
            assertFalse(vm.handsFree.isOn)
        }
        assertEquals(2.5, scenario.handsFree.tuning.endOfTurnSilence, 0.0)
        assertEquals(2.5, campaign.handsFree.tuning.endOfTurnSilence, 0.0)
        assertEquals(1.2, hector.handsFree.tuning.endOfTurnSilence, 0.0)
        assertEquals(HandsFreeLoop.Tuning.PRACTICE, scenario.handsFree.tuning)
        assertEquals(HandsFreeLoop.Tuning.HECTOR, hector.handsFree.tuning)
    }

    @Test
    fun `a Practice turn waits 2 point 5 seconds of quiet, a Hector turn 1 point 2`() = runBlocking {
        val s = server()
        val practice = scenarioVm(s, CountingRecorder())
        practice.handsFree.enable(); listening(practice)
        speak(practice)
        feed(practice, -60.0, 1.5)
        assertEquals("1.5 s of quiet: Practice is still waiting for the rest of the sentence", TurnPhase.RECORDING, practice.engine.phase.value)
        assertEquals(0, count(s, "/api/stt"))
        feed(practice, -60.0, 1.2)
        awaitTrue("practice turn sent") { count(s, "/api/stt") == 1 }

        val hector = hectorVm(server(), CountingRecorder())
        val hs = hector
        hs.handsFree.enable(); listening(hs)
        speak(hs)
        feed(hs, -60.0, 1.5)
        awaitTrue("hector turn sent after 1.2 s") { hs.state.value.turns.any { it.role == "user" } }
    }

    @Test
    fun `the mic opens only after the reply has finished playing`() = runBlocking {
        val s = server()
        val release = CompletableDeferred<Unit>()
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder, ReplyPlayer { release.await(); true })
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 3.0)
        awaitTrue("reply is being played") { vm.state.value.phase == ConversationPhase.SPEAKING && count(s, "/api/tts") == 1 }
        Thread.sleep(300)
        assertEquals("one mic opening so far: the reply is still playing", 1, recorder.started)
        assertEquals(TurnPhase.IDLE, vm.engine.phase.value)
        assertEquals(Status.Waiting, vm.handsFree.status.value)
        release.complete(Unit)
        awaitTrue("the next turn listens") { recorder.started == 2 && vm.handsFree.status.value == Status.Listening }
    }

    @Test
    fun `nobody speaking cancels the turn, sends nothing and pauses`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        feed(vm, -60.0, 8.3)
        awaitTrue("paused") { vm.handsFree.status.value == Status.Paused(PauseReason.NO_SPEECH) }
        awaitTrue("mic closed") { vm.engine.phase.value == TurnPhase.IDLE }
        assertEquals(1, recorder.cancelled)
        assertEquals(0, count(s, "/api/stt"))
        Thread.sleep(200)
        assertEquals("a pause never reopens the mic by itself", 1, recorder.started)
    }

    @Test
    fun `thirty seconds of sound is cancelled, never sent`() = runBlocking {
        val s = server()
        val vm = scenarioVm(s, CountingRecorder())
        vm.handsFree.enable(); listening(vm)
        feed(vm, -20.0, 30.3)
        awaitTrue("paused after a long turn") { vm.handsFree.status.value == Status.Paused(PauseReason.LONG_TURN) }
        assertEquals(0, count(s, "/api/stt"))
    }

    @Test
    fun `a blank transcript pauses on noise instead of listening again, with no error banner`() = runBlocking {
        val s = server(transcript = "  ")
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 3.0)
        awaitTrue("paused on noise") { vm.handsFree.status.value == Status.Paused(PauseReason.NO_WORDS) }
        awaitTrue("phase back to idle") { vm.state.value.phase == ConversationPhase.IDLE }
        assertNull("hands-free's own line says what happened", vm.state.value.error)
        assertEquals(0, count(s, "/api/chat"))
        Thread.sleep(200)
        assertEquals(1, recorder.started)
    }

    @Test
    fun `without hands-free a blank transcript still says it did not catch that`() = runBlocking {
        val s = server(transcript = "  ")
        val vm = scenarioVm(s, CountingRecorder())
        vm.pressBegan(); vm.pressEnded()
        awaitTrue("message") { vm.state.value.error == "Didn't catch that. Try again." }
    }

    @Test
    fun `a capture too short to use just listens again, as on iOS`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder(bytes = 100)
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 3.0)
        awaitTrue("a second turn opens") { recorder.started == 2 && vm.handsFree.status.value == Status.Listening }
        assertNull(vm.state.value.error)
        assertEquals(0, count(s, "/api/stt"))
    }

    @Test
    fun `a failed reply pauses and never retries by itself`() = runBlocking {
        val s = server(chatError = true)
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 3.0)
        awaitTrue("paused after a problem") { vm.handsFree.status.value == Status.Paused(PauseReason.FAILURE) }
        Thread.sleep(200)
        assertEquals(1, recorder.started)
    }

    @Test
    fun `twenty turns without a touch pause, and a tap resumes`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder(bytes = 100) // each turn ends at once as too short, so twenty fit in a test
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable()
        for (turn in 1..20) {
            awaitTrue("turn $turn open") { recorder.started == turn && vm.handsFree.status.value == Status.Listening }
            speak(vm); feed(vm, -60.0, 3.0)
        }
        awaitTrue("paused at the limit") { vm.handsFree.status.value == Status.Paused(PauseReason.TURN_LIMIT) }
        assertEquals(20, recorder.started)
        vm.handsFree.togglePause()
        awaitTrue("a touch resumes") { recorder.started == 21 }
    }

    @Test
    fun `Hector's hands-free sends the turn to the tutor and listens again after his reply`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder()
        val vm = hectorVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 2.0)
        awaitTrue("tutor called") { count(s, "/api/hector-respond") == 1 }
        awaitTrue("next turn") { recorder.started == 2 && vm.handsFree.status.value == Status.Listening }
    }

    @Test
    fun `a failed Hector reply pauses and never retries by itself`() = runBlocking {
        val s = server(hectorError = true)
        val recorder = CountingRecorder()
        val vm = hectorVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        speak(vm); feed(vm, -60.0, 2.0)
        awaitTrue("paused after a problem") { vm.handsFree.status.value == Status.Paused(PauseReason.FAILURE) }
        Thread.sleep(200)
        assertEquals(1, recorder.started)
    }

    @Test
    fun `leaving the screen turns hands-free off and drops an open recording`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        vm.onLeave()
        assertEquals(Status.Off, vm.handsFree.status.value)
        awaitTrue("mic closed") { vm.engine.phase.value == TurnPhase.IDLE }
        val hector = hectorVm(server(), CountingRecorder())
        hector.handsFree.enable(); listening(hector)
        hector.hangUp()
        assertEquals(Status.Off, hector.handsFree.status.value)
    }

    @Test
    fun `an interruption pauses and drops an open recording but leaves a reply alone`() = runBlocking {
        val s = server()
        val recorder = CountingRecorder()
        val vm = scenarioVm(s, recorder)
        vm.handsFree.enable(); listening(vm)
        HandsFreeBinding.interrupted(vm.handsFree, vm.engine)
        awaitTrue("paused") { vm.handsFree.status.value == Status.Paused(PauseReason.INTERRUPTED) }
        awaitTrue("mic closed") { vm.engine.phase.value == TurnPhase.IDLE }
        assertEquals(1, recorder.cancelled)
        assertEquals(0, count(s, "/api/stt"))
    }

    @Test
    fun `campaign hands-free carries to the next scene, and a restart or ending forgets it`() = runBlocking {
        val campaign = testContent.campaigns.first()
        val s = server()
        val v = CampaignConversationViewModel(campaign, CountingRecorder(), { true }, ai(s), s.progressClient, ReplyPlayer { true })
        v.handsFree.enable()
        v.carryHandsFreeToNextScene()
        v.handsFree.disable() // finishing the call turns it off
        v.rearmHandsFreeIfCarried()
        assertTrue("re-armed for the next scene", v.handsFree.isOn)
        v.rearmHandsFreeIfCarried()
        v.handsFree.disable()
        v.rearmHandsFreeIfCarried()
        assertFalse("the carry is used once", v.handsFree.isOn)

        v.handsFree.enable(); v.carryHandsFreeToNextScene(); v.handsFree.disable()
        v.restartScene(speak = false)
        v.rearmHandsFreeIfCarried()
        assertFalse("a retry forgets it", v.handsFree.isOn)

        v.handsFree.enable(); v.carryHandsFreeToNextScene(); v.handsFree.disable()
        v.forgetHandsFreeCarry()
        v.rearmHandsFreeIfCarried()
        assertFalse("ending the call forgets it", v.handsFree.isOn)

        v.carryHandsFreeToNextScene()
        v.rearmHandsFreeIfCarried()
        assertFalse("never on before: nothing to carry", v.handsFree.isOn)
        v.handsFree.disable()
    }

    @Test
    fun `the loop sees the engine's phase until the reply has been played`() {
        val p = HandsFreeBinding::voicePhase
        assertEquals(VoicePhase.REQUESTING_PERMISSION, p(TurnPhase.REQUESTING_MIC, ConversationPhase.IDLE))
        assertEquals(VoicePhase.RECORDING, p(TurnPhase.RECORDING, ConversationPhase.IDLE))
        assertEquals(VoicePhase.TRANSCRIBING, p(TurnPhase.TRANSCRIBING, ConversationPhase.IDLE))
        // After the release the engine is idle but the conversation is still working: the mic must stay shut.
        assertEquals(VoicePhase.TRANSCRIBING, p(TurnPhase.IDLE, ConversationPhase.TRANSCRIBING))
        assertEquals(VoicePhase.THINKING, p(TurnPhase.IDLE, ConversationPhase.THINKING))
        assertEquals(VoicePhase.SPEAKING, p(TurnPhase.IDLE, ConversationPhase.SPEAKING))
        assertEquals(VoicePhase.IDLE, p(TurnPhase.IDLE, ConversationPhase.IDLE))
    }

    @Test
    fun `only a blank transcript or a failure pauses, and hands-free hides the error banner`() {
        val c = HandsFreeBinding.newController(HandsFreeLoop.Tuning.PRACTICE, {}, {}, {})
        c.enable(); c.phase(VoicePhase.TRANSCRIBING)
        HandsFreeBinding.onTurnEvent(c, TurnEvent.TooShort)
        assertEquals(Status.Waiting, c.status.value)
        HandsFreeBinding.onTurnEvent(c, TurnEvent.Empty)
        assertEquals(Status.Paused(PauseReason.NO_WORDS), c.status.value)
        assertNull(HandsFreeBinding.errorFor(true, TurnEvent.Empty, "Didn't catch that"))
        assertEquals("Didn't catch that", HandsFreeBinding.errorFor(false, TurnEvent.Empty, "Didn't catch that"))
        assertEquals("kept for failures", "x", HandsFreeBinding.errorFor(true, TurnEvent.MicDenied, "x"))
    }
}
