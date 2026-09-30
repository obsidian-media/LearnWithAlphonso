package com.obsidianmedia.learnwithalphonso.podcast

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
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

    private var controller: MediaController? = null
    private var future: ListenableFuture<MediaController>? = null
    private val pending = ArrayList<(MediaController) -> Unit>()
    private var ticker: Job? = null

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) onEnded()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) startTicker() else ticker?.cancel()
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

    override fun release() {
        ticker?.cancel()
        controller?.removeListener(listener)
        controller?.release()
        controller = null
        future = null
    }
}
