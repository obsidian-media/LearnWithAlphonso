package com.obsidianmedia.learnwithalphonso.podcast

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.Executor

/**
 * PlayerPort over a Media3 MediaController bound to PodcastPlaybackService.
 * The controller connects asynchronously, so commands issued before it is
 * ready are queued and replayed in order.
 */
class MediaControllerPort(private val context: Context, private val scope: CoroutineScope) : PlayerPort {
    override var onTick: (Double) -> Unit = {}
    override var onEnded: () -> Unit = {}
    override var onPlayingChanged: (Boolean) -> Unit = {}
    override var onPaused: (PauseCause) -> Unit = {}
    override var onSuppressionChanged: (Boolean) -> Unit = {}
    override var onError: (Int?, Int?) -> Unit = { _, _ -> }
    override var onStalled: () -> Unit = {}

    private var controller: MediaController? = null
    private var future: ListenableFuture<MediaController>? = null
    private val pending = ArrayList<(MediaController) -> Unit>()
    private var ticker: Job? = null

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) onEnded()
            // Out of data while the learner wants sound is a stall, not a pause.
            if (playbackState == Player.STATE_BUFFERING && controller?.playWhenReady == true) onStalled()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                startTicker()
                onPlayingChanged(true)
            } else {
                ticker?.cancel()
                // "Not playing" has three different meanings, told apart elsewhere: buffering (a stall, below), a
                // transient focus loss (suppressed, playWhenReady still true: the player resumes by itself, so nothing
                // is reported) and a real pause (onPlayWhenReadyChanged).
                val c = controller
                if (c != null && c.playWhenReady && c.playbackState == Player.STATE_BUFFERING) onStalled()
            }
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            onSuppressionChanged(playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (playWhenReady) return
            onPaused(
                when (reason) {
                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS -> PauseCause.FOCUS_LOST
                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY -> PauseCause.BECAME_NOISY
                    else -> PauseCause.USER_REQUEST
                },
            )
        }

        override fun onPlayerError(error: PlaybackException) {
            // The status of a rejected request does not cross the session boundary; the HEAD probe supplies it.
            onError(error.errorCode, null)
        }
    }

    private fun withController(block: (MediaController) -> Unit) {
        controller?.let { block(it); return }
        pending.add(block)
        if (future == null) connect()
    }

    private fun connect() {
        val token = SessionToken(context, ComponentName(context, PodcastPlaybackService::class.java))
        val f = MediaController.Builder(context, token).buildAsync()
        future = f
        f.addListener({
            val c = runCatching { f.get() }.getOrNull() ?: run { future = null; return@addListener }
            c.addListener(listener)
            controller = c
            pending.forEach { it(c) }
            pending.clear()
        }, Executor { it.run() })
    }

    private fun startTicker() {
        ticker?.cancel()
        ticker = scope.launch {
            while (isActive) {
                controller?.let { onTick(it.currentPosition / 1000.0) }
                delay(1_000)
            }
        }
    }

    override fun prepare(uri: String, startMillis: Long) = withController { c ->
        c.setMediaItem(MediaItem.fromUri(uri), startMillis)
        c.prepare()
    }

    override fun play() = withController { it.play() }
    override fun pause() = withController { it.pause() }
    override fun seekTo(millis: Long) = withController { it.seekTo(millis) }
    override fun currentMillis(): Long = controller?.currentPosition ?: 0L
    override fun durationMillis(): Long? = controller?.duration?.takeIf { it > 0 }

    override fun stop() = withController {
        it.stop()
        it.clearMediaItems()
    }

    override fun release() {
        ticker?.cancel()
        controller?.removeListener(listener)
        controller?.release()
        controller = null
        future = null
    }
}
