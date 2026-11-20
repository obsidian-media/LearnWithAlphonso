package com.obsidianmedia.learnwithalphonso.audio

import android.content.Context
import android.media.MediaCodec
import android.media.MediaDataSource
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaPlayer
import android.media.PlaybackParams
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.obsidianmedia.learnwithalphonso.core.logic.ClipTempFiles
import com.obsidianmedia.learnwithalphonso.core.logic.Waveform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Which clip of Say it right's "Hear you vs Alphonso" is playing. */
enum class SirClip { YOU, MODEL, MODEL_SLOW }

/**
 * The audio behind Say it right's "Hear you vs Alphonso": the learner's last attempt and Alphonso's model for the
 * shown word, held IN MEMORY ONLY (byte arrays in this object, played through a [MediaDataSource] over those bytes,
 * never saved or uploaded; the recording's one upload is the /api/stt call that already happens) and freed by
 * [release] when the word changes and when the screen's view model is cleared.
 *
 * One clip plays at a time; playing one stops the other. "Say it slower" plays the model's SAME bytes at
 * [Waveform.SLOW_RATE] through MediaPlayer's [PlaybackParams] (speed only, pitch held at 1), so it costs no second
 * /api/tts call.
 *
 * Waveforms: [decodePeaks] decodes a clip with MediaExtractor + MediaCodec and runs the samples through the core's
 * [Waveform.peaks]. A clip that cannot be decoded keeps null peaks: the screen draws a flat row and playing still works.
 */
class PronunciationClips(private val context: Context, private val scope: CoroutineScope) {
    var playing by mutableStateOf<SirClip?>(null)
        private set
    /** 0..1 through the clip that is playing (ignored under Reduce Motion). */
    var progress by mutableFloatStateOf(0f)
        private set
    var hasYou by mutableStateOf(false)
        private set
    var youPeaks by mutableStateOf<DoubleArray?>(null)
        private set
    var modelPeaks by mutableStateOf<DoubleArray?>(null)
        private set

    private var youAudio: ByteArray? = null
    private var modelAudio: ByteArray? = null
    private var modelTerm: String? = null
    private var player: MediaPlayer? = null
    private var ticker: Job? = null
    /** Bumped whenever that clip is replaced or freed, so a late decode never lands on the wrong attempt or word. One each: a new attempt must not invalidate the model's pending decode. */
    private var youSerial = 0
    private var modelSerial = 0

    /** Whether Alphonso's audio for [term] is already held (Hear it, the waveform and Say it slower reuse it). */
    fun hasModel(term: String): Boolean = modelAudio != null && modelTerm == term

    /** Keeps the learner's latest attempt, replacing the last one. */
    fun setYou(audio: ByteArray) {
        if (playing == SirClip.YOU) stop()
        youSerial += 1
        val mine = youSerial
        youAudio = audio
        hasYou = true
        youPeaks = null
        scope.launch {
            val peaks = withContext(Dispatchers.Default) { decodePeaks(context, audio) }
            if (mine == youSerial && hasYou) youPeaks = peaks
        }
    }

    /** Keeps the model audio the screen just fetched for [term]. */
    fun setModel(term: String, audio: ByteArray) {
        modelSerial += 1
        val mine = modelSerial
        modelAudio = audio
        modelTerm = term
        modelPeaks = null
        scope.launch {
            val peaks = withContext(Dispatchers.Default) { decodePeaks(context, audio) }
            if (mine == modelSerial && modelTerm == term) modelPeaks = peaks
        }
    }

    /** Plays one clip (stopping whatever else is playing). False when there is nothing to play or it will not start. */
    fun play(clip: SirClip): Boolean {
        stop()
        val bytes = (if (clip == SirClip.YOU) youAudio else modelAudio) ?: return false
        val mp = MediaPlayer()
        val started = runCatching {
            mp.setDataSource(BytesDataSource(bytes))
            mp.prepare()
            // Speed only: pitch stays at 1, so slower does not sound lower.
            if (clip == SirClip.MODEL_SLOW) mp.playbackParams = PlaybackParams().setSpeed(Waveform.SLOW_RATE).setPitch(1f)
            mp.setOnCompletionListener { if (player === mp) stop() }
            mp.setOnErrorListener { _, _, _ -> if (player === mp) stop(); true }
            mp.start()
        }.isSuccess
        if (!started) { runCatching { mp.release() }; return false }
        player = mp
        playing = clip
        progress = 0f
        ticker = scope.launch {
            while (isActive) {
                val p = player
                if (p != null) {
                    val d = runCatching { p.duration }.getOrDefault(0)
                    if (d > 0) progress = (runCatching { p.currentPosition }.getOrDefault(0).toFloat() / d).coerceIn(0f, 1f)
                }
                delay(50)
            }
        }
        return true
    }

