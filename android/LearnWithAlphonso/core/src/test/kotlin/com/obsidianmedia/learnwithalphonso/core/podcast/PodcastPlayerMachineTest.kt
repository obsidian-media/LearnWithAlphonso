package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerEffect as Fx
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerEvent as Ev
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerPhase as Ph

class PodcastPlayerMachineTest {
    private fun playing(): PodcastPlayerMachine = PodcastPlayerMachine().apply {
        send(Ev.Start(isRemote = true, isOnline = true))
        send(Ev.PlayerPlaying)
    }

    // ---- the machine

    @Test
    fun `starting loads and plays but is not playing until the player confirms`() {
        val m = PodcastPlayerMachine()
        val effects = m.send(Ev.Start(isRemote = true, isOnline = true))
        assertEquals(listOf(Fx.LoadItem, Fx.Play, Fx.ScheduleLoadTimeout(m.stallGeneration)), effects)
        assertEquals(Ph.Loading, m.phase)
        assertFalse(m.isAudible)
        assertEquals(PodcastPlayerControl.SPINNER, m.control)
        m.send(Ev.ItemReady)
        assertEquals(Ph.Loading, m.phase, "ready is not playing")
        m.send(Ev.PlayerPlaying)
        assertEquals(Ph.Playing, m.phase)
        assertEquals(PodcastPlayerControl.PAUSE, m.control)
    }

    @Test
    fun `a remote episode with no connection fails as offline without touching the player`() {
        val m = PodcastPlayerMachine()
        assertEquals(emptyList<Fx>(), m.send(Ev.Start(isRemote = true, isOnline = false)))
        assertEquals(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED, m.failure)
        assertEquals(PodcastPlayerControl.RETRY, m.control)
        // A download needs no connection.
        val local = PodcastPlayerMachine()
        assertEquals(Ph.Loading, run { local.send(Ev.Start(isRemote = false, isOnline = false)); local.phase })
    }

