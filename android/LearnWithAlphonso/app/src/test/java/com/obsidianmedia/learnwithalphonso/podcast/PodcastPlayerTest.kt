package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlaybackFailure
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerControl
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerPhase
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastProbeResult
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

/**
 * A player that behaves like Media3's controller where it matters here: play() while already playing says nothing,
 * playWhenReady stays true at the end of the media (so seeking from the end replays), a transient focus loss suppresses
 * playback without any callback, and a real pause reports its cause.
 */
class FakePort : PlayerPort {
    override var onTick: (Double) -> Unit = {}
    override var onEnded: () -> Unit = {}
    override var onPlayingChanged: (Boolean) -> Unit = {}
    override var onPaused: (PauseCause) -> Unit = {}
    override var onSuppressionChanged: (Boolean) -> Unit = {}
    override var onError: (Int?, Int?) -> Unit = { _, _ -> }
    override var onStalled: () -> Unit = {}

    val calls = ArrayList<String>()
    var position = 0L
    var duration: Long? = null

    var playWhenReady = false
        private set
    var playing = false
        private set
    var ended = false
        private set
    private var suppressed = false
    private var ready = true
    private var loaded = false

    /** A real player confirms playback a moment after play(); tests that need it unconfirmed turn this off, then back on. */
    var confirmPlay: Boolean
        get() = ready
        set(value) { ready = value; update() }

    private fun update() {
        val now = loaded && playWhenReady && ready && !ended && !suppressed
        if (now != playing) {
            playing = now
            // Media3 reports isPlaying becoming true; "not playing" is explained by a pause cause, a stall or nothing.
            if (now) onPlayingChanged(true)
        }
    }

    override fun prepare(uri: String, startMillis: Long) { calls.add("prepare($uri,$startMillis)"); position = startMillis; ended = false; loaded = true }
    override fun play() {
        calls.add("play")
        if (ended) { ended = false; position = 0 }
        playWhenReady = true
        update()
    }
    override fun pause() {
        calls.add("pause")
        if (!playWhenReady) return
        playWhenReady = false
        update()
        onPaused(PauseCause.USER_REQUEST)
    }
    override fun seekTo(millis: Long) { calls.add("seek($millis)"); position = millis; if (ended) { ended = false; update() } }
    override fun currentMillis() = position
    override fun durationMillis() = duration
    override fun release() { calls.add("release") }
    override fun stop() {
        // Stops and clears the item, as Media3's stop() + clearMediaItems(): nothing is left to play. playWhenReady is NOT
        // changed (Media3 leaves it as it was), so a later press of Play still wants sound, from whatever loads next.
        calls.add("stop")
        loaded = false
        playing = false
    }

    /** The media ran out. playWhenReady stays true, as in Media3. */
    fun endPlayback() { ended = true; update(); onEnded() }

    /** Headphones pulled, audio focus lost for good, or a pause from the notification, lock screen or headset. */
    fun externalPause(cause: PauseCause) { playWhenReady = false; update(); onPaused(cause) }

    /** Play pressed outside the app (notification, lock screen, headset, Bluetooth). */
    fun externalPlay() { playWhenReady = true; update() }

    /** A call or a navigation prompt: playback is suppressed, playWhenReady stays true, nothing is reported. */
    fun suppress() { suppressed = true; update(); onSuppressionChanged(true) }
    fun unsuppress() { suppressed = false; update(); onSuppressionChanged(false) }
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

