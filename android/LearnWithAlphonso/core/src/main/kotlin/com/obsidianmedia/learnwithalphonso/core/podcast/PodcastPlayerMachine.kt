package com.obsidianmedia.learnwithalphonso.core.podcast

/** Why an episode is not playing, in terms the learner can act on (PodcastPlaybackFailure.swift). */
enum class PodcastPlaybackFailure {
    /** Streaming needed a connection that is not there, and there is no download. */
    OFFLINE_NOT_DOWNLOADED,
    NETWORK,

    /** The object is gone or not readable. Supabase Storage says 400 for a missing public object, so 400 counts here. */
    NOT_FOUND,
    SERVER,
    UNPLAYABLE,
}

/** What a HEAD request against the episode URL said, run only after a remote item fails. */
sealed interface PodcastProbeResult {
    data object NotRun : PodcastProbeResult
    data object NoResponse : PodcastProbeResult
    data class Status(val code: Int) : PodcastProbeResult
}

object PodcastPlaybackClassifier {
    // Media3 PlaybackException error codes (androidx.media3.common.PlaybackException), mirrored as plain ints so core
    // stays free of Android.
    const val ERROR_IO_NETWORK_CONNECTION_FAILED = 2001
    const val ERROR_IO_NETWORK_CONNECTION_TIMEOUT = 2002
    const val ERROR_IO_BAD_HTTP_STATUS = 2004
    const val ERROR_IO_FILE_NOT_FOUND = 2005

    /**
     * @param errorCode the player's error code, if it gave one.
     * @param httpStatus the status of a rejected request when the error carries one (a bad HTTP status).
     * @param isOnline whether the device has a connection right now; the player reports "could not connect" the same
     * way offline and with a server that is down, so this tells them apart.
     */
    fun classify(errorCode: Int?, httpStatus: Int?, probe: PodcastProbeResult, isLocalFile: Boolean, isOnline: Boolean): PodcastPlaybackFailure {
        // A downloaded file needs no network; if it fails, the file is the problem.
        if (isLocalFile) return PodcastPlaybackFailure.UNPLAYABLE
        val status = (probe as? PodcastProbeResult.Status)?.code ?: httpStatus
        if (status != null) {
            if (status in setOf(400, 403, 404, 410)) return PodcastPlaybackFailure.NOT_FOUND
            if (status in 500..599) return PodcastPlaybackFailure.SERVER
        }
        if (errorCode == ERROR_IO_FILE_NOT_FOUND) return PodcastPlaybackFailure.NOT_FOUND
        if (errorCode == ERROR_IO_NETWORK_CONNECTION_FAILED || errorCode == ERROR_IO_NETWORK_CONNECTION_TIMEOUT) {
            return if (isOnline) PodcastPlaybackFailure.NETWORK else PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED
        }
        if (probe == PodcastProbeResult.NoResponse) return if (isOnline) PodcastPlaybackFailure.NETWORK else PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED
        return PodcastPlaybackFailure.UNPLAYABLE
    }
}

object PodcastPlaybackCopy {
    const val RETRY_TITLE = "Retry"
    const val BUFFERING_LABEL = "Buffering…"
    private const val CONNECTION_FAILURE = "Couldn't reach the server. Check your connection and try again."

    fun message(failure: PodcastPlaybackFailure): String = when (failure) {
        PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED -> "Download this episode to listen offline."
        PodcastPlaybackFailure.NETWORK -> CONNECTION_FAILURE
        PodcastPlaybackFailure.NOT_FOUND -> "This episode isn't available right now."
        PodcastPlaybackFailure.SERVER -> "The episode couldn't load because of a problem on our side. Try again in a moment."
        PodcastPlaybackFailure.UNPLAYABLE -> "This episode couldn't be played. Try again."
    }
}

sealed interface PodcastPlayerPhase {
    data object Idle : PodcastPlayerPhase

    /** Waiting for the player to actually play (first load, resume after pause, retry). */
    data object Loading : PodcastPlayerPhase

    /** The player confirmed it is playing. The only phase shown as playing. */
    data object Playing : PodcastPlayerPhase
    data object Buffering : PodcastPlayerPhase
    data object Paused : PodcastPlayerPhase

    /** Reached the end: rewound to 0, marked complete, Play shown. */
    data object Finished : PodcastPlayerPhase
    data class Failed(val failure: PodcastPlaybackFailure) : PodcastPlayerPhase
}