    @Test
    fun `a failure while loading shows as failed with Retry, never as playing`() {
        val m = PodcastPlayerMachine()
        m.send(Ev.Start(isRemote = true, isOnline = true))
        assertEquals(listOf(Fx.Pause), m.send(Ev.ItemFailed(PodcastPlaybackFailure.NOT_FOUND)))
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, m.failure)
        assertFalse(m.isAudible)
        m.send(Ev.PlayerPlaying)
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, m.failure, "a late playing signal does not revive a failed item")
        assertEquals(emptyList<Fx>(), PodcastPlayerMachine().send(Ev.ItemFailed(PodcastPlaybackFailure.NETWORK)), "a failure with nothing open is ignored")
    }

    @Test
    fun `a load that never produces sound times out, and only the timer of the current load counts`() {
        val m = PodcastPlayerMachine()
        m.send(Ev.Start(isRemote = true, isOnline = true))
        val first = m.stallGeneration
        m.send(Ev.TogglePressed) // pause
        m.send(Ev.TogglePressed) // resume: a new load, a new generation
        assertEquals(emptyList<Fx>(), m.send(Ev.LoadTimedOut(first)))
        assertEquals(Ph.Loading, m.phase)
        assertEquals(listOf(Fx.Pause), m.send(Ev.LoadTimedOut(m.stallGeneration)))
        assertEquals(PodcastPlaybackFailure.NETWORK, m.failure)
    }

    @Test
    fun `a stall buffers, times out to a network failure that saves, and recovers before the timeout`() {
        val m = playing()
        val effects = m.send(Ev.Stalled)
        assertEquals(Ph.Buffering, m.phase)
        assertEquals(listOf<Fx>(Fx.ScheduleStallTimeout(m.stallGeneration)), effects)
        val stall = m.stallGeneration
        m.send(Ev.PlayerPlaying)
        assertEquals(Ph.Playing, m.phase)
        assertEquals(emptyList<Fx>(), m.send(Ev.StallTimedOut(stall)), "the timer of a stall that recovered does nothing")
        m.send(Ev.Stalled)
        assertEquals(listOf(Fx.Pause, Fx.SavePosition), m.send(Ev.StallTimedOut(m.stallGeneration)))
        assertEquals(PodcastPlaybackFailure.NETWORK, m.failure)
        assertEquals(emptyList<Fx>(), PodcastPlayerMachine().send(Ev.Stalled), "only a playing item stalls")
    }

    @Test
    fun `finishing rewinds, marks complete, flushes the play event and shows Play`() {
        val m = playing()
        assertEquals(listOf(Fx.SeekToStart, Fx.SaveCompletion, Fx.FlushPlayEvent), m.send(Ev.PlayedToEnd))
        assertEquals(Ph.Finished, m.phase)
        assertEquals(PodcastPlayerControl.PLAY, m.control)
        assertEquals(emptyList<Fx>(), m.send(Ev.PlayedToEnd), "ending twice does nothing")
        val again = m.send(Ev.TogglePressed)
        assertEquals(listOf(Fx.Play, Fx.ScheduleLoadTimeout(m.stallGeneration)), again, "Play from the end loads again")
    }

    @Test
    fun `toggle pauses and saves, then resumes through loading`() {
        val m = playing()
        assertEquals(listOf(Fx.Pause, Fx.SavePosition), m.send(Ev.TogglePressed))
        assertEquals(Ph.Paused, m.phase)
        val resumed = m.send(Ev.TogglePressed)
        assertEquals(Ph.Loading, m.phase)
        assertEquals(listOf(Fx.Play, Fx.ScheduleLoadTimeout(m.stallGeneration)), resumed)
        assertEquals(emptyList<Fx>(), PodcastPlayerMachine().send(Ev.TogglePressed), "nothing to toggle while failed or idle")
    }

    @Test
    fun `an external pause resumes after a call but never after headphones or a recorder`() {
        val call = playing()
        call.send(Ev.PausedExternally(resumable = true))
        assertEquals(Ph.Paused, call.phase)
        assertEquals(listOf(Fx.Play, Fx.ScheduleLoadTimeout(call.stallGeneration + 1)), call.send(Ev.InterruptionEnded(shouldResume = true)))

        val headphones = playing()
        headphones.send(Ev.PausedExternally(resumable = false))
        assertEquals(emptyList<Fx>(), headphones.send(Ev.InterruptionEnded(shouldResume = true)))
        assertEquals(Ph.Paused, headphones.phase)

        val declined = playing()
        declined.send(Ev.PausedExternally(resumable = true))
        assertEquals(emptyList<Fx>(), declined.send(Ev.InterruptionEnded(shouldResume = false)), "the system said do not resume")
    }

    @Test
    fun `closing goes idle and invalidates pending timers`() {
        val m = PodcastPlayerMachine()
        m.send(Ev.Start(isRemote = true, isOnline = true))
        val before = m.stallGeneration
        m.send(Ev.Closed)
        assertEquals(Ph.Idle, m.phase)
        assertEquals(PodcastPlayerControl.NONE, m.control)
        assertEquals(emptyList<Fx>(), m.send(Ev.LoadTimedOut(before)))
        assertNull(m.failure)
    }

    // ---- failure classification

    private fun classify(code: Int? = null, status: Int? = null, probe: PodcastProbeResult = PodcastProbeResult.NotRun, local: Boolean = false, online: Boolean = true) =
        PodcastPlaybackClassifier.classify(code, status, probe, local, online)

    @Test
    fun `a missing object is told apart from a dead network by the probe, and 400 counts as missing`() {
        for (status in listOf(400, 403, 404, 410)) assertEquals(PodcastPlaybackFailure.NOT_FOUND, classify(probe = PodcastProbeResult.Status(status)), "status $status")
        assertEquals(PodcastPlaybackFailure.SERVER, classify(probe = PodcastProbeResult.Status(503)))
        assertEquals(PodcastPlaybackFailure.NETWORK, classify(probe = PodcastProbeResult.NoResponse))
        assertEquals(PodcastPlaybackFailure.UNPLAYABLE, classify(probe = PodcastProbeResult.Status(200)))
        assertEquals(
            PodcastPlaybackFailure.NOT_FOUND,
            classify(code = PodcastPlaybackClassifier.ERROR_IO_NETWORK_CONNECTION_FAILED, probe = PodcastProbeResult.Status(404)),
            "the probe wins over the player's own code",
        )
    }

    @Test
    fun `connection errors are offline when the device is offline and network otherwise`() {
        val failed = PodcastPlaybackClassifier.ERROR_IO_NETWORK_CONNECTION_FAILED
        assertEquals(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED, classify(code = failed, online = false))
        assertEquals(PodcastPlaybackFailure.NETWORK, classify(code = failed, online = true))
        assertEquals(PodcastPlaybackFailure.NETWORK, classify(code = PodcastPlaybackClassifier.ERROR_IO_NETWORK_CONNECTION_TIMEOUT))
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, classify(code = PodcastPlaybackClassifier.ERROR_IO_FILE_NOT_FOUND))
        assertEquals(PodcastPlaybackFailure.NOT_FOUND, classify(status = 404))
    }

    @Test
    fun `a downloaded file that fails is unplayable whatever the network says`() {
        assertEquals(PodcastPlaybackFailure.UNPLAYABLE, classify(code = 2001, probe = PodcastProbeResult.Status(404), local = true))
    }

    @Test
    fun `every failure has copy the learner can act on`() {
        assertEquals("Download this episode to listen offline.", PodcastPlaybackCopy.message(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED))
        assertEquals("This episode isn't available right now.", PodcastPlaybackCopy.message(PodcastPlaybackFailure.NOT_FOUND))
        assertEquals(5, PodcastPlaybackFailure.entries.map { PodcastPlaybackCopy.message(it) }.toSet().size)
        assertEquals("Retry", PodcastPlaybackCopy.RETRY_TITLE)
    }

    // ---- download validation

    @Test
    fun `a response is kept only for a 200 with an audio type, and a missing object's 400 json is refused`() {
        assertNull(PodcastDownloadValidation.checkResponse(200, "audio/mpeg"))
        assertNull(PodcastDownloadValidation.checkResponse(200, "Audio/MP4; charset=binary"))
        assertEquals(PodcastDownloadFailure.NotFound, PodcastDownloadValidation.checkResponse(400, "application/json"))
        assertEquals(PodcastDownloadFailure.NotFound, PodcastDownloadValidation.checkResponse(404, null))
        assertEquals(PodcastDownloadFailure.Server(503), PodcastDownloadValidation.checkResponse(503, "text/html"))
        assertEquals(PodcastDownloadFailure.InvalidContent("application/json"), PodcastDownloadValidation.checkResponse(200, "application/json"))
        assertEquals(PodcastDownloadFailure.InvalidContent(null), PodcastDownloadValidation.checkResponse(200, null))
        assertEquals(PodcastDownloadFailure.Server(206), PodcastDownloadValidation.checkResponse(206, "audio/mpeg"), "a 206 is not the whole file")
    }

    @Test
    fun `a body must match the declared length, or clear the floor for the episode's duration`() {
        assertNull(PodcastDownloadValidation.checkBody(1_000, 1_000, 60))
        assertEquals(PodcastDownloadFailure.Incomplete(1_000, 900), PodcastDownloadValidation.checkBody(1_000, 900, 60))
        assertEquals(PodcastDownloadFailure.Incomplete(null, 0), PodcastDownloadValidation.checkBody(null, 0, 60), "empty is never an episode")
        // No declared length: 100 s of audio needs at least 200,000 bytes.
        assertNull(PodcastDownloadValidation.checkBody(null, 200_000, 100))
        assertEquals(PodcastDownloadFailure.Incomplete(null, 199_999), PodcastDownloadValidation.checkBody(null, 199_999, 100))
        assertNull(PodcastDownloadValidation.checkBody(null, 2_000, 0), "a zero duration still needs the one-second floor only")
    }

    @Test
    fun `a thrown error is classified by its whole cause chain`() {
        assertEquals(PodcastDownloadFailure.NoSpace, PodcastDownloadValidation.classify(RuntimeException("x", IOException("write failed: ENOSPC (No space left on device)"))))
        assertEquals(PodcastDownloadFailure.Offline, PodcastDownloadValidation.classify(IOException("failed", UnknownHostException("host"))))
        assertEquals(PodcastDownloadFailure.Offline, PodcastDownloadValidation.classify(ConnectException("refused")))
        assertEquals(PodcastDownloadFailure.Network, PodcastDownloadValidation.classify(IOException("connection reset")))
    }

    @Test
    fun `download copy names what happened and what to remove`() {
        val entries = listOf(PodcastCacheEntry("a", 10, null, 100, null))
        assertEquals("Not enough space set aside", PodcastDownloadCopy.title(PodcastDownloadFailure.BudgetExceeded(entries, 10)))
        assertTrue(PodcastDownloadCopy.message(PodcastDownloadFailure.BudgetExceeded(entries, 10)).startsWith("Remove 1 downloaded episode to make room"))
        assertTrue(PodcastDownloadCopy.message(PodcastDownloadFailure.BudgetExceeded(emptyList(), 10)).contains("larger than the space"))
        assertEquals("Episode unavailable", PodcastDownloadCopy.title(PodcastDownloadFailure.NotFound))
        assertEquals("Server problem", PodcastDownloadCopy.title(PodcastDownloadFailure.InvalidContent("x")))
    }

    // ---- the library

    private fun folder(id: String, parent: String?, course: String? = null) = PodcastFolder(id, parent, id, id, null, 0, course)

    @Test
    fun `a course sees its own roots and the course-less ones, and only folders with a published episode beneath`() {
        val folders = listOf(
            folder("en", null, "en"), folder("en-a", "en"), folder("en-empty", "en"),
            folder("fr", null, "fr"), folder("fr-a", "fr"),
            folder("any", null), folder("any-a", "any"),
        )
        val published = setOf("en-a", "fr-a", "any-a")
        assertEquals(listOf("en", "en-a", "any", "any-a"), PodcastLibrary.visibleFolders(folders, published, "en").map { it.id })
        assertEquals(listOf("fr", "fr-a", "any", "any-a"), PodcastLibrary.visibleFolders(folders, published, "fr").map { it.id })
        assertEquals(listOf("fr", "fr-a"), PodcastLibrary.visibleFolders(folders, setOf("fr-a"), "fr").map { it.id }, "unpublishing leaves no empty folder")
        assertTrue(PodcastLibrary.visibleFolders(folders, emptySet(), "es").isEmpty(), "nothing published")
    }

    @Test
    fun `a parent cycle is unreachable and episodes are limited to the visible folders`() {
        val cycle = listOf(folder("a", "b"), folder("b", "a"))
        assertTrue(PodcastLibrary.visibleFolders(cycle, setOf("a", "b"), "en").isEmpty())
        val visible = listOf(folder("f1", null))
        val episodes = listOf(
            PodcastEpisode("e1", "f1", "e1", "t", null, "u", 1, 0, null),
            PodcastEpisode("e2", "f2", "e2", "t", null, "u", 1, 0, null),
        )
        assertEquals(listOf("e1"), PodcastLibrary.episodes(episodes, visible).map { it.id })
    }

    @Test
    fun `downloads are pruned only after a read that returned folders, and the playing episode is kept`() {
        assertFalse(PodcastLibrary.canPruneDownloads(emptyList()), "a folder-less read is a role problem, not an empty library")
        assertTrue(PodcastLibrary.canPruneDownloads(listOf(folder("f", null))))
        val entries = listOf("keep", "gone", "playing").map { PodcastCacheEntry(it, 10, null, 100, null) }
        assertEquals(listOf("gone"), PodcastLibrary.unpublishedDownloads(entries, setOf("keep"), playingEpisodeId = "playing"))
        assertEquals(listOf("gone", "playing"), PodcastLibrary.unpublishedDownloads(entries, setOf("keep"), playingEpisodeId = null))
    }

    @Test
    fun `an empty course says which course is empty`() {
        assertEquals("No French episodes yet", PodcastLibrary.emptyTitle("fr"))
        assertEquals("No episodes yet", PodcastLibrary.emptyTitle("de"))
    }
}
