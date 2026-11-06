package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Question
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToLong

// The lesson flow's rules (visual round 6, part 2). Ports of the web's src/lib/lesson-xp.ts, lesson-time.ts,
// lesson-stage.ts and confetti.ts; iOS keeps the same rules in the Kit's LessonFlow.swift. LessonFlowTest uses the
// same vectors.

/** What the app knows about the learner's earlier tries of this lesson when it opens. */
sealed interface LessonPreviousBest {
    /** Never completed: every right answer pays. */
    data object FirstTry : LessonPreviousBest
    /** Completed before with this many right answers (the server's lesson_completions row). */
    data class Best(val correct: Int) : LessonPreviousBest
    /** Not known (offline when the lesson opened): no XP is promised per answer. */
    data object Unknown : LessonPreviousBest
}

/** The lesson's XP as the learner sees it, from the server's own formula (computeXpGain, paid by the replay rule). */
object LessonXp {
    const val PER_RIGHT_ANSWER = 10
    const val PERFECT_BONUS = 20

    /** The most a lesson of [total] questions can pay: every answer right, perfect bonus included. */
    fun maxXp(total: Int): Int = computeXpGain(total, total)

    /**
     * The verdict's "+N XP" for a right answer, or null for none. [rightSoFar] counts this answer. A replay pays only
     * what improves on the best earlier score, so a right answer shows XP only once the learner is past it: the chips
     * never promise XP the server will not pay.
     */
    fun answerChip(rightSoFar: Int, previousBest: LessonPreviousBest): Int? = when (previousBest) {
        LessonPreviousBest.FirstTry -> PER_RIGHT_ANSWER
        is LessonPreviousBest.Best -> if (rightSoFar > previousBest.correct) PER_RIGHT_ANSWER else null
        LessonPreviousBest.Unknown -> null
    }

    /**
     * What a completion queued for a later sync can pay, for "Up to +N XP once it syncs". A replay pays only past the
     * best earlier score, so a known best caps it (0 when this try is no better); unknown history falls back to this
     * attempt's full value, which "Up to" covers.
     */
    fun queuedEstimate(correct: Int, total: Int, previousBest: LessonPreviousBest): Int = when (previousBest) {
        is LessonPreviousBest.Best -> {
            val best = previousBest.correct
            max(0, computeXpGain(max(best, correct), total) - computeXpGain(best, total))
        }
        else -> computeXpGain(correct, total)
    }

    enum class Kind { ANSWERS, PERFECT, EARLIER, REGRADED }

    data class Line(val kind: Kind, val label: String, val xp: Int) {
        /** "Perfect lesson +20", "Already earned on an earlier try −60" (a true minus sign). */
        val text: String get() = "$label ${if (xp < 0) "−" else "+"}${abs(xp)}"
    }

    /**
     * The complete screen's XP lines for [correct] of [total] (the server's count), given what it [awarded]. They always
     * add up to the award: the only gap between the formula and the award is the replay rule.
     */
    fun breakdown(correct: Int, total: Int, awarded: Int): List<Line> {
        val lines = mutableListOf(Line(Kind.ANSWERS, "$correct right answer${if (correct == 1) "" else "s"}", correct * PER_RIGHT_ANSWER))
        if (total > 0 && correct == total) lines += Line(Kind.PERFECT, "Perfect lesson", PERFECT_BONUS)
        val formula = lines.sumOf { it.xp }
        if (awarded < formula) lines += Line(Kind.EARLIER, "Already earned on an earlier try", awarded - formula)
        if (awarded > formula) lines += Line(Kind.REGRADED, "Topped up to your best score", awarded - formula)
        return lines
    }
}

/**
 * The last question's Finish completes the lesson once. A second tap while the completion is in flight would be a
 * zero-XP replay, and whichever answer landed last would set the screen.
 */
class FinishGate {
    var started = false
        private set

    /** True the first time only. */
    fun begin(): Boolean {
        if (started) return false
        started = true
        return true
    }

    /** For the next lesson in the same player. */
    fun reset() {
        started = false
    }
}

