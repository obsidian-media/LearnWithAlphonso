package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class FakePort : PlayerPort {
    override var onTick: (Double) -> Unit = {}
    override var onEnded: () -> Unit = {}
    override var onPlayingChanged: (Boolean) -> Unit = {}
    val calls = ArrayList<String>()
    var position = 0L
    var duration: Long? = null
    override fun prepare(uri: String, startMillis: Long) { calls.add("prepare($uri,$startMillis)"); position = startMillis }
    override fun play() { calls.add("play") }
    override fun pause() { calls.add("pause") }
    override fun seekTo(millis: Long) { calls.add("seek($millis)"); position = millis }
    override fun currentMillis() = position
    override fun durationMillis() = duration
    override fun release() { calls.add("release") }
}

class PodcastPlayerTest {
    @get:Rule val main = MainDispatcherRule()

    private fun episode(id: String = "e1", position: Int = 0, updatedAt: String? = null) =
        PodcastEpisode(id, "f1", id, "Episode $id", null, "https://cdn.example/$id.mp3", 300, position, updatedAt)

    /** The server stamps each stored row itself: "S1", "S2", ... (never the device clock). */
    private val stamps = java.util.concurrent.atomic.AtomicInteger(0)

    private fun server(stale: Boolean = false, unauthorized: Boolean = false, hold: kotlinx.coroutines.CompletableDeferred<Unit>? = null) = FakeServer { req ->
        when {
            req.path.endsWith("record_podcast_play_event") -> json("")
            req.path.endsWith("podcast_playback") && unauthorized -> json("{}", HttpStatusCode.Unauthorized)
            req.path.endsWith("podcast_playback") && stale && req.method == "PATCH" -> json("[]")
            req.path.endsWith("podcast_playback") -> { hold?.await(); json("""[{"position_seconds":1,"updated_at":"S${stamps.incrementAndGet()}"}]""") }
            else -> json("[]")
        }
    }

    private fun player(s: FakeServer, port: FakePort, recording: MutableStateFlow<Boolean> = MutableStateFlow(false)): PodcastPlayer {
        val client = PodcastClient(SupabaseHttp("https://x.supabase.co", "pk", { "tok" }, s.engine), { "u1" }) { 1_758_000_000_000L }
        return PodcastPlayer(port, { client }, recording, CoroutineScope(Dispatchers.Main))
    }

    private fun saves(s: FakeServer) = s.seen.filter { it.path.endsWith("podcast_playback") }