/** The one control the mini bar shows next to the title. */
enum class PodcastPlayerControl { NONE, PLAY, PAUSE, SPINNER, RETRY }

sealed interface PodcastPlayerEvent {
    data class Start(val isRemote: Boolean, val isOnline: Boolean) : PodcastPlayerEvent
    data object ItemReady : PodcastPlayerEvent
    data class ItemFailed(val failure: PodcastPlaybackFailure) : PodcastPlayerEvent
    data object PlayerPlaying : PodcastPlayerEvent
    data object Stalled : PodcastPlayerEvent
    data class StallTimedOut(val generation: Int) : PodcastPlayerEvent

    /** No first frame arrived in [PodcastPlayerMachine.LOAD_TIMEOUT_MILLIS] after a start or resume. */
    data class LoadTimedOut(val generation: Int) : PodcastPlayerEvent
    data object PlayedToEnd : PodcastPlayerEvent
    data object TogglePressed : PodcastPlayerEvent

    /** The system or the app paused us: audio focus lost to a call (resumable), headphones pulled or a voice turn (not resumable). */
    data class PausedExternally(val resumable: Boolean) : PodcastPlayerEvent
    data class InterruptionEnded(val shouldResume: Boolean) : PodcastPlayerEvent

    /** Something outside the app started playback again (notification, lock screen, headset button) and the player confirmed it. */
    data object ResumedExternally : PodcastPlayerEvent
    data object Closed : PodcastPlayerEvent
}

sealed interface PodcastPlayerEffect {
    data object LoadItem : PodcastPlayerEffect
    data object Play : PodcastPlayerEffect
    data object Pause : PodcastPlayerEffect
    data object SeekToStart : PodcastPlayerEffect
    data object SavePosition : PodcastPlayerEffect
    data object SaveCompletion : PodcastPlayerEffect
    data object FlushPlayEvent : PodcastPlayerEffect
    data class ScheduleStallTimeout(val generation: Int) : PodcastPlayerEffect
    data class ScheduleLoadTimeout(val generation: Int) : PodcastPlayerEffect
}

/**
 * The podcast player's rules, with no player in sight (PodcastPlayerMachine.swift). The app's `PodcastPlayer` feeds it
 * the player's signals and performs the effects it returns. Keeping the rules here is what makes "a 404 or offline
 * episode never shows as playing" a unit test instead of a hope.
 */
class PodcastPlayerMachine {
    var phase: PodcastPlayerPhase = PodcastPlayerPhase.Idle
        private set

    /** Bumped by every stall, start, resume and close, so a stall or load timeout scheduled earlier does nothing. */
    var stallGeneration = 0
        private set
    private var resumeAfterInterruption = false

    val isAudible: Boolean get() = phase == PodcastPlayerPhase.Playing

    /** Loading, playing or buffering: the learner expects sound. */
    val isActive: Boolean
        get() = phase == PodcastPlayerPhase.Loading || phase == PodcastPlayerPhase.Playing || phase == PodcastPlayerPhase.Buffering

    val failure: PodcastPlaybackFailure? get() = (phase as? PodcastPlayerPhase.Failed)?.failure

    val control: PodcastPlayerControl
        get() = when (phase) {
            PodcastPlayerPhase.Idle -> PodcastPlayerControl.NONE
            PodcastPlayerPhase.Loading, PodcastPlayerPhase.Buffering -> PodcastPlayerControl.SPINNER
            PodcastPlayerPhase.Playing -> PodcastPlayerControl.PAUSE
            PodcastPlayerPhase.Paused, PodcastPlayerPhase.Finished -> PodcastPlayerControl.PLAY
            is PodcastPlayerPhase.Failed -> PodcastPlayerControl.RETRY
        }

