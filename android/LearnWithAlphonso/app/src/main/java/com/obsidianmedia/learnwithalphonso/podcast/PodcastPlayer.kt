package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClientError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayback
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSaveGate
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSavedPositions
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSessionTracker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * What PodcastPlayer needs from a media player. The real one is a Media3
 * MediaController bound to PodcastPlaybackService; tests use a fake that
 * drives [onTick] and [onEnded] by hand.
 */
interface PlayerPort {
    fun prepare(uri: String, startMillis: Long)
    fun play()
    fun pause()
    fun seekTo(millis: Long)
    fun currentMillis(): Long
    /** Media duration when known, else null (the row's duration is the fallback). */
    fun durationMillis(): Long?
    fun release()
    var onTick: (Double) -> Unit
    var onEnded: () -> Unit
    /** The player's own play state: the system pauses on focus loss and unplugged headphones without us asking. */
    var onPlayingChanged: (Boolean) -> Unit
}

data class PodcastPlayerState(
    val episode: PodcastEpisode? = null,
    val isPlaying: Boolean = false,
    val elapsedSeconds: Double = 0.0,
    val failed: Boolean = false,
    val queue: List<PodcastEpisode> = emptyList(),
    /** Set once a save was rejected for auth; pretending saves land is how resume silently stops working. */
    val savesDisabled: Boolean = false,
) {
    val nextEpisode: PodcastEpisode?
        get() {
            val current = episode ?: return null
            val idx = queue.indexOfFirst { it.id == current.id }
            return if (idx >= 0 && idx + 1 < queue.size) queue[idx + 1] else null
        }
}

/**
 * Port of PodcastAudioPlayer.swift, held above the view tree by AppContainer
 * so navigation never affects playback. The cadence rules live in core's
 * PodcastSessionTracker; this class only wires them to the port and the
 * client.
 */
