package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import kotlin.random.Random

/**
 * "Say the picture", the Practice Hub activity: a vocabulary word's photo with no text, the learner says the word.
 * Mirrors src/lib/say-the-picture.ts (web, PR #609) and SayThePicture.swift; keep the three in step.
 *
 * Speech goes through the EXISTING /api/stt (`AiConversationClient.transcribe`, so it counts against the speaking
 * quota, no new kind) and the model through /api/tts (`synthesizeSpeech`). Nothing here is a new endpoint.
 */
object SayThePicture {
    /** One session is this many pictures. */
    const val ROUNDS = 8

    /** Fewer image words than this and the activity says "not enough words with pictures yet". */
    const val MIN_POOL = 4

    /** Only photos from the project's own public bucket are ever drawn (same origin as VocabImagePolicy on iOS). */
    private const val ALLOWED_URL_PREFIX = "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/"

    data class PictureWord(val term: String, val image: VocabImageRef)

    /**
     * Every word of the course that has a renderable picture, learned or not.
     *
     * LIVE, not a list: derived on each call from the lessons' own vocabulary, with each word's image looked up in
     * [images] at that moment. A word that gains a photo is in the pool the next time a session starts, with no
     * curation step. Deliberately nothing is cached, so a snapshot cannot creep in.
     */
    fun pool(units: List<Unit>, images: Map<String, VocabImageRef>): List<PictureWord> {
        val seen = HashSet<String>()
        val pool = ArrayList<PictureWord>()
        for (unit in units) for (lesson in unit.lessons) for (item in deriveVocab(lesson, images)) {
            val image = item.image ?: continue
            if (!image.url.startsWith(ALLOWED_URL_PREFIX)) continue
            if (!seen.add(item.term.trim().lowercase())) continue
            pool.add(PictureWord(item.term, image))
        }
        return pool
    }

    /** [count] distinct words drawn from the pool (all of it when it is smaller). */
    fun draw(pool: List<PictureWord>, count: Int = ROUNDS, random: Random = Random.Default): List<PictureWord> =
        pool.shuffled(random).take(count)

    /**
     * Forgiving grade for one picture word. The same per-course normalisation as the speak exercise; the word counts
     * when it is the whole utterance OR appears in it as whole words ("el abogado", "a dog"), because a learner
     * naming a picture naturally adds an article. Empty speech is never a hit.
     */
    fun said(transcript: String, term: String, course: Course): Boolean {
        val norm: (String) -> String = when (course) {
            Course.ENGLISH -> SpokenAnswer::normalise
            Course.FRENCH -> SpokenAnswerFr::normalise
            Course.SPANISH -> SpokenAnswerEs::normalise
        }
        val said = norm(transcript)
        val want = norm(term)
        if (said.isEmpty() || want.isEmpty()) return false
        return said == want || " $said ".contains(" $want ")
    }

    /** Stars for a finished session, by share said first time, never below one (finishing is the point). */
    fun stars(correct: Int, total: Int): Int {
        if (total <= 0) return 1
        val share = correct.toDouble() / total
        return if (share >= 0.75) 3 else if (share >= 0.5) 2 else 1
    }
}

enum class SayPicturePhase { ASK, RIGHT, REVEAL, DONE }

/** What a spoken transcript did, so the screen knows whether to play the model audio. */
enum class SayPictureOutcome { RIGHT, REVEAL, REPEATED, UNHEARD }

/**
 * The state of one session: eight pictures, forgiving, a miss teaches the word and goes on. No hearts, no penalty.
 * Immutable: every move returns the next state.
 */
data class SayPictureSession(
    val words: List<SayThePicture.PictureWord>,
    val index: Int = 0,
    val phase: SayPicturePhase = if (words.isEmpty()) SayPicturePhase.DONE else SayPicturePhase.ASK,
    val firstTry: Int = 0,
    /** What the learner said when repeating after a reveal (any speech ends the word). */
    val heard: String? = null,
) {
    val current: SayThePicture.PictureWord? get() = words.getOrNull(index)
    val isLast: Boolean get() = index + 1 >= words.size
    val stars: Int get() = SayThePicture.stars(firstTry, words.size)
    val nextLabel: String get() = if (isLast) "Finish" else "Next"
    val nextWordLabel: String get() = if (isLast) "Finish" else "Next word"

    /**
     * A transcript arrived. Asking: a hit is a star, a miss reveals the word. After a reveal the word was taught, so
     * whatever was said, it is recorded and the learner may move on. Silence changes nothing (it is not a miss).
     */
    fun submit(transcript: String, course: Course): Pair<SayPictureSession, SayPictureOutcome> {
        val word = current ?: return this to SayPictureOutcome.UNHEARD
        return when (phase) {
            SayPicturePhase.REVEAL -> copy(heard = transcript) to SayPictureOutcome.REPEATED
            SayPicturePhase.ASK -> {
                val spoken = transcript.trim()
                when {
                    SayThePicture.said(spoken, word.term, course) ->
                        copy(firstTry = firstTry + 1, phase = SayPicturePhase.RIGHT) to SayPictureOutcome.RIGHT
                    spoken.isEmpty() -> this to SayPictureOutcome.UNHEARD
                    else -> copy(phase = SayPicturePhase.REVEAL) to SayPictureOutcome.REVEAL
                }
            }
            SayPicturePhase.RIGHT, SayPicturePhase.DONE -> this to SayPictureOutcome.UNHEARD
        }
    }

    /** "Show me the word": always available, so a microphone or STT failure is never a dead end. Only while asking. */
    fun showWord(): SayPictureSession =
        if (phase == SayPicturePhase.ASK && current != null) copy(phase = SayPicturePhase.REVEAL) else this

    fun next(): SayPictureSession = when {
        phase != SayPicturePhase.RIGHT && phase != SayPicturePhase.REVEAL -> this
        isLast -> copy(heard = null, phase = SayPicturePhase.DONE)
        else -> copy(heard = null, index = index + 1, phase = SayPicturePhase.ASK)
    }
}

/**
 * The two network calls of the activity, both on EXISTING routes: the learner's speech to /api/stt (the speaking
 * daily quota, kind `stt`; no new kind) and the model pronunciation from /api/tts.
 */
class SayPictureSpeech(private val ai: AiConversationClient) {
    suspend fun transcribe(audio: ByteArray, course: Course, debugTiming: String? = null): String =
        ai.transcribe(audio, "audio/m4a", course.code, debugTiming).text

    suspend fun modelAudio(term: String, voice: String?, course: Course): ByteArray =
        ai.synthesizeSpeech(term, voice = voice, course = course.code)
}
