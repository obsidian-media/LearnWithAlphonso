package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import kotlin.random.Random

/**
 * "Say it right", the Practice Hub pronunciation drill: a word the learner has already learned, a model to hear, a
 * recording judged on how clearly it was understood. Mirrors src/lib/pronunciation.ts (web, PR #616) and
 * Pronunciation.swift; keep the three in step, including the two confidence thresholds.
 *
 * Speech goes through the EXISTING /api/stt (`AiConversationClient.transcribe`, so it counts against the speaking
 * quota, no new kind) and the model through /api/tts (`synthesizeSpeech`). Nothing here is a new endpoint.
 */
object Pronunciation {
    /** One session is this many words. */
    const val ROUNDS = 8

    /** Fewer learned words than this and the drill says "learn a few words first". */
    const val MIN_POOL = 4

    /** At or above this utterance confidence (0-1), a matching transcript is "Great". Tunable: the one place it lives. */
    const val HIGH_CONFIDENCE = 0.85

    /** At or above this (and below [HIGH_CONFIDENCE]), a matching transcript is "Almost"; below it, "Try again". */
    const val LOW_CONFIDENCE = 0.6

    /** A longer phrase is not a word to drill. */
    private const val MAX_TARGET_WORDS = 4

    enum class Verdict { GREAT, ALMOST, AGAIN }

    private fun normalise(text: String, course: Course): String = when (course) {
        Course.ENGLISH -> SpokenAnswer.normalise(text)
        Course.FRENCH -> SpokenAnswerFr.normalise(text)
        Course.SPANISH -> SpokenAnswerEs.normalise(text)
    }

    /** The same forgiving whole-word comparison as Say the picture, over the per-course speak normalisers. */
    fun matches(transcript: String, term: String, course: Course): Boolean {
        val said = normalise(transcript, course)
        val want = normalise(term, course)
        if (said.isEmpty() || want.isEmpty()) return false
        return said == want || " $said ".contains(" $want ")
    }

    /**
     * The verdict for one attempt from the speech route's text and confidence. A match with high confidence is great; a
     * match with middling confidence is almost; no match, or a match the recogniser was unsure of, is try again. A match
     * with no confidence value (null) is great: nothing says it was unclear. It reflects being understood, not which
     * sound was off.
     */
    fun judge(transcript: String, confidence: Double?, term: String, course: Course): Verdict {
        if (!matches(transcript, term, course)) return Verdict.AGAIN
        if (confidence == null || confidence >= HIGH_CONFIDENCE) return Verdict.GREAT
        if (confidence >= LOW_CONFIDENCE) return Verdict.ALMOST
        return Verdict.AGAIN
    }

    /** A usable drill target: a real word or short phrase that normalises to something. */
    fun usableTarget(term: String, course: Course): Boolean {
        val norm = normalise(term, course)
        if (norm.isEmpty()) return false
        return norm.split(" ").size <= MAX_TARGET_WORDS
    }

    /**
     * The learner's LEARNED words: the vocabulary of every lesson they have completed.
     *
     * LIVE, not a list: derived on each call from the bundled curriculum and the completed-lesson ids, nothing cached
     * across calls, so finishing another lesson grows the pool the next time a session starts. Words with no usable
     * target are excluded and terms are de-duplicated.
     */
    fun learnedPool(units: List<Unit>, completedLessonIds: Set<String>, course: Course): List<VocabItem> {
        val seen = HashSet<String>()
        val pool = ArrayList<VocabItem>()
        for (unit in units) for (lesson in unit.lessons) {
            if (lesson.id !in completedLessonIds) continue
            for (item in deriveVocab(lesson, emptyMap())) {
                if (!usableTarget(item.term, course)) continue
                if (!seen.add(item.term.trim().lowercase())) continue
                pool.add(item)
            }
        }
        return pool
    }

    /** [count] distinct words drawn from the pool (all of it when it is smaller). */
    fun draw(pool: List<VocabItem>, count: Int = ROUNDS, random: Random = Random.Default): List<VocabItem> =
        pool.shuffled(random).take(count)

    /** Stars for a finished session, by share of first-attempt greats, never below one (finishing is the point). */
    fun stars(great: Int, total: Int): Int {
        if (total <= 0) return 1
        val share = great.toDouble() / total
        return if (share >= 0.75) 3 else if (share >= 0.5) 2 else 1
    }
}