/** How long a lesson takes, for lesson start's honest "About N min": the bundled copy of src/data/lesson-timing.json. */
@Serializable
data class LessonTiming(val secondsPerQuestion: Map<String, Int>, val secondsPerNewWord: Int) {
    /** Whole minutes, rounded up, at least 1. */
    fun estimateMinutes(questionTypes: List<String>, newWords: Int): Int {
        val seconds = questionTypes.sumOf { secondsPerQuestion[it] ?: 0 } + newWords * secondsPerNewWord
        return max(1, ceil(seconds / 60.0).toInt())
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        fun fromJson(text: String): LessonTiming = json.decodeFromString(serializer(), text)
    }
}

/** The curriculum's type name ("mc", "fill"...), the key lesson-timing.json uses. */
val Question.typeKey: String
    get() = when (this) {
        is Question.MultipleChoice -> "mc"
        is Question.FillInBlank -> "fill"
        is Question.Reorder -> "reorder"
        is Question.Listening -> "listening"
        is Question.Speak -> "speak"
        is Question.Translate -> "translate"
    }

/** The question's prompt, whatever its type: Alphonso's line in the bubble. */
val Question.promptText: String
    get() = when (this) {
        is Question.MultipleChoice -> prompt
        is Question.FillInBlank -> prompt
        is Question.Reorder -> prompt
        is Question.Listening -> prompt
        is Question.Speak -> prompt
        is Question.Translate -> prompt
    }

/** The answer to show under "Not quite" (for a translation, one of several accepted wordings). */
val Question.correctAnswerText: String
    get() = when (this) {
        is Question.MultipleChoice -> choices.getOrNull(answer) ?: ""
        is Question.FillInBlank -> answer
        is Question.Reorder -> answer
        is Question.Listening -> answer
        is Question.Speak -> answer
        is Question.Translate -> acceptableAnswers.firstOrNull() ?: ""
    }

/** Elapsed time that stops while paused (the app in the background). Times are passed in, so it is testable. */
class ActiveTimer(now: Long) {
    private var total = 0L
    private var since: Long? = now

    fun pause(now: Long) {
        val s = since ?: return
        total += now - s
        since = null
    }

    fun resume(now: Long) {
        if (since == null) since = now
    }

    fun elapsedMs(now: Long): Long = total + (since?.let { now - it } ?: 0L)
}