    fun send(event: PodcastPlayerEvent): List<PodcastPlayerEffect> {
        when (event) {
            is PodcastPlayerEvent.Start -> {
                resumeAfterInterruption = false
                stallGeneration += 1
                if (event.isRemote && !event.isOnline) {
                    phase = PodcastPlayerPhase.Failed(PodcastPlaybackFailure.OFFLINE_NOT_DOWNLOADED)
                    return emptyList()
                }
                phase = PodcastPlayerPhase.Loading
                return listOf(PodcastPlayerEffect.LoadItem, PodcastPlayerEffect.Play, PodcastPlayerEffect.ScheduleLoadTimeout(stallGeneration))
            }
            // Ready is not playing. PlayerPlaying decides.
            PodcastPlayerEvent.ItemReady -> return emptyList()
            is PodcastPlayerEvent.ItemFailed -> {
                if (phase == PodcastPlayerPhase.Idle) return emptyList()
                phase = PodcastPlayerPhase.Failed(event.failure)
                resumeAfterInterruption = false
                return listOf(PodcastPlayerEffect.Pause)
            }
            PodcastPlayerEvent.PlayerPlaying -> {
                if (phase == PodcastPlayerPhase.Loading || phase == PodcastPlayerPhase.Buffering) phase = PodcastPlayerPhase.Playing
                return emptyList()
            }
            PodcastPlayerEvent.Stalled -> {
                if (phase != PodcastPlayerPhase.Playing) return emptyList()
                phase = PodcastPlayerPhase.Buffering
                stallGeneration += 1
                return listOf(PodcastPlayerEffect.ScheduleStallTimeout(stallGeneration))
            }
            is PodcastPlayerEvent.LoadTimedOut -> {
                if (phase != PodcastPlayerPhase.Loading || event.generation != stallGeneration) return emptyList()
                phase = PodcastPlayerPhase.Failed(PodcastPlaybackFailure.NETWORK)
                return listOf(PodcastPlayerEffect.Pause)
            }
            is PodcastPlayerEvent.StallTimedOut -> {
                if (phase != PodcastPlayerPhase.Buffering || event.generation != stallGeneration) return emptyList()
                phase = PodcastPlayerPhase.Failed(PodcastPlaybackFailure.NETWORK)
                return listOf(PodcastPlayerEffect.Pause, PodcastPlayerEffect.SavePosition)
            }
            PodcastPlayerEvent.PlayedToEnd -> {
                if (phase != PodcastPlayerPhase.Playing && phase != PodcastPlayerPhase.Buffering) return emptyList()
                phase = PodcastPlayerPhase.Finished
                return listOf(PodcastPlayerEffect.SeekToStart, PodcastPlayerEffect.SaveCompletion, PodcastPlayerEffect.FlushPlayEvent)
            }
            PodcastPlayerEvent.TogglePressed -> return when (phase) {
                PodcastPlayerPhase.Loading, PodcastPlayerPhase.Playing, PodcastPlayerPhase.Buffering -> {
                    phase = PodcastPlayerPhase.Paused
                    resumeAfterInterruption = false
                    listOf(PodcastPlayerEffect.Pause, PodcastPlayerEffect.SavePosition)
                }
                PodcastPlayerPhase.Paused, PodcastPlayerPhase.Finished -> {
                    phase = PodcastPlayerPhase.Loading
                    stallGeneration += 1
                    listOf(PodcastPlayerEffect.Play, PodcastPlayerEffect.ScheduleLoadTimeout(stallGeneration))
                }
                PodcastPlayerPhase.Idle, is PodcastPlayerPhase.Failed -> emptyList()
            }
            is PodcastPlayerEvent.PausedExternally -> {
                if (!isActive) return emptyList()
                phase = PodcastPlayerPhase.Paused
                resumeAfterInterruption = event.resumable
                return listOf(PodcastPlayerEffect.Pause, PodcastPlayerEffect.SavePosition)
            }
            is PodcastPlayerEvent.InterruptionEnded -> {
                val mayResume = resumeAfterInterruption
                resumeAfterInterruption = false
                if (phase != PodcastPlayerPhase.Paused || !event.shouldResume || !mayResume) return emptyList()
                phase = PodcastPlayerPhase.Loading
                stallGeneration += 1
                return listOf(PodcastPlayerEffect.Play, PodcastPlayerEffect.ScheduleLoadTimeout(stallGeneration))
            }
            PodcastPlayerEvent.ResumedExternally -> {
                // The player is already playing: no Play effect and no load timeout, which would fail a healthy stream.
                if (phase == PodcastPlayerPhase.Paused || phase == PodcastPlayerPhase.Finished) phase = PodcastPlayerPhase.Playing
                resumeAfterInterruption = false
                return emptyList()
            }
            PodcastPlayerEvent.Closed -> {
                phase = PodcastPlayerPhase.Idle
                resumeAfterInterruption = false
                stallGeneration += 1
                return emptyList()
            }
        }
    }

    companion object {
        /** How long a stall may last before it is reported as a network failure. */
        const val STALL_TIMEOUT_MILLIS = 20_000L

        /**
         * How long loading may last with no first frame before it is reported as a network failure with Retry (a
         * stream that neither plays nor errors would spin forever).
         */
        const val LOAD_TIMEOUT_MILLIS = 20_000L
    }
}
