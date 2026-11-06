package com.obsidianmedia.learnwithalphonso.core.avatar

import com.obsidianmedia.learnwithalphonso.core.content.Course
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

enum class Brows(val wire: String) { NEUTRAL("neutral"), RAISED("raised"), LOWERED("lowered") }

/** One mouth shape held from [start] to [end] (seconds from the start of the spoken reply). */
data class MouthCue(val start: Double, val end: Double, val viseme: Viseme)

/** A stretch of the reply with the brows raised. */
data class BrowSpan(val start: Double, val end: Double)

/**
 * When each mouth shape and brow position happens during one spoken reply. Built once from the reply's text and the
 * length of its audio, then read with the player's position. Pure and deterministic.
 */
data class LipSyncPlan(val cues: List<MouthCue>, val raisedBrows: List<BrowSpan>) {
    /** The mouth at [time]. Closed outside the plan, so a player that has not started or has finished shows a closed mouth. */
    fun visemeAt(time: Double): Viseme {
        val first = cues.firstOrNull() ?: return Viseme.CLOSED
        val last = cues.last()
        if (!(time >= first.start && time < last.end)) return Viseme.CLOSED
        var low = 0
        var high = cues.size - 1
        while (low < high) {
            val mid = (low + high + 1) / 2
            if (cues[mid].start <= time) low = mid else high = mid - 1
        }
        return cues[low].viseme
    }

    fun browsAt(time: Double): Brows = if (raisedBrows.any { time >= it.start && time < it.end }) Brows.RAISED else Brows.NEUTRAL

    companion object { val EMPTY = LipSyncPlan(emptyList(), emptyList()) }
}

object AvatarLipSync {
    /** A shape is held at least this long (except when a word itself is shorter), so the mouth never flickers. */
    const val MINIMUM_HOLD = 0.07
    /** How long the brows stay up at the start of a greeting, at most. */
    const val GREETING_BROW_HOLD = 0.6

    private val greetings = setOf("hello", "hi", "hey", "hola", "bonjour", "salut", "bonsoir", "buenas", "buenos")
    private val closers = setOf("\"", "'", "”", "’", ")", "]", "»")
    private const val SENTENCE_END = ".!?…"
    private val whitespace = Regex("\\s+")

    private class Word(
        val letters: Int,
        val shapes: List<Viseme>,
        val gapUnits: Double,
        val endsSentence: Boolean,
        val endsQuestion: Boolean,
        val isGreeting: Boolean,
    )

    private fun hasLetter(s: String) = AvatarVisemes.lettersOf(s).isNotEmpty()

    /**
     * Spreads the reply's words over [duration] seconds in proportion to their letters, with a one-letter gap between
     * words, a longer one after a comma, a longer still after a full stop. The mouth closes in the gaps.
     */
    fun plan(text: String, course: Course, duration: Double): LipSyncPlan {
        if (!(duration > 0)) return LipSyncPlan.EMPTY
        val tokens = text.split(whitespace)
        val words = mutableListOf<Word>()
        tokens.forEachIndexed { index, token ->
            val letters = AvatarVisemes.lettersOf(token).size
            if (letters == 0) return@forEachIndexed
            val chars = mutableListOf<String>()
            var i = 0
            while (i < token.length) {
                val cp = token.codePointAt(i)
                chars.add(String(Character.toChars(cp)))
                i += Character.charCount(cp)
            }
            while (chars.isNotEmpty() && chars.last() in closers) chars.removeAt(chars.size - 1)
            val end = chars.lastOrNull()
            val hasMoreWords = tokens.drop(index + 1).any { hasLetter(it) }
            var gap = 0.0
            if (hasMoreWords) {
                gap = 1.0
                if (end != null && ",;:".contains(end)) gap += 3
                if (end != null && SENTENCE_END.contains(end)) gap += 5
            }
            val bare = AvatarVisemes.lettersOf(token).joinToString("")
            words.add(
                Word(
                    letters, AvatarVisemes.sequence(token, course), gap,
                    endsSentence = !hasMoreWords || (end != null && SENTENCE_END.contains(end)),
                    endsQuestion = end == "?",
                    isGreeting = words.isEmpty() && bare in greetings,
                ),
            )
        }
        if (words.isEmpty()) return LipSyncPlan.EMPTY

        val totalUnits = words.sumOf { it.letters + it.gapUnits }
        val unit = duration / totalUnits

        val cues = mutableListOf<MouthCue>()
        fun append(start: Double, end: Double, shape: Viseme) {
            if (!(end > start)) return
            val last = cues.lastOrNull()
            if (last != null && last.viseme == shape) cues[cues.size - 1] = MouthCue(last.start, end, shape)
            else cues.add(MouthCue(start, end, shape))
        }

        var t = 0.0
        val wordTimes = mutableListOf<Pair<Double, Double>>()
        words.forEachIndexed { i, word ->
            val wordStart = t
            val isLast = i == words.size - 1
            val wordEnd = if (isLast) duration else t + word.letters * unit
            val picked = thin(word.shapes, wordEnd - wordStart)
            if (picked.isEmpty()) {
                append(wordStart, wordEnd, Viseme.CLOSED)
            } else {
                val each = (wordEnd - wordStart) / picked.size
                var cursor = wordStart
                picked.forEachIndexed { k, shape ->
                    val shapeEnd = if (k == picked.size - 1) wordEnd else cursor + each
                    append(cursor, shapeEnd, shape)
                    cursor = shapeEnd
                }
            }
            wordTimes.add(wordStart to wordEnd)
            t = wordEnd
            if (!isLast) {
                val gapEnd = t + word.gapUnits * unit
                append(t, gapEnd, Viseme.CLOSED)
                t = gapEnd
            }
        }

        val raised = mutableListOf<BrowSpan>()
        if (words[0].isGreeting) raised.add(BrowSpan(0.0, min(GREETING_BROW_HOLD, duration * 0.25)))
        words.forEachIndexed { i, word ->
            if (!word.endsQuestion) return@forEachIndexed
            // The last (up to) three words of the question sentence.
            var first = i
            while (first > 0 && i - first < 2 && !words[first - 1].endsSentence) first -= 1
            raised.add(BrowSpan(wordTimes[first].first, wordTimes[i].second))
        }
        return LipSyncPlan(cues, raised)
    }

    /** Keeps evenly spaced shapes so each is held at least [MINIMUM_HOLD] where the word allows. */
    private fun thin(shapes: List<Viseme>, wordDuration: Double): List<Viseme> {
        val allowed = max(1, floor(wordDuration / MINIMUM_HOLD + 1e-9).toInt())
        if (shapes.size <= allowed) return shapes
        return (0 until allowed).map { shapes[it * shapes.size / allowed] }
    }
}