enum class PronunciationPhase { ASK, RETRY, RESULT, DONE }

/** What a spoken transcript did, so the screen knows whether to replay the model audio. */
sealed interface PronunciationOutcome {
    /** A first-attempt great: the star is earned. */
    data object Great : PronunciationOutcome

    /** Not great the first time: the model replays and the learner may try once more. */
    data class Retry(val verdict: Pronunciation.Verdict) : PronunciationOutcome

    /** The one retry came back (any verdict): the word is done. */
    data class Finished(val verdict: Pronunciation.Verdict) : PronunciationOutcome

    /** Silence or an empty transcript: not a miss, nothing changes. */
    data object Unheard : PronunciationOutcome
}

/**
 * The state of one session: eight words, forgiving. A miss replays the model and allows ONE retry, then the session
 * goes on whatever the result. No hearts, no penalty. Immutable: every move returns the next state.
 */
data class PronunciationSession(
    val words: List<VocabItem>,
    val index: Int = 0,
    val phase: PronunciationPhase = if (words.isEmpty()) PronunciationPhase.DONE else PronunciationPhase.ASK,
    val verdict: Pronunciation.Verdict? = null,
    val greatFirst: Int = 0,
    /** Greats shown so far this session (first time or on the retry); it alternates the cheer and the impressed pose. */
    val greatShown: Int = 0,
    /** Alphonso's current line for the result of an attempt (a varied praise line or the move-on line); null while asking. */
    val line: String? = null,
    /** The last bank index said per band, so the same line is never said twice in a row. */
    val lastLine: Map<Pronunciation.Verdict, Int> = emptyMap(),
) {
    val current: VocabItem? get() = words.getOrNull(index)
    val isLast: Boolean get() = index + 1 >= words.size
    val stars: Int get() = Pronunciation.stars(greatFirst, words.size)
    val nextLabel: String get() = if (isLast) "Finish" else "Next"
    val skipLabel: String get() = if (isLast) "Finish" else "Skip this word"

    /** The wrap line, "N of M clearly". */
    val clearlyLine: String get() = SayItRight.clearly(greatFirst, words.size)

    /** Alphonso's pose for the current state; [listening] is true while the mic records or a clip is being checked. */
    fun pose(listening: Boolean): SayItRightPose = SayItRightPose.of(phase, listening, verdict, greatShown)

    private fun saying(v: Pronunciation.Verdict, roll: Double): Pair<String, Map<Pronunciation.Verdict, Int>> {
        val bank = SayItRight.praise(v)
        val i = SayItRight.nextLineIndex(bank.size, lastLine[v], roll)
        return bank[i] to (lastLine + (v to i))
    }

    /** [roll] in [0, 1) picks the praise line; inject it in tests. */
    fun submit(
        transcript: String, confidence: Double?, course: Course, roll: Double = Random.nextDouble(),
    ): Pair<PronunciationSession, PronunciationOutcome> {
        val word = current ?: return this to PronunciationOutcome.Unheard
        val spoken = transcript.trim()
        if (spoken.isEmpty()) return this to PronunciationOutcome.Unheard
        return when (phase) {
            PronunciationPhase.ASK -> {
                val v = Pronunciation.judge(spoken, confidence, word.term, course)
                val (said, last) = saying(v, roll)
                if (v == Pronunciation.Verdict.GREAT) {
                    copy(
                        verdict = v, greatFirst = greatFirst + 1, greatShown = greatShown + 1, line = said, lastLine = last,
                        phase = PronunciationPhase.RESULT,
                    ) to PronunciationOutcome.Great
                } else {
                    copy(verdict = v, line = said, lastLine = last, phase = PronunciationPhase.RETRY) to PronunciationOutcome.Retry(v)
                }
            }
            PronunciationPhase.RETRY -> {
                val v = Pronunciation.judge(spoken, confidence, word.term, course)
                val next = if (v == Pronunciation.Verdict.GREAT) {
                    val (said, last) = saying(v, roll)
                    copy(verdict = v, greatShown = greatShown + 1, line = said, lastLine = last, phase = PronunciationPhase.RESULT)
                } else {
                    copy(verdict = v, line = SayItRight.MOVE_ON, phase = PronunciationPhase.RESULT)
                }
                next to PronunciationOutcome.Finished(v)
            }
            PronunciationPhase.RESULT, PronunciationPhase.DONE -> this to PronunciationOutcome.Unheard
        }
    }

    /** Next word, or done after the last. Allowed in every phase but done (skipping a word is never penalised). */
    fun next(): PronunciationSession = when {
        phase == PronunciationPhase.DONE -> this
        isLast -> copy(verdict = null, line = null, phase = PronunciationPhase.DONE)
        else -> copy(verdict = null, line = null, index = index + 1, phase = PronunciationPhase.ASK)
    }
}