    /** Tap a waveform: plays that clip, or stops it when it is the one already playing. */
    fun toggle(clip: SirClip) { if (playing == clip) stop() else play(clip) }

    fun stop() {
        ticker?.cancel()
        ticker = null
        player?.let { runCatching { it.stop() }; runCatching { it.release() } }
        player = null
        playing = null
        progress = 0f
    }

    /** Frees every clip (the word changed, or the screen closed). */
    fun release() {
        stop()
        youSerial += 1
        modelSerial += 1
        youAudio = null
        modelAudio = null
        modelTerm = null
        hasYou = false
        youPeaks = null
        modelPeaks = null
    }

    /** The bytes of a clip as a media source, so nothing is written to storage to play it. */
    private class BytesDataSource(private val bytes: ByteArray) : MediaDataSource() {
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
            if (position >= bytes.size) return -1
            val n = minOf(size.toLong(), bytes.size - position).toInt()
            System.arraycopy(bytes, position.toInt(), buffer, offset, n)
            return n
        }
        override fun getSize(): Long = bytes.size.toLong()
        override fun close() = Unit
    }

    companion object {
        /** Deletes any decode temp file a killed process left behind (the learner's voice). At launch and when the screen opens. */
        fun sweepLeftovers(context: Context) { ClipTempFiles.sweep(context.cacheDir) }

        /** A word is a second or two; the cap only protects memory from a surprise. */
        private const val MAX_SECONDS = 30

        /**
         * The bars for a clip's bytes, or null when they cannot be decoded. The bytes are written to a cache file only
         * for the length of the decode (MediaExtractor reads a path), then deleted. Call off the main thread.
         */
        fun decodePeaks(context: Context, bytes: ByteArray): DoubleArray? {
            val file = ClipTempFiles.create(context.cacheDir)
            return try {
                file.writeBytes(bytes)
                val samples = decodeFirstChannel(file.absolutePath) ?: return null
                if (samples.isEmpty()) null else Waveform.peaks(samples)
            } catch (_: Throwable) {
                null
            } finally {
                file.delete()
            }
        }

        private fun decodeFirstChannel(path: String): FloatArray? {
            val extractor = MediaExtractor()
            var codec: MediaCodec? = null
            try {
                extractor.setDataSource(path)
                val track = (0 until extractor.trackCount).firstOrNull {
                    extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
                } ?: return null
                extractor.selectTrack(track)
                val format = extractor.getTrackFormat(track)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
                var channels = if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 1
                val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) format.getInteger(MediaFormat.KEY_SAMPLE_RATE) else 44_100
                val cap = sampleRate * MAX_SECONDS
                codec = MediaCodec.createDecoderByType(mime)
                codec.configure(format, null, null, 0)
                codec.start()
                var out = FloatArray(sampleRate)
                var count = 0
                val info = MediaCodec.BufferInfo()
                var inputDone = false
                var outputDone = false
                var idle = 0
                while (!outputDone && count < cap) {
                    if (!inputDone) {
                        val i = codec.dequeueInputBuffer(10_000)
                        if (i >= 0) {
                            val buf = codec.getInputBuffer(i)!!
                            val n = extractor.readSampleData(buf, 0)
                            if (n < 0) {
                                codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(i, 0, n, extractor.sampleTime, 0)
                                extractor.advance()
                            }
                        }
                    }
                    val o = codec.dequeueOutputBuffer(info, 10_000)
                    when {
                        o >= 0 -> {
                            idle = 0
                            val buf = codec.getOutputBuffer(o)!!
                            buf.position(info.offset)
                            buf.limit(info.offset + info.size)
                            val shorts = buf.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer()
                            val frames = shorts.remaining() / maxOf(1, channels)
                            for (f in 0 until frames) {
                                if (count == out.size) out = out.copyOf(minOf(cap, out.size * 2).coerceAtLeast(count + 1))
                                if (count >= cap) break
                                out[count++] = shorts.get(f * channels) / 32768f
                            }
                            codec.releaseOutputBuffer(o, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                        }
                        o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            val f = codec.outputFormat
                            if (f.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        }
                        else -> if (++idle > 300) return null
                    }
                }
                return out.copyOf(count)
            } finally {
                runCatching { codec?.stop() }
                runCatching { codec?.release() }
                runCatching { extractor.release() }
            }
        }
    }
}