    private fun player(
        s: FakeServer,
        port: FakePort,
        recording: MutableStateFlow<Boolean> = MutableStateFlow(false),
        isOnline: () -> Boolean = { true },
        probe: suspend (String) -> PodcastProbeResult = { PodcastProbeResult.NotRun },
        timeoutMillis: Long = 20_000L,
    ): PodcastPlayer {
        val client = PodcastClient(SupabaseHttp("https://x.supabase.co", "pk", { "tok" }, s.engine), { "u1" }) { 1_758_000_000_000L }
        return PodcastPlayer(
            port, { client }, recording, CoroutineScope(Dispatchers.Main),
            isOnline = isOnline, probe = probe, loadTimeoutMillis = timeoutMillis, stallTimeoutMillis = timeoutMillis,
        )
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
        port.endPlayback()
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
        assertTrue("the loaded item is cleared, so a headset or notification button cannot replay it", port.calls.contains("stop"))
        hold.complete(Unit)
        Thread.sleep(150)
        assertEquals("the chained save of the previous account never ran", 1, saves(s).size)
        // The in-flight save of the previous account finished after the sign-out: account B inherits neither its position nor its stamp.
        val unrelated = p.resumed(episode(position = 0, updatedAt = null))
        assertEquals(0, unrelated.positionSeconds)
        assertNull(unrelated.playbackUpdatedAt)
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
        port.externalPause(PauseCause.BECAME_NOISY) // headphones unplugged: ExoPlayer paused itself
        assertFalse(p.state.value.isPlaying)
        p.toggle()
        assertTrue(p.state.value.isPlaying)
        assertEquals(2, port.calls.count { it == "play" })
        assertEquals("the tap resumed; it did not pause again", "play", port.calls.last())
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

    @Test
    fun `playback shows as playing only once the player confirms it`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port)
        p.play(episode())
        assertEquals(PodcastPlayerPhase.Loading, p.state.value.phase)
        assertFalse("play() was called but nothing is audible yet", p.state.value.isPlaying)
        assertEquals(PodcastPlayerControl.SPINNER, p.state.value.control)
        port.confirmPlay = true
        assertTrue(p.state.value.isPlaying)
        assertEquals(PodcastPlayerControl.PAUSE, p.state.value.control)
    }

    @Test
    fun `a remote episode with no connection fails as offline without touching the player, a download still plays`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port, isOnline = { false })
        p.play(episode())
        assertEquals(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED, p.state.value.failure)
        assertEquals(PodcastPlayerControl.RETRY, p.state.value.control)
        assertFalse(port.calls.any { it.startsWith("prepare") })
        p.close()
        p.play(episode("e2"), localUri = "file:///downloads/e2.mp3")
        assertTrue(p.state.value.isPlaying)
        assertEquals("prepare(file:///downloads/e2.mp3,0)", port.calls.first { it.startsWith("prepare") })
    }

    @Test
    fun `a missing remote episode is told apart from a dead network by the probe, and Retry loads it again`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        var status = 400
        val p = player(server(), port, probe = { PodcastProbeResult.Status(status) })
        p.play(episode(position = 30))
        port.onError(PlayerCodes.BAD_STATUS, null)
        awaitTrue("failure") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, p.state.value.failure)
        assertFalse(p.state.value.isPlaying)
        // Retry restarts the load from where the learner was, and only a confirmed player shows playing again.
        status = 200
        port.confirmPlay = true
        p.retry()
        assertEquals(2, port.calls.count { it.startsWith("prepare") })
        assertEquals("prepare(https://cdn.example/e1.mp3,30000)", port.calls.last { it.startsWith("prepare") })
        assertTrue(p.state.value.isPlaying)
        assertNull(p.state.value.failure)
    }

    @Test
    fun `a failure that arrives after the learner moved on is ignored`() = runBlocking {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, probe = { gate.await(); PodcastProbeResult.Status(404) })
        p.play(episode("e1"))
        port.onError(PlayerCodes.BAD_STATUS, null)
        p.play(episode("e2"))
        gate.complete(Unit)
        port.confirmPlay = true
        awaitTrue("playing e2") { p.state.value.isPlaying }
        assertEquals("e2", p.state.value.episode?.id)
        assertNull(p.state.value.failure)
    }

    @Test
    fun `a downloaded file that fails is unplayable, with no probe`() = runBlocking {
        var probed = false
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, probe = { probed = true; PodcastProbeResult.Status(404) })
        p.play(episode(), localUri = "file:///downloads/e1.mp3")
        port.onError(PlayerCodes.BAD_STATUS, null)
        awaitTrue("failure") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.UNPLAYABLE, p.state.value.failure)
        assertFalse(probed)
    }

    @Test
    fun `loading that never produces sound times out as a network failure with Retry`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, timeoutMillis = 50)
        p.play(episode())
        awaitTrue("timeout") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NETWORK, p.state.value.failure)
        assertEquals(PodcastPlayerControl.RETRY, p.state.value.control)
    }

    @Test
    fun `a stall that outlasts the timeout fails and saves, a recovery before it does not`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port, timeoutMillis = 200)
        p.play(episode())
        port.onStalled()
        assertEquals(PodcastPlayerPhase.Buffering, p.state.value.phase)
        port.onPlayingChanged(true)
        assertTrue(p.state.value.isPlaying)
        kotlinx.coroutines.delay(300)
        assertTrue("recovered before the timeout, so the late timer does nothing", p.state.value.isPlaying)
        port.onStalled()
        awaitTrue("stall timeout") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NETWORK, p.state.value.failure)
        awaitTrue("position saved") { saves(s).isNotEmpty() }
    }

    @Test
    fun `finishing rewinds to the start, marks complete and offers Play`() = runBlocking {
        val s = server()
        val port = FakePort()
        val p = player(s, port)
        p.play(episode(position = 42))
        port.endPlayback()
        assertEquals(PodcastPlayerPhase.Finished, p.state.value.phase)
        assertEquals(PodcastPlayerControl.PLAY, p.state.value.control)
        assertTrue(port.calls.contains("seek(0)"))
        assertEquals(0.0, p.state.value.elapsedSeconds, 0.0)
        awaitTrue("completion save") { saves(s).any { Json.parseToJsonElement(it.body).jsonObject.containsKey("completed_at") } }
    }

    @Test
    fun `reaching the end pauses before rewinding, so the episode does not play again`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port)
        p.play(episode())
        port.endPlayback()
        assertEquals(PodcastPlayerPhase.Finished, p.state.value.phase)
        assertFalse("the player is not playing after the end", port.playing)
        assertTrue("paused first, then rewound", port.calls.lastIndexOf("pause") < port.calls.lastIndexOf("seek(0)"))
        // The bar says Play, and tapping it plays from the start without a false network failure.
        assertEquals(PodcastPlayerControl.PLAY, p.state.value.control)
        p.toggle()
        assertTrue(p.state.value.isPlaying)
        assertTrue(port.playing)
        assertNull(p.state.value.failure)
    }

    @Test
    fun `playing again after the end does not time out as a network failure`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode())
        port.endPlayback()
        p.toggle()
        kotlinx.coroutines.delay(300)
        assertTrue("the load timer saw the player playing", p.state.value.isPlaying)
        assertNull(p.state.value.failure)
    }

    @Test
    fun `play pressed outside the app resumes a paused episode without a spinner or a false failure`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode())
        port.externalPause(PauseCause.USER_REQUEST) // the notification's pause button
        assertEquals(PodcastPlayerPhase.Paused, p.state.value.phase)
        port.externalPlay() // the notification's play button, or the headset's
        assertEquals(PodcastPlayerPhase.Playing, p.state.value.phase)
        kotlinx.coroutines.delay(300)
        assertTrue(p.state.value.isPlaying)
        assertNull("no spinner timed out into a network failure", p.state.value.failure)
        assertEquals("the app never called play() itself for an outside resume", 1, port.calls.count { it == "play" })
    }

    @Test
    fun `a call or a prompt that suppresses playback is not a pause, and the player resumes by itself`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port)
        p.play(episode())
        port.suppress()
        assertEquals(PodcastPlayerPhase.Playing, p.state.value.phase)
        assertEquals("the app did not pause a player that resumes by itself", 0, port.calls.count { it == "pause" })
        port.unsuppress()
        assertTrue(p.state.value.isPlaying)
        assertEquals(1, port.calls.count { it == "play" })
    }

    @Test
    fun `headphones pulled and permanent focus loss leave it paused, and nothing resumes it by itself`() = runBlocking {
        for (cause in listOf(PauseCause.BECAME_NOISY, PauseCause.FOCUS_LOST)) {
            val port = FakePort()
            val p = player(server(), port)
            p.play(episode())
            port.externalPause(cause)
            assertEquals(cause.name, PodcastPlayerPhase.Paused, p.state.value.phase)
            assertEquals(PodcastPlayerControl.PLAY, p.state.value.control)
            assertEquals("not resumed on its own", 1, port.calls.count { it == "play" })
            p.toggle()
            assertTrue(p.state.value.isPlaying)
        }
    }

    @Test
    fun `a tap while a failure is being probed does not start another load and drop the verdict`() = runBlocking {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, probe = { gate.await(); PodcastProbeResult.Status(404) })
        p.play(episode())
        port.onError(PlayerCodes.BAD_STATUS, null)
        // Pause then play from the lock screen or notification while the probe is out: the second press would start a
        // new load, bump the generation and drop the verdict, leaving a spinner that ends in a false network failure.
        p.toggle()
        p.toggle()
        assertEquals("both presses were ignored", 1, port.calls.count { it == "play" })
        gate.complete(Unit)
        awaitTrue("verdict") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, p.state.value.failure)
    }

    @Test
    fun `a probe whose verdict is thrown away still ends, so later taps are not ignored`() = runBlocking {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val port = FakePort()
        val p = player(server(), port, probe = { gate.await(); PodcastProbeResult.Status(404) })
        p.play(episode())
        assertTrue(p.state.value.isPlaying)
        port.onError(PlayerCodes.BAD_STATUS, null) // a failure while playing: the probe starts
        port.onStalled() // the stall moves the machine on, so the verdict will be stale
        gate.complete(Unit)
        kotlinx.coroutines.delay(200)
        p.toggle() // the learner pauses
        assertEquals("the tap was heard", PodcastPlayerPhase.Paused, p.state.value.phase)
    }

    @Test
    fun `play pressed outside the app on a failed episode clears the failure instead of playing under it`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, probe = { PodcastProbeResult.Status(404) })
        p.play(episode())
        port.onError(PlayerCodes.BAD_STATUS, null)
        awaitTrue("failure") { p.state.value.failure != null }
        port.confirmPlay = true
        port.externalPlay() // the notification's play button: the item plays
        assertEquals(PodcastPlayerPhase.Playing, p.state.value.phase)
        assertNull(p.state.value.failure)
    }

    @Test
    fun `a call that suppresses playback while it loads does not time out as a network failure`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode())
        port.suppress()
        kotlinx.coroutines.delay(400)
        assertNull("the player will resume by itself: no failure while suppressed", p.state.value.failure)
        assertEquals(PodcastPlayerPhase.Loading, p.state.value.phase)
        port.confirmPlay = true
        port.unsuppress()
        assertTrue(p.state.value.isPlaying)
    }

    @Test
    fun `when the suppression ends and nothing plays, the wait for sound starts again and then fails`() = runBlocking {
        val port = FakePort().apply { confirmPlay = false }
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode())
        port.suppress()
        kotlinx.coroutines.delay(250)
        port.unsuppress()
        awaitTrue("timeout after the suppression") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NETWORK, p.state.value.failure)
    }

    @Test
    fun `closing stops and clears the player, so a notification or headset button cannot replay the closed episode`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port)
        p.play(episode())
        p.close()
        assertEquals("stop", port.calls.last())
        port.externalPlay() // a headset button on a cleared player
        assertFalse(port.playing)
        assertNull(p.state.value.episode)
        assertFalse(p.state.value.isPlaying)
    }

    @Test
    fun `an offline start of another episode clears the one that was loaded, so a notification Play sounds nothing and saves nothing for it`() = runBlocking {
        var online = true
        val s = server()
        val port = FakePort()
        val p = player(s, port, isOnline = { online })
        p.play(episode("a"))
        assertTrue(p.state.value.isPlaying)
        online = false
        p.play(episode("b")) // streamed, not downloaded
        assertEquals(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED, p.state.value.failure)
        assertEquals("a was stopped and cleared, not just paused", "stop", port.calls.last())
        val savesBefore = saves(s).size
        port.position = 42_000
        port.externalPlay() // the notification still shows a, and its Play button is pressed
        assertFalse("nothing is loaded, so nothing plays", port.playing)
        assertEquals("b is still the episode, still failed", "b", p.state.value.episode?.id)
        assertEquals(PodcastPlayerPhase.Failed(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED), p.state.value.phase)
        kotlinx.coroutines.delay(150)
        assertEquals("and no save of a's position went into b's row", savesBefore, saves(s).size)
    }

    @Test
    fun `a stall while playback is suppressed does not start the wait for sound`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode())
        port.suppress()
        port.onStalled() // the machine moves to Buffering and asks for a stall timer
        kotlinx.coroutines.delay(400)
        assertNull("no timer runs while suppressed", p.state.value.failure)
        assertEquals(PodcastPlayerPhase.Buffering, p.state.value.phase)
    }

    @Test
    fun `closing forgets the suppression, so the next episode's wait for sound runs`() = runBlocking {
        val port = FakePort()
        val p = player(server(), port, timeoutMillis = 100)
        p.play(episode("a"))
        port.suppress()
        p.close()
        port.confirmPlay = false
        p.play(episode("b"))
        awaitTrue("the load timer ran for b") { p.state.value.failure != null }
        assertEquals(PodcastPlaybackFailure.NETWORK, p.state.value.failure)
    }
}

/** Media3 PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, the code the controller reports for a rejected request. */
private object PlayerCodes { const val BAD_STATUS = 2004 }
