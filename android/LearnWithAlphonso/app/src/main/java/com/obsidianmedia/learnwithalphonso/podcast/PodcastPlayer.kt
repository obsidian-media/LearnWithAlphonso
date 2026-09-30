package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClientError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayback
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSessionTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.format.DateTimeFormatter
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
    /** Internal so a test can observe a stale write being processed. */
    internal var lastSeenUpdatedAt: String? = null
    private var pausedByRecording = false

    init {
        port.onTick = ::tick
        port.onEnded = ::finish
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
    fun play(episode: PodcastEpisode, localUri: String? = null, queue: List<PodcastEpisode> = emptyList()) {
        if (queue.isNotEmpty()) _state.update { it.copy(queue = queue) }
        if (_state.value.episode?.id != episode.id) {
            if (_state.value.episode != null) flushPlayEvent(_state.value.episode!!)
            lastSeenUpdatedAt = episode.playbackUpdatedAt
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
            port.play()
            _state.update { it.copy(isPlaying = true) }
        }
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

    private fun save(position: Double, completed: Boolean) {
        val s = _state.value
        if (s.savesDisabled || !position.isFinite()) return
        val episode = s.episode ?: return
        val c = client() ?: return
        val seen = lastSeenUpdatedAt
        scope.launch {
            try {
                c.savePlaybackPosition(episode.id, position.roundToInt(), completed, seen)
                lastSeenUpdatedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMillis()))
            } catch (e: PodcastClientError.StaleWrite) {
                lastSeenUpdatedAt = null
            } catch (e: PodcastClientError.Unauthorized) {
                _state.update { it.copy(savesDisabled = true) }
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
