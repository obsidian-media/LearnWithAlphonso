package com.obsidianmedia.learnwithalphonso.podcast

import com.obsidianmedia.learnwithalphonso.core.net.PodcastClient
import com.obsidianmedia.learnwithalphonso.core.net.PodcastClientError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayback
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlaybackClassifier
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlaybackFailure
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerControl
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerEffect
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerEvent
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerMachine
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayerPhase
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastProbeResult
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSaveGate
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSavedPositions
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSessionTracker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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

    /** Stops playback and clears the loaded item, so a headset or notification button cannot replay it. */
    fun stop()
    var onTick: (Double) -> Unit
    var onEnded: () -> Unit

    /** The loaded item failed: the player's error code, and the HTTP status when the error carries one. */
    var onError: (errorCode: Int?, httpStatus: Int?) -> Unit

    /** Playback ran out of buffered data while the learner wanted sound. */
    var onStalled: () -> Unit
    /** The player's own play state: the system pauses on focus loss and unplugged headphones without us asking. */
    var onPlayingChanged: (Boolean) -> Unit

    /**
     * The player stopped because of [PauseCause]: a pause button (app, notification, lock screen, headset), permanent
     * audio-focus loss, or headphones pulled. A transient focus loss (a call, a navigation prompt) is NOT reported: the
     * player suppresses itself and resumes by itself, and the learner still expects sound.
     */
    var onPaused: (PauseCause) -> Unit

    /** Playback is suppressed (true) or no longer suppressed (false) by a transient audio-focus loss: a call, a prompt. */
    var onSuppressionChanged: (Boolean) -> Unit
}

enum class PauseCause { USER_REQUEST, FOCUS_LOST, BECAME_NOISY }