/**
 * The two network calls of the drill, both on EXISTING routes: the learner's speech to /api/stt (the speaking daily
 * quota, kind `stt`; no new kind), keeping the confidence, and the model pronunciation from /api/tts.
 */
class PronunciationSpeech(private val ai: AiConversationClient) {
    suspend fun transcribe(audio: ByteArray, course: Course, debugTiming: String? = null): SttResult =
        ai.transcribe(audio, "audio/m4a", course.code, debugTiming)

    suspend fun modelAudio(term: String, voice: String?, course: Course): ByteArray =
        ai.synthesizeSpeech(term, voice = voice, course = course.code)
}

/** Alphonso's in-pose reactions for Say it right ("Talk with Alphonso"); [asset] is the file under assets/poses. */
enum class SayItRightPose(val asset: String) {
    EXPLAINING("poses/alphonso-explaining-pointer.webp"),
    LISTENING("poses/alphonso-listening-headphones.webp"),
    THINKING("poses/alphonso-thinking-temple.webp"),
    CHEER("poses/alphonso-levelup-cheer.webp"),
    IMPRESSED("poses/alphonso-surprised-impressed.webp"),
    ;

    companion object {
        /**
         * Asking he explains, while the learner talks (or the clip is checked) he listens, after a miss he thinks it
         * through with them, and on a great he cheers or is impressed, alternating by how many greats there have been
         * (counting this one) so a run of wins varies. Mirrors src/lib/say-it-right.ts.
         */
        fun of(phase: PronunciationPhase, listening: Boolean, verdict: Pronunciation.Verdict?, greatCount: Int): SayItRightPose = when {
            listening -> LISTENING
            phase == PronunciationPhase.DONE -> CHEER
            phase == PronunciationPhase.RETRY -> THINKING
            phase == PronunciationPhase.RESULT ->
                if (verdict == Pronunciation.Verdict.GREAT) (if (greatCount % 2 == 1) CHEER else IMPRESSED) else THINKING
            else -> EXPLAINING
        }
    }
}

/**
 * The warm words of Say it right: a bank of lines per band (never "wrong"), chosen without an immediate repeat. The
 * order of each bank is part of the contract: the web and iOS twins carry the same lines.
 */
object SayItRight {
    /** The mic ring and auto-stop length, matching Say the picture. */
    const val MAX_RECORD_MS = SayThePicture.MAX_RECORD_MS

    fun praise(v: Pronunciation.Verdict): List<String> = when (v) {
        Pronunciation.Verdict.GREAT -> listOf("Spot on!", "You've got it!", "Lovely!", "Beautifully said!", "That was clear!")
        Pronunciation.Verdict.ALMOST -> listOf("So close. A touch clearer.", "Nearly there. Once more, nice and clear.", "Almost! Listen, then try again.")
        Pronunciation.Verdict.AGAIN -> listOf("Let's try that one together.", "No rush. Listen, then say it with me.", "Let's hear it once more.")
    }

    /** After the one retry still misses: a kind move-on line. */
    const val MOVE_ON = "Good try. It gets easier each time."
    const val ASK_LINE = "Say this one after me"
    const val LISTENING_LINE = "I'm listening..."
    const val CHECKING_LINE = "Let me hear how clear that was..."
    const val RETRY_HINT = "Listen, then try once more."

    /** Index of the next line from a bank of [size], never equal to [last]. [roll] is in [0, 1): inject it in tests. */
    fun nextLineIndex(size: Int, last: Int?, roll: Double): Int {
        if (size <= 1) return 0
        val clamped = roll.coerceIn(0.0, 0.999999)
        if (last == null || last < 0 || last >= size) return (clamped * size).toInt()
        val i = (clamped * (size - 1)).toInt()
        return if (i >= last) i + 1 else i
    }

    fun clearly(clear: Int, total: Int): String = "$clear of $total clearly"
}
