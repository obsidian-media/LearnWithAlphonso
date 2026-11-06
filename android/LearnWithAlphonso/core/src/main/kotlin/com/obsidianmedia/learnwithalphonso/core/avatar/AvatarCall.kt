package com.obsidianmedia.learnwithalphonso.core.avatar

import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

// The pure parts of the full-screen Practice call: which room, what the caption says, the clock, the "You" tile's bars.
// The Compose screen only draws them. Mirrors the iOS Kit's AvatarCall.swift and the web's src/lib/avatar.

/** The room behind Alphonso. [dimInDark] means the dark picture is the same image under an evening overlay. */
data class CallRoom(val light: String, val dark: String, val dimInDark: Boolean)

object CallScenes {
    val scenarioIds = listOf(
        "coffee", "interview", "airport", "doctor", "smalltalk", "restaurant",
        "hotel", "directions", "apartment", "returns", "negotiation", "debate",
    )

    /** Scenario ids that have their own image (assets/scenes/<id>.webp). A scenario missing here gets the default room. */
    val scenariosWithArt: Set<String> = scenarioIds.toSet()
    val defaultRoom = CallRoom("room-light", "room-dark", dimInDark = false)

    /** [fallback] is the character's own default room ([CharacterKit.defaultRoom]). */
    fun room(scenarioId: String?, withArt: Set<String> = scenariosWithArt, fallback: CallRoom = defaultRoom): CallRoom =
        if (scenarioId != null && scenarioId in withArt) CallRoom(scenarioId, scenarioId, dimInDark = true) else fallback

    /** The evening overlay on a scenario image in dark mode: navy #16203c, multiplied, at 50%. */
    const val EVENING_OVERLAY_OPACITY = 0.5
}

/** What the live caption shows: only the current utterance. [mine] means the learner's own words (a green tint). */
data class CallCaption(val text: String, val mine: Boolean)

object CallCaptionRules {
    /** The last turn of the conversation, unless the learner is holding the button (their words are not known yet). */
    fun caption(turns: List<ChatMessage>, isRecording: Boolean): CallCaption? {
        val last = turns.lastOrNull() ?: return null
        if (isRecording || last.content.isBlank()) return null
        return CallCaption(last.content, mine = last.role == "user")
    }

    /** How many of [wordCount] words are lit at [progress] (0..1) through the audio; a hair past linear. */
    fun litWords(wordCount: Int, progress: Double): Int {
        if (wordCount <= 0) return 0
        val clamped = progress.coerceIn(0.0, 1.0)
        return min(wordCount, ceil(clamped * wordCount * 1.03).toInt())
    }
}

object CallClock {
    /** "0:00", "1:05", "12:30". */
    fun format(seconds: Int): String {
        val s = maxOf(0, seconds)
        return "${s / 60}:${if (s % 60 < 10) "0" else ""}${s % 60}"
    }
}

object CallLevel {
    const val BAR_COUNT = 5
    const val MIN_HEIGHT = 6.0
    const val MAX_HEIGHT = 34.0

    /**
     * A bar's height for the microphone level in dBFS (null: no metering, so the resting height: nothing is faked).
     * Louder is taller; each bar leans a little differently so the five do not move as one block.
     */
    fun barHeight(dBFS: Double?, index: Int): Double {
        if (dBFS == null || !dBFS.isFinite()) return MIN_HEIGHT
        val rms = 10.0.pow(min(dBFS, 0.0) / 20)
        val shaped = min(1.0, sqrt(rms) * 2.2)
        val lean = 0.65 + 0.35 * abs(sin((index + 1) * 1.7))
        return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * min(1.0, shaped * lean)
    }

    /** MediaRecorder.getMaxAmplitude (0..32767) as dBFS; null when silent or unknown. */
    fun dBFSFromAmplitude(amplitude: Int): Double? =
        if (amplitude <= 0) null else 20 * kotlin.math.log10(min(amplitude, 32767) / 32767.0)
}

/** Maps a conversation's separate recorder/reply states onto the voice phase the avatar machine follows. */
object CallPhase {
    /**
     * [replyPending] is set from the moment the reply arrives until its audio ends. [playing] says the audio is
     * actually audible, so the mouth does not move while the speech is still being fetched.
     */
    fun of(
        requestingMic: Boolean, recording: Boolean, transcribing: Boolean, thinking: Boolean, replyPending: Boolean, playing: Boolean,
    ): VoicePhase = VoicePhase(
        when {
            requestingMic -> PhaseKind.REQUESTING_PERMISSION
            recording -> PhaseKind.RECORDING
            transcribing -> PhaseKind.TRANSCRIBING
            thinking -> PhaseKind.THINKING
            replyPending -> if (playing) PhaseKind.SPEAKING else PhaseKind.THINKING
            else -> PhaseKind.IDLE
        },
    )
}