data class PodcastPlayerState(
    val episode: PodcastEpisode? = null,
    /** What the player is really doing. Playing only once the player confirmed it. */
    val phase: PodcastPlayerPhase = PodcastPlayerPhase.Idle,
    val elapsedSeconds: Double = 0.0,
    val queue: List<PodcastEpisode> = emptyList(),
    /** Set once a save was rejected for auth; pretending saves land is how resume silently stops working. */
    val savesDisabled: Boolean = false,
) {
    val isPlaying: Boolean get() = phase == PodcastPlayerPhase.Playing
    val failure: PodcastPlaybackFailure? get() = (phase as? PodcastPlayerPhase.Failed)?.failure

    /** The one control the mini bar shows next to the title. */
    val control: PodcastPlayerControl
        get() = when (phase) {
            PodcastPlayerPhase.Idle -> PodcastPlayerControl.NONE
            PodcastPlayerPhase.Loading, PodcastPlayerPhase.Buffering -> PodcastPlayerControl.SPINNER
            PodcastPlayerPhase.Playing -> PodcastPlayerControl.PAUSE
            PodcastPlayerPhase.Paused, PodcastPlayerPhase.Finished -> PodcastPlayerControl.PLAY
            is PodcastPlayerPhase.Failed -> PodcastPlayerControl.RETRY
        }

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
    private val isOnline: () -> Boolean = { true },
    /** A HEAD request against the episode URL, run only after a remote item fails. */
    private val probe: suspend (String) -> PodcastProbeResult = { PodcastProbeResult.NotRun },
    private val loadTimeoutMillis: Long = PodcastPlayerMachine.LOAD_TIMEOUT_MILLIS,
    private val stallTimeoutMillis: Long = PodcastPlayerMachine.STALL_TIMEOUT_MILLIS,
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

    /** The play/pause/failure rules; this class only feeds it signals and performs its effects. */
    private val machine = PodcastPlayerMachine()
    private var source: String? = null
    private var sourceIsLocal = false
    private var startMillis = 0L
    private var timeoutJob: Job? = null

    /** A failure is being probed: the result belongs to this start, so a tap must not start another one and drop it. */
    private var probing = false

    /** Which failure's probe is the latest; an older one finishing late must not clear the flag of a newer one, but must clear its own. */
    private var probeSeq = 0

    /** Playback is suppressed by a transient focus loss: the player resumes by itself, so no timeout may fail it meanwhile. */
    private var suppressed = false

    /** The episode as the learner should see it: with the position this device last stored, if newer. */
    fun resumed(episode: PodcastEpisode): PodcastEpisode = savedPositions.applying(episode)

    /** Changes whenever what this device remembers does, so a list showing [resumed] rows recomposes. */
    val positionsRevision: StateFlow<Int> get() = savedPositions.revision

    init {
        port.onTick = ::tick
        port.onEnded = ::finish
        // Review 2026-09-30: a system pause (audio focus lost, headphones unplugged) left the
        // mini bar showing "playing" and the next tap had to pause a paused player first.
        port.onPlayingChanged = ::playerPlayingChanged
        port.onPaused = ::playerPaused
        port.onSuppressionChanged = ::suppressionChanged
        port.onError = ::playerFailed
        port.onStalled = { dispatch(PodcastPlayerEvent.Stalled) }
        scope.launch {
            recording.collect { isRecording ->
                // Our own mic screens pause the podcast and never resume it: resuming
                // over someone mid-speaking-exercise is the failure to avoid.
                if (isRecording && machine.isActive) {
                    pausedByRecording = true
                    dispatch(PodcastPlayerEvent.PausedExternally(resumable = false))
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
        val sameEpisode = _state.value.episode?.id == episode.id
        pausedByRecording = false
        if (sameEpisode) {
            when (machine.phase) {
                PodcastPlayerPhase.Paused, PodcastPlayerPhase.Finished -> dispatch(PodcastPlayerEvent.TogglePressed)
                is PodcastPlayerPhase.Failed -> {
                    startMillis = (_state.value.elapsedSeconds * 1000).toLong()
                    startCurrent()
                }
                else -> Unit
            }
            return
        }
        if (_state.value.episode != null) flushPlayEvent(_state.value.episode!!)
        saveGate.beginEpisode(episode.playbackUpdatedAt)
        val start = PodcastPlayback.clampPosition(episode.positionSeconds.toDouble(), episode.durationSeconds.toDouble())
        tracker.reset(start)
        _state.update { it.copy(episode = episode, elapsedSeconds = start) }
        source = localUri ?: episode.audioUrl
        sourceIsLocal = localUri != null
        startMillis = (start * 1000).toLong()
        startCurrent()
    }

    /** Starts the current episode from its source: first play, and Retry after a failure. */
    private fun startCurrent() {
        timeoutJob?.cancel()
        probing = false
        dispatch(PodcastPlayerEvent.Start(isRemote = !sourceIsLocal, isOnline = isOnline()))
        // An offline start never reaches the player: stop whatever was loaded before.
        if (machine.phase is PodcastPlayerPhase.Failed) port.pause()
    }

    fun toggle() {
        val s = _state.value
        if (s.episode == null || probing) return
        when (machine.phase) {
            is PodcastPlayerPhase.Failed -> {
                startMillis = (s.elapsedSeconds * 1000).toLong()
                saveGate.userStartedPlayback()
                _state.update { it.copy(savesDisabled = false) }
                startCurrent()
            }
            PodcastPlayerPhase.Paused, PodcastPlayerPhase.Finished -> {
                pausedByRecording = false
                saveGate.userStartedPlayback()
                _state.update { it.copy(savesDisabled = false) }
                dispatch(PodcastPlayerEvent.TogglePressed)
            }
            else -> dispatch(PodcastPlayerEvent.TogglePressed)
        }
    }

    /** Retry after a failure: loads the episode again from where it was. */
    fun retry() {
        if (machine.phase is PodcastPlayerPhase.Failed) toggle()
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
        port.stop()
        tracker.reset()
        timeoutJob?.cancel()
        probing = false
        machine.send(PodcastPlayerEvent.Closed)
        source = null
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
        timeoutJob?.cancel()
        probing = false
        // Idle first: our own stop is echoed back by the player as a pause cause, which must not save a second time.
        machine.send(PodcastPlayerEvent.Closed)
        // Stop and clear the loaded item, as sign-out does: a paused item would still sit in the notification and a headset or
        // lock-screen button could play the episode the learner just closed.
        port.stop()
        source = null
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
        if (_state.value.episode == null) return
        dispatch(PodcastPlayerEvent.PlayedToEnd)
    }

    private fun playerPlayingChanged(playing: Boolean) {
        if (_state.value.episode == null || !playing) return
        // Already paused or finished and the player is playing: something outside the app pressed play (notification,
        // lock screen, headset). Nothing is loading, so there is nothing to wait for.
        if (machine.phase == PodcastPlayerPhase.Paused || machine.phase == PodcastPlayerPhase.Finished || machine.phase is PodcastPlayerPhase.Failed) dispatch(PodcastPlayerEvent.ResumedExternally)
        else dispatch(PodcastPlayerEvent.PlayerPlaying)
    }

    /** Every real pause stays paused until the learner (or the system's own media button) plays again; nothing here resumes by itself. */
    private fun playerPaused(cause: PauseCause) {
        if (_state.value.episode == null) return
        dispatch(PodcastPlayerEvent.PausedExternally(resumable = false))
    }

    /** The item failed. A remote one is probed first, because the player cannot tell a missing object from a dead network. */
    private fun playerFailed(errorCode: Int?, httpStatus: Int?) {
        val episode = _state.value.episode ?: return
        if (machine.phase == PodcastPlayerPhase.Idle) return
        val generation = machine.stallGeneration
        val local = sourceIsLocal
        val url = source
        probing = true
        val mine = ++probeSeq
        scope.launch {
            val probed = if (local || url == null) PodcastProbeResult.NotRun else runCatching { probe(url) }.getOrDefault(PodcastProbeResult.NoResponse)
            // Whether the verdict is used or thrown away, this probe is over: a flag left set would ignore every later tap.
            if (mine == probeSeq) probing = false
            if (_state.value.episode?.id != episode.id || machine.stallGeneration != generation || machine.phase == PodcastPlayerPhase.Idle) return@launch
            dispatch(PodcastPlayerEvent.ItemFailed(PodcastPlaybackClassifier.classify(errorCode, httpStatus, probed, local, isOnline())))
        }
    }

    /** Feeds the machine one event, publishes the phase it lands in and performs the effects it asks for. */
    private fun dispatch(event: PodcastPlayerEvent) {
        val effects = machine.send(event)
        _state.update { it.copy(phase = machine.phase) }
        effects.forEach(::perform)
    }

    private fun perform(effect: PodcastPlayerEffect) {
        when (effect) {
            PodcastPlayerEffect.LoadItem -> {
                val uri = source ?: return
                runCatching { port.prepare(uri, startMillis) }.onFailure { dispatch(PodcastPlayerEvent.ItemFailed(PodcastPlaybackFailure.UNPLAYABLE)) }
            }
            PodcastPlayerEffect.Play -> port.play()
            PodcastPlayerEffect.Pause -> port.pause()
            PodcastPlayerEffect.SeekToStart -> {
                // At the end the player keeps playWhenReady, so seeking to the start would play the episode again.
                port.pause()
                port.seekTo(0)
                _state.update { it.copy(elapsedSeconds = 0.0) }
            }
            PodcastPlayerEffect.SavePosition -> save(port.currentMillis() / 1000.0, completed = false)
            PodcastPlayerEffect.SaveCompletion -> save(0.0, completed = true)
            PodcastPlayerEffect.FlushPlayEvent -> _state.value.episode?.let(::flushPlayEvent)
            is PodcastPlayerEffect.ScheduleLoadTimeout -> schedule(loadTimeoutMillis) { dispatch(PodcastPlayerEvent.LoadTimedOut(effect.generation)) }
            is PodcastPlayerEffect.ScheduleStallTimeout -> schedule(stallTimeoutMillis) { dispatch(PodcastPlayerEvent.StallTimedOut(effect.generation)) }
        }
    }

    /**
     * A transient focus loss (a call) suppresses playback and the player resumes by itself, so the wait for sound is not a
     * network failure: the timer stops while suppressed and starts again, from the full time, when it ends.
     */
    private fun suppressionChanged(isSuppressed: Boolean) {
        suppressed = isSuppressed
        if (isSuppressed) {
            timeoutJob?.cancel()
            return
        }
        val generation = machine.stallGeneration
        when (machine.phase) {
            PodcastPlayerPhase.Loading -> schedule(loadTimeoutMillis) { dispatch(PodcastPlayerEvent.LoadTimedOut(generation)) }
            PodcastPlayerPhase.Buffering -> schedule(stallTimeoutMillis) { dispatch(PodcastPlayerEvent.StallTimedOut(generation)) }
            else -> Unit
        }
    }

    /** One timeout at a time; the machine ignores one whose generation is stale. */
    private fun schedule(millis: Long, action: () -> Unit) {
        timeoutJob?.cancel()
        if (suppressed) return
        timeoutJob = scope.launch {
            delay(millis)
            action()
        }
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
