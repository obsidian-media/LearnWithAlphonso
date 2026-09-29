package com.obsidianmedia.learnwithalphonso.audio

import android.content.Context
import android.media.MediaPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import kotlin.coroutines.resume

/** Plays a short reply clip (TTS bytes) to completion; the iOS screens use AVAudioPlayer the same way. */
class AudioPlayback(private val context: Context) {
    private var player: MediaPlayer? = null

    /** Returns false when playback could not start. Suspends until the clip finishes. */
    suspend fun play(bytes: ByteArray): Boolean {
        stop()
        val file = withContext(Dispatchers.IO) { File(context.cacheDir, "reply-${UUID.randomUUID()}.audio").apply { writeBytes(bytes) } }
        return try {
            suspendCancellableCoroutine { cont ->
                val mp = MediaPlayer()
                player = mp
                mp.setOnCompletionListener { mp.release(); player = null; file.delete(); if (cont.isActive) cont.resume(true) }
                mp.setOnErrorListener { _, _, _ -> mp.release(); player = null; file.delete(); if (cont.isActive) cont.resume(false); true }
                cont.invokeOnCancellation { runCatching { mp.release() }; player = null; file.delete() }
                runCatching {
                    mp.setDataSource(file.absolutePath)
                    mp.prepare()
                    mp.start()
                }.onFailure { mp.release(); player = null; file.delete(); if (cont.isActive) cont.resume(false) }
            }
        } finally {
            file.delete()
        }
    }

    fun stop() {
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
    }
}