/** m:ss, minutes unbounded. */
fun formatElapsed(ms: Long): String {
    val s = max(0L, (ms / 1000.0).roundToLong())
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

/** Alphonso's five expressions, cut from the realistic kit with identical framing so a swap is a crossfade. */
enum class LessonExpression(val file: String, val description: String) {
    TALK("talk", "Alphonso, talking"),
    NEUTRAL("neutral", "Alphonso, listening"),
    HAPPY("happy", "Alphonso, smiling"),
    HMM("hmm", "Alphonso, thinking"),
    WOW("wow", "Alphonso, amazed"),
}

object LessonStage {
    /** Alphonso's study by day: the room for a unit the map does not know. */
    const val FALLBACK_ROOM = "room-light"
    /** Below this height (dp) the phone counts as small. */
    const val SMALL_PHONE_HEIGHT = 700
    /** The HUD's bottom edge in the room (16 from the top, 40 tall). Alphonso's ears must stay below it. */
    const val HUD_BOTTOM = 56
    /** How far Alphonso sinks below the room's foot, so the bubble cuts him off at the robe. */
    const val ALPHONSO_SINK = 14
    /** His ear tips, as a share of the square art's height from its top (5 px of 640). */
    const val EAR_TOP = 5.0 / 640
    /** A prompt longer than this runs past two lines of the bubble. */
    const val LONG_PROMPT_CHARS = 60

    fun roomId(unitId: String?, units: Map<String, String>): String = unitId?.let { units[it] } ?: FALLBACK_ROOM

    /** He asks; he listens once you pick; he smiles when you are right and goes "hmm" when you are not. */
    fun expression(picked: Boolean, verdict: Boolean?): LessonExpression = when (verdict) {
        true -> LessonExpression.HAPPY
        false -> LessonExpression.HMM
        null -> if (picked) LessonExpression.NEUTRAL else LessonExpression.TALK
    }

    enum class Size { FULL, LONG, SMALL }

    data class RoomLayout(val size: Size, val roomHeight: Int, val alphonsoWidth: Int)

    /** 380 with Alphonso 315 wide; 300 and 255 for a question past two lines; 248 and 205 on a phone under 700 tall. */
    fun layout(viewportHeight: Int, prompt: String): RoomLayout = when {
        viewportHeight in 1 until SMALL_PHONE_HEIGHT -> RoomLayout(Size.SMALL, 248, 205)
        prompt.length > LONG_PROMPT_CHARS -> RoomLayout(Size.LONG, 300, 255)
        else -> RoomLayout(Size.FULL, 380, 315)
    }
}

/** The unit -> room table bundled as assets/content/unit-rooms.json. */
object UnitRooms {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Table(val units: Map<String, String>)

    fun fromJson(text: String): Map<String, String> = json.decodeFromString(Table.serializer(), text).units
}

/** An answer button's state: picked, right, wrong, or dimmed once the verdict is in. */
enum class LessonAnswerState {
    IDLE, SELECTED, CORRECT, INCORRECT, DIMMED;

    companion object {
        fun of(checked: Boolean, isPicked: Boolean, isRight: Boolean): LessonAnswerState = when {
            checked && isRight -> CORRECT
            checked && isPicked -> INCORRECT
            checked -> DIMMED
            isPicked -> SELECTED
            else -> IDLE
        }
    }
}

/**
 * The lesson-complete confetti, drawn in code: about 90 rectangles and stars burst from two points under the title
 * and fall; under Reduce Motion they are a still scatter. Deterministic for a seed, with the web's numbers.
 */
object Confetti {
    /** The robe's colours only, as design-system colour names. */
    enum class Colour { XP, ON_HERO_KICK, BRAND, CHOICE, CARD, XP_EDGE }

    data class Piece(
        val x0: Double, val vx: Double, val vy: Double, val rot: Double, val vr: Double, val w: Double, val h: Double,
        val colour: Colour, val star: Boolean, val restX: Double, val restY: Double,
    )

    /** How long one burst is drawn. */
    const val SECONDS = 2.2
    private const val COUNT = 90
    private const val GRAVITY = 420.0
    private const val START_Y = 70.0

    fun pieces(seed: Int, width: Double): List<Piece> {
        var s = seed.toLong()
        fun r(): Double {
            s = (s * 16807) % 2_147_483_647
            return s / 2_147_483_647.0
        }
        return List(COUNT) { i ->
            // The draw order matches the web's object literal, so the same seed gives the same pieces.
            val vx = (r() - 0.5) * 340
            val vy = -180 - r() * 260
            val rot = r() * PI * 2
            val vr = (r() - 0.5) * 12
            val w = 5 + r() * 5
            val h = 8 + r() * 6
            val restX = r() * width
            val restY = 20 + r() * 300
            Piece(
                (if (i % 2 == 1) 0.28 else 0.72) * width, vx, vy, rot, vr, w, h,
                Colour.entries[i % Colour.entries.size], i % 9 == 0, restX, restY,
            )
        }
    }

    data class At(val x: Double, val y: Double, val angle: Double)

    /** Where a piece is [t] seconds into the burst. */
    fun position(p: Piece, t: Double): At = At(p.x0 + p.vx * t, START_Y + p.vy * t + GRAVITY * t * t, p.rot + p.vr * t)
}

/**
 * The headline on lesson complete, chosen by how the lesson went (iOS LessonFinishCopy): "Nice work!" over a 0/8
 * result read as a tone mismatch, so lower scores get an encouraging line instead.
 */
object LessonFinishCopy {
    const val GOOD = "Nice work!"
    const val FAIR = "Good progress!"
    const val LOW = "Good try. Keep going!"

    fun headline(correct: Int, total: Int): String {
        if (total <= 0) return GOOD
        val share = max(0, correct).toDouble() / total
        return when {
            share >= 0.8 -> GOOD
            share >= 0.5 -> FAIR
            else -> LOW
        }
    }
}
