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

    private fun server(stale: Boolean = false, unauthorized: Boolean = false) = FakeServer { req ->
        when {
            req.path.endsWith("record_podcast_play_event") -> json("")
            req.path.endsWith("podcast_playback") && unauthorized -> json("{}", HttpStatusCode.Unauthorized)
            req.path.endsWith("podcast_playback") && stale && req.method == "PATCH" -> json("[]")
            req.path.endsWith("podcast_playback") -> json("""[{"position_seconds":1}]""")
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
    fun `a stale write clears the last seen mark so the next save posts, and a 401 disables saves`() = runBlocking {
        val s = server(stale = true)
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(updatedAt = "2026-09-24T10:00:00Z"))
        for (t in 0..10) port.onTick(t.toDouble())
        awaitTrue("stale patch") { saves(s).size == 1 }
        awaitTrue("stale processed") { p.lastSeenUpdatedAt == null }
        for (t in 11..21) port.onTick(t.toDouble())
        awaitTrue("post after stale") { saves(s).size == 2 }
        assertEquals("POST", saves(s)[1].method)

        val unauth = server(unauthorized = true)
        val port2 = FakePort()
        val p3 = player(unauth, port2)
        p3.play(episode())
        for (t in 0..10) port2.onTick(t.toDouble())
        awaitTrue("401 seen") { p3.state.value.savesDisabled }
        for (t in 11..40) port2.onTick(t.toDouble())
        assertEquals(1, saves(unauth).size)
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