    @Test
    fun `play prepares at the stored position, ticks save every ten seconds and after a backward skip, finish completes and records the play event`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(position = 42, updatedAt = "2026-09-24T10:00:00Z"), queue = listOf(episode("e1"), episode("e2")))
        assertEquals(listOf("prepare(https://cdn.example/e1.mp3,42000)", "play"), port.calls)
        assertTrue(p.state.value.isPlaying)
        assertEquals("e2", p.state.value.nextEpisode?.id)
        for (t in 42..52) port.onTick(t.toDouble())
        awaitTrue("first save") { saves(s).size == 1 }
        val patch = saves(s).single()
        assertEquals("PATCH", patch.method)
        assertEquals("eq.2026-09-24T10:00:00Z", patch.query["updated_at"])
        assertEquals(52, Json.parseToJsonElement(patch.body).jsonObject["position_seconds"]!!.jsonPrimitive.content.toInt())
        port.onTick(20.0) // backward skip: 32 away from the last save
        awaitTrue("second save") { saves(s).size == 2 }
        port.onEnded()
        awaitTrue("completion save") { saves(s).size == 3 }
        val done = Json.parseToJsonElement(saves(s).last().body).jsonObject
        assertEquals(0, done["position_seconds"]!!.jsonPrimitive.content.toInt())
        assertTrue(done.containsKey("completed_at"))
        awaitTrue("play event") { s.seen.any { it.path.endsWith("record_podcast_play_event") } }
        val event = s.seen.first { it.path.endsWith("record_podcast_play_event") }
        assertEquals("""{"_episode_id":"e1","_seconds_listened":10}""", event.body)
        assertFalse(p.state.value.isPlaying)
    }

    @Test
    fun `each save guards on the stamp the server stored for the previous one`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(updatedAt = "S0"))
        for (t in 0..10) port.onTick(t.toDouble())
        awaitTrue("first save") { saves(s).size == 1 }
        awaitTrue("stamp stored") { p.saveGate.lastSeenUpdatedAt == "S1" }
        for (t in 11..21) port.onTick(t.toDouble())
        awaitTrue("second save") { saves(s).size == 2 }
        assertEquals("eq.S0", saves(s)[0].query["updated_at"])
        assertEquals("the device clock never decides the guard", "eq.S1", saves(s)[1].query["updated_at"])
    }

    @Test
    fun `a stale write stops saving until the learner acts, then the first save is an upsert`() = runBlocking {
        val s = server(stale = true)
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(updatedAt = "2026-09-24T10:00:00Z"))
        for (t in 0..10) port.onTick(t.toDouble())
        awaitTrue("stale patch") { saves(s).size == 1 }
        awaitTrue("stale processed") { !p.saveGate.canSave }
        for (t in 11..40) port.onTick(t.toDouble())
        assertEquals("no saves while another device is ahead", 1, saves(s).size)
        // The learner acts (pause then play again): a fresh observation, so saving resumes with an upsert.
        p.toggle()
        p.toggle()
        for (t in 41..51) port.onTick(t.toDouble())
        awaitTrue("post after the learner acted") { saves(s).any { it.method == "POST" } }
        val post = saves(s).first { it.method == "POST" }
        assertEquals("user_id,episode_id", post.query["on_conflict"])
    }

    @Test
    fun `a 401 stops saving until the learner acts`() = runBlocking {
        val unauth = server(unauthorized = true)
        val port = FakePort()
        val p = player(unauth, port)
        p.play(episode())
        for (t in 0..10) port.onTick(t.toDouble())
        awaitTrue("401 seen") { p.state.value.savesDisabled }
        for (t in 11..40) port.onTick(t.toDouble())
        assertEquals(1, saves(unauth).size)
        p.toggle(); p.toggle() // pause, then play: the learner acted, so the session may have refreshed
        assertFalse(p.state.value.savesDisabled)
        for (t in 41..51) port.onTick(t.toDouble())
        awaitTrue("tries again after the learner acted") { saves(unauth).size == 2 }
    }

    @Test
    fun `replaying a row from the stale list starts from what this device last stored`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        val listed = episode(position = 0, updatedAt = "S0")
        p.play(listed)
        port.position = 95_000L
        p.close() // saves 95 s
        awaitTrue("stored") { saves(s).size == 1 }
        awaitTrue("stamp recorded") { p.resumed(listed).positionSeconds == 95 }
        // The learner taps the same (stale) row again.
        assertEquals("S1", p.resumed(listed).playbackUpdatedAt)
        port.calls.clear()
        p.play(listed)
        assertEquals("prepare(https://cdn.example/e1.mp3,95000)", port.calls.first())
        for (t in 95..105) port.onTick(t.toDouble())
        awaitTrue("second save") { saves(s).size == 2 }
        assertEquals("the guard is the stamp this device stored, not the stale row's", "eq.S1", saves(s)[1].query["updated_at"])
    }

    @Test
    fun `a row another device updated since wins over what this device remembers`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(position = 0, updatedAt = "S0"))
        port.position = 50_000L
        p.close()
        awaitTrue("stored") { saves(s).size == 1 }
        awaitTrue("stamp recorded") { p.resumed(episode(updatedAt = "S0")).positionSeconds == 50 }
        // A fresh list load brings a stamp this device never saw: another device wrote, and its position wins.
        val fromOtherDevice = episode(position = 200, updatedAt = "X-other")
        assertEquals(200, p.resumed(fromOtherDevice).positionSeconds)
    }

    @Test
    fun `a save made after leaving an episode is still guarded on the stamp stored for it`() = runBlocking {
        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = server(hold = hold)
        val port = FakePort()
        val p = player(s, port)
        p.play(episode("e1", updatedAt = "S0"))
        for (t in 0..10) port.onTick(t.toDouble()) // save 1 for e1 is now waiting on the server
        p.play(episode("e2", updatedAt = "T0")) // the player leaves e1 while its save is still in flight
        port.position = 20_000L
        hold.complete(Unit)
        awaitTrue("e1 stored") { saves(s).any { it.query["episode_id"] == "eq.e1" } }
        awaitTrue("e1 stamp known") { p.resumed(episode("e1", updatedAt = "S0")).playbackUpdatedAt == "S1" }
        // Leaving e2 later saves e2 under e2's own stamp, never e1's.
        p.close()
        awaitTrue("e2 saved") { saves(s).any { it.query["episode_id"] == "eq.e2" } }
        assertEquals("eq.T0", saves(s).first { it.query["episode_id"] == "eq.e2" }.query["updated_at"])
    }

    @Test
    fun `a chained save for an episode the player has left guards on the stamp the previous save stored`() = runBlocking {
        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = server(hold = hold)
        val port = FakePort()
        val p = player(s, port)
        p.play(episode("e1", updatedAt = "S0"))
        for (t in 0..10) port.onTick(t.toDouble()) // save 1 (guard S0) is in flight
        for (t in 11..21) port.onTick(t.toDouble()) // save 2 is requested behind it, while the observed stamp is still S0
        awaitTrue("first request") { saves(s).size == 1 }
        p.play(episode("e2", updatedAt = "T0")) // the player leaves e1 before either save finishes
        hold.complete(Unit)
        awaitTrue("second request") { saves(s).count { it.query["episode_id"] == "eq.e1" } == 2 }
        val second = saves(s).filter { it.query["episode_id"] == "eq.e1" }[1]
        assertEquals("eq.S1", second.query["updated_at"])
    }

    @Test
    fun `saves run one after another, each reading the gate after the previous finished`() = runBlocking {
        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = server(hold = hold)
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(updatedAt = "S0"))
        for (t in 0..10) port.onTick(t.toDouble())
        for (t in 11..21) port.onTick(t.toDouble()) // the second save is requested while the first is in flight
        awaitTrue("first request") { saves(s).size == 1 }
        Thread.sleep(100)
        assertEquals("the second waits for the first", 1, saves(s).size)
        hold.complete(Unit)
        awaitTrue("second request") { saves(s).size == 2 }
        assertEquals("eq.S1", saves(s)[1].query["updated_at"])
    }

    @Test
    fun `sign-out stops the player, drops remembered positions and refuses a save chained from the old account`() = runBlocking {
        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = server(hold = hold)
        val port = FakePort()
        val p = player(s, port)
        val listed = episode(position = 0, updatedAt = "S0")
        p.play(listed)
        for (t in 0..10) port.onTick(t.toDouble()) // a save is in flight
        for (t in 11..21) port.onTick(t.toDouble()) // and another is chained behind it
        awaitTrue("request in flight") { saves(s).size == 1 }
        p.stopForAccountChange()
        assertNull(p.state.value.episode)
        assertFalse(p.state.value.isPlaying)
        assertTrue(port.calls.contains("pause"))
        hold.complete(Unit)
        Thread.sleep(150)
        assertEquals("the chained save of the previous account never ran", 1, saves(s).size)
        assertEquals("the old account's stamp is not remembered", listed, p.resumed(listed))
        // A new account plays from a clean gate.
        p.play(episode("e1", updatedAt = "N0"))
        assertEquals("N0", p.saveGate.lastSeenUpdatedAt)
        assertTrue(p.saveGate.canSave)
    }

    @Test
    fun `a recorder starting pauses the podcast and it never resumes on its own`() = runBlocking {
        // Review Focus 3.
        val s = server()
        val port = FakePort()
        val recording = MutableStateFlow(false)
        val p = player(s, port, recording)
        p.play(episode())
        recording.value = true
        awaitTrue("paused") { !p.state.value.isPlaying }
        assertTrue(port.calls.contains("pause"))
        recording.value = false
        assertFalse(p.state.value.isPlaying)
        assertEquals(1, port.calls.count { it == "play" })
        p.toggle()
        assertTrue(p.state.value.isPlaying)
    }

    @Test
    fun `a system pause is reflected so the next tap resumes instead of pausing again`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode())
        assertTrue(p.state.value.isPlaying)
        port.onPlayingChanged(false) // headphones unplugged: ExoPlayer paused itself
        assertFalse(p.state.value.isPlaying)
        p.toggle()
        assertTrue(p.state.value.isPlaying)
        assertEquals(2, port.calls.count { it == "play" })
        assertEquals(0, port.calls.count { it == "pause" })
    }

    @Test
    fun `close saves and clears, stopIfPlaying only acts on the playing episode, next is null at the end`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode("e2"), queue = listOf(episode("e1"), episode("e2")))
        assertNull(p.state.value.nextEpisode)
        p.stopIfPlaying("e1")
        assertEquals("e2", p.state.value.episode?.id)
        port.position = 15_000
        p.stopIfPlaying("e2")
        assertNull(p.state.value.episode)
        assertFalse(p.state.value.isPlaying)
        awaitTrue("close save") { saves(s).size == 1 }
        assertEquals(15, Json.parseToJsonElement(saves(s).single().body).jsonObject["position_seconds"]!!.jsonPrimitive.content.toInt())
        assertEquals(listOf(episode("e1"), episode("e2")), p.state.value.queue)
    }
}