class PodcastPlayer(
    private val port: PlayerPort,
    private val client: () -> PodcastClient?,
    private val recording: StateFlow<Boolean>,
    private val scope: CoroutineScope,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val _state = MutableStateFlow(PodcastPlayerState())
    val state: StateFlow<PodcastPlayerState> = _state.asStateFlow()

    private val tracker = PodcastSessionTracker()

    /** Internal so a test can observe the gate (what was last seen, whether saving is paused). */
    internal val saveGate = PodcastSaveGate()

    /** The last position this device stored per episode, so a stale list row never wins. */
    private val savedPositions = PodcastSavedPositions()

    /** Saves run one after another, so each one guards on what the previous one stored. */
    private var saveJob: Job? = null
    private var pausedByRecording = false

    /** The episode as the learner should see it: with the position this device last stored, if newer. */
    fun resumed(episode: PodcastEpisode): PodcastEpisode = savedPositions.applying(episode)

    init {
        port.onTick = ::tick
        port.onEnded = ::finish
        // Review 2026-09-30: a system pause (audio focus lost, headphones unplugged) left the
        // mini bar showing "playing" and the next tap had to pause a paused player first.
        port.onPlayingChanged = { playing -> _state.update { if (it.episode == null) it else it.copy(isPlaying = playing) } }
        scope.launch {
            recording.collect { isRecording ->
                // Our own mic screens pause the podcast and never resume it: resuming
                // over someone mid-speaking-exercise is the failure to avoid.
                if (isRecording && _state.value.isPlaying) {
                    pausedByRecording = true
                    port.pause()
                    _state.update { it.copy(isPlaying = false) }
                    save(port.currentMillis() / 1000.0, completed = false)
                }
            }
        }
    }

    /** Plays an episode, preferring a downloaded copy; a non-empty queue replaces the current one. */
    fun play(listed: PodcastEpisode, localUri: String? = null, queue: List<PodcastEpisode> = emptyList()) {
        // The list's copy can predate a listen made since it loaded: start from what this device last stored.
        val episode = savedPositions.applying(listed)
        // Playback starts from this snapshot, so its stamp is part of this device's own history.
        savedPositions.noteSeen(listed)
        if (queue.isNotEmpty()) _state.update { it.copy(queue = queue) }
        // A learner action is a fresh observation: saving paused by a stale write or a 401 may resume.
        saveGate.userStartedPlayback()
        _state.update { it.copy(savesDisabled = false) }
        if (_state.value.episode?.id != episode.id) {
            if (_state.value.episode != null) flushPlayEvent(_state.value.episode!!)
            saveGate.beginEpisode(episode.playbackUpdatedAt)
            val start = PodcastPlayback.clampPosition(episode.positionSeconds.toDouble(), episode.durationSeconds.toDouble())
            tracker.reset(start)
            _state.update { it.copy(episode = episode, elapsedSeconds = start, failed = false) }
            runCatching { port.prepare(localUri ?: episode.audioUrl, (start * 1000).toLong()) }
                .onFailure { _state.update { s -> s.copy(failed = true) } }
        }
        pausedByRecording = false
        port.play()
        _state.update { it.copy(isPlaying = true) }
    }

    fun toggle() {
        val s = _state.value
        if (s.episode == null) return
        if (s.isPlaying) {
            port.pause()
            _state.update { it.copy(isPlaying = false) }
            save(port.currentMillis() / 1000.0, completed = false)
        } else {
            pausedByRecording = false
            saveGate.userStartedPlayback()
            _state.update { it.copy(savesDisabled = false) }
            port.play()
            _state.update { it.copy(isPlaying = true) }
        }
    }

    /**
     * Sign-out or account deletion. The next account on this device must not hear, see in the notification, or resume
     * the previous account's episode. No final save: the session's token is already gone, and the position is at most
     * ten seconds behind. The gate keeps counting epochs, so a save already chained from the previous account is refused.
     */
    fun stopForAccountChange() {
        saveJob?.cancel()
        saveJob = null
        saveGate.resetForAccountChange()
        savedPositions.reset()
        if (_state.value.episode != null) port.pause()
        tracker.reset()
        _state.value = PodcastPlayerState()
    }

    fun skip(seconds: Double) {
        val episode = _state.value.episode ?: return
        val limit = (port.durationMillis()?.let { it / 1000.0 } ?: episode.durationSeconds.toDouble())
        val target = (port.currentMillis() / 1000.0 + seconds).coerceIn(0.0, limit)
        port.seekTo((target * 1000).toLong())
        _state.update { it.copy(elapsedSeconds = target) }
    }

    fun close() {
        val episode = _state.value.episode ?: return
        save(port.currentMillis() / 1000.0, completed = false)
        flushPlayEvent(episode)
        port.pause()
        _state.value = PodcastPlayerState(queue = _state.value.queue, savesDisabled = _state.value.savesDisabled)
    }

    /** Called when the app backgrounds, so a position is not lost to a process the system may never bring back. */
    fun onBackground() {
        if (_state.value.episode != null) save(port.currentMillis() / 1000.0, completed = false)
    }

    /** Review Focus 1: deleting the file under a playing episode stops playback first. */
    fun stopIfPlaying(episodeId: String) {
        if (_state.value.episode?.id == episodeId) close()
    }

    private fun tick(seconds: Double) {
        if (!seconds.isFinite()) return
        _state.update { it.copy(elapsedSeconds = seconds) }
        if (tracker.tick(seconds).savePosition) save(seconds, completed = false)
    }

    private fun finish() {
        val episode = _state.value.episode ?: return
        _state.update { it.copy(isPlaying = false, elapsedSeconds = 0.0) }
        save(0.0, completed = true)
        flushPlayEvent(episode)
    }

    /**
     * Chained: each save starts after the previous one finished and reads the gate then, so it guards on what the
     * previous save stored. An episode the player has since left is still guarded, on the stamp this device last stored
     * for it (else the stamp observed at request time), so it cannot overwrite another device's newer row.
     */
    private fun save(position: Double, completed: Boolean) {
        if (!saveGate.canSave || !position.isFinite()) return
        val episode = _state.value.episode ?: return
        val c = client() ?: return
        val episodeId = episode.id
        val seconds = position.roundToInt()
        val epoch = saveGate.epoch
        val observedWhenRequested = saveGate.lastSeenUpdatedAt
        val previous = saveJob
        saveJob = scope.launch {
            previous?.join()
            if (!saveGate.accepts(epoch) || !saveGate.canSave) return@launch
            val isCurrent = _state.value.episode?.id == episodeId
            val seen = if (isCurrent) saveGate.lastSeenUpdatedAt else (savedPositions.lastStoredStamp(episodeId) ?: observedWhenRequested)
            try {
                val stored = c.savePlaybackPosition(episodeId, seconds, completed, seen)
                if (saveGate.accepts(epoch)) savedPositions.record(episodeId, if (completed) 0 else seconds, stored)
                if (saveGate.accepts(epoch) && _state.value.episode?.id == episodeId) saveGate.recordSaved(stored)
            } catch (e: CancellationException) {
                throw e
            } catch (e: PodcastClientError.StaleWrite) {
                if (saveGate.accepts(epoch) && _state.value.episode?.id == episodeId) saveGate.recordStale()
            } catch (e: PodcastClientError.Unauthorized) {
                if (saveGate.accepts(epoch)) {
                    saveGate.recordUnauthorized()
                    // Pretending saves land is how resume silently stops working: the mini bar can say so.
                    _state.update { it.copy(savesDisabled = true) }
                }
            } catch (e: Exception) {
                // Best-effort: a failed save leaves the last known position alone.
            }
        }
    }

    private fun flushPlayEvent(episode: PodcastEpisode) {
        val listened = tracker.flushListened()
        if (listened <= 0) return
        val c = client() ?: return
        scope.launch { runCatching { c.recordPlayEvent(episode.id, listened) } }
    }
}
