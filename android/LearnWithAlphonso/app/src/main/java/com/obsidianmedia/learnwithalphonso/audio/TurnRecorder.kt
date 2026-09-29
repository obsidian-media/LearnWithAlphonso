package com.obsidianmedia.learnwithalphonso.audio

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Port of RecordingState.swift: a counter of live recorders, so the podcast
 * player (Plan 4) can pause while any microphone capture is running and
 * resume only when the last one ends.
 */
object RecordingState {
    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()
    private var active = 0

    @Synchronized fun began() { active += 1; _isRecording.value = active > 0 }
    @Synchronized fun ended() { active = maxOf(0, active - 1); _isRecording.value = active > 0 }
    @Synchronized fun activeCount(): Int = active
}

/**
 * The Android counterpart of the iOS *TurnRecorder classes: AAC in an MPEG-4
 * container, 44.1 kHz mono, written to a temp file that stop() reads and
 * deletes. Same minimums as iOS (0.4 s, 4096 bytes).
 */
class TurnRecorder(private val context: Context, private val nowMillis: () -> Long = System::currentTimeMillis) : RecorderPort {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt: Long? = null

    override fun start() {
        RecordingState.began()
        try {
            val out = File(context.cacheDir, "turn-${UUID.randomUUID()}.m4a")
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(44_100)
            r.setAudioChannels(1)
            r.setAudioEncodingBitRate(96_000)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = out
            startedAt = nowMillis()
        } catch (e: Exception) {
            RecordingState.ended()
            recorder?.release()
            recorder = null
            file?.delete()
            file = null
            throw e
        }
    }

    override fun remainingMillisToMinimumDuration(): Long? =
        startedAt?.let { s -> (ConversationTurnEngine.MINIMUM_DURATION_MS - (nowMillis() - s)).takeIf { it > 0 } }

    override fun elapsedMillis(): Long? = startedAt?.let { nowMillis() - it }

    override suspend fun stop(): ByteArray? = withContext(Dispatchers.IO) {
        val r = recorder ?: return@withContext null
        RecordingState.ended()
        val f = file
        runCatching { r.stop() }
        r.release()
        recorder = null
        startedAt = null
        file = null
        val bytes = f?.takeIf { it.exists() }?.readBytes()
        f?.delete()
        bytes
    }

    override fun cancelIfRecording() {
        val r = recorder ?: return
        runCatching { r.stop() }
        r.release()
        recorder = null
        startedAt = null
        file?.delete()
        file = null
        RecordingState.ended()
    }
}
