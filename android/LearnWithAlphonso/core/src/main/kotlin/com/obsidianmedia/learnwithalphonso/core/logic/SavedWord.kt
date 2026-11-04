package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Question
import java.text.Normalizer

/**
 * What `POST /api/define-word` returns: the word as saved, the sentence it came from, and the stored explanation (the
 * meaning, plus a translation for French and Spanish). `alreadySaved` is true when the word was saved before; that
 * costs nothing server-side. Port of SavedWord.swift.
 */
data class SavedWordResult(val alreadySaved: Boolean, val word: String, val sentence: String, val explanation: String)

/** What a tap on a word asks the sheet to save. */
data class SaveWordRequest(val word: String, val sentence: String, val course: String)

enum class SavedWordError(val userMessage: String) {
    INVALID("That word can't be saved."),
    LIMIT_REACHED("You've reached the limit of 500 saved words. Finish some reviews first."),
    QUOTA_EXCEEDED("You've saved a lot of words for now. Try again in a bit."),
    NOT_SIGNED_IN("Sign in again to save words."),
    AI_CONSENT_REQUIRED("Saving a word uses AI, which is turned off. Turn it on to save words."),
    UNAVAILABLE("Couldn't look that word up. Try again."),
    OFFLINE("Saving a word needs a connection."),
    ;

    /** Worth offering "Try again" for: waiting or reconnecting can fix it. */
    val isRetryable: Boolean get() = this == UNAVAILABLE || this == OFFLINE

    companion object {
        /** The server's status code (and its `error` code) mapped to what the learner should be told. */
        fun from(status: Int, code: String? = null): SavedWordError = when {
            status == 400 -> INVALID
            // A 403 can mean the session or the AI consent; only the server's code tells them apart.
            status == 403 && code == "ai-consent-required" -> AI_CONSENT_REQUIRED
            status == 401 || status == 403 -> NOT_SIGNED_IN
            status == 409 -> LIMIT_REACHED
            status == 429 -> QUOTA_EXCEEDED
            else -> UNAVAILABLE
        }
    }
}

class SavedWordException(val error: SavedWordError) : Exception(error.name)

/**
 * Where a lesson's text may offer "save this word" (SavedWordPolicy.swift). A saved word is filed under a course and
 * explained by the model as a word OF THAT LANGUAGE. A lesson's explanation is written in English in every course, with
 * French or Spanish words quoted inside it. In the English course the explanation is wholly English, so every word on
 * screen is a word of the course ([savesWholeText]). In the French and Spanish courses most of it is not, so only the
 * course-language text the question itself proves is offered ([CourseLanguageSpans]); everything else, including the
 * English words around it, stays plain. Hector, Practice and Campaign replies are different: they are wholly in the
 * language being practised, so they are not gated by this.
 */
object SavedWordPolicy {
    /** What a lesson explanation offers for saving. */
    sealed interface Scope {
        data object None : Scope

        /** Every word (the English course). */
        data object WholeText : Scope

        /** Only words inside these course-language strings (French and Spanish). */
        data class Spans(val spans: List<String>) : Scope
    }

    fun allowsSaving(courseCode: String): Boolean = courseCode == "en" || courseCode == "fr" || courseCode == "es"

    /** True where the whole of a lesson's text is in the course's language. */
    fun savesWholeText(courseCode: String): Boolean = courseCode == "en"

    /**
     * What the explanation under [question] offers. Generated practice has no [Question]: it uses [savesWholeText] and
     * stays English-only.
     */
    fun scope(question: Question, explanation: String, courseCode: String): Scope {
        if (!allowsSaving(courseCode)) return Scope.None
        if (savesWholeText(courseCode)) return Scope.WholeText
        val spans = CourseLanguageSpans.spans(question, explanation)
        return if (spans.isEmpty()) Scope.None else Scope.Spans(spans)
    }
}

/** When to show the "Tap a word to save it." hint under a lesson explanation: the first few times only (SavedWordHint.swift). */
object SavedWordHint {
    const val MAX_SHOWS = 3
    fun shouldShow(timesShown: Int): Boolean = timesShown < MAX_SHOWS
}

/** Wording shared with the iOS app. */
object SavedWordCopy {
    const val SAVE_BUTTON = "Save word"
    const val LOOKING_UP = "Looking it up..."
    const val SAVED = "Saved for review"
    const val ALREADY_SAVED = "Already saved"
    const val AI_CAVEAT = "AI-generated meaning. It can occasionally be wrong."
    const val TRY_AGAIN = "Try again"
    const val DONE = "Done"
    const val LESSON_HINT = "Tap a word to save it."
    const val HECTOR_HINT = "Tap any word in Hector's reply to save it."
    const val REPLY_HINT = "Tap any word in a reply to save it."
    const val TRANSCRIPT_HINT = "Tap any word to save it."

    /** TalkBack reads a reply as one element; this action lists its words. */
    const val PICK_ACTION = "Save a word"
    const val PICK_TITLE = "Choose a word to save"
}

/**
 * The same checks the server makes before it calls the model (`validateSavedWordInput` in src/lib/saved-word.ts), so a
 * request the server would refuse is never sent, and a word the segmenter links is a word the server accepts.
 */
object SavedWordRules {
    const val WORD_MAX = 40
    const val SENTENCE_MAX = 300
    private val COURSES = setOf("en", "fr", "es")
    private val WORD_PATTERN = Regex("""^\p{L}[\p{L}'’-]*$""")
    private val TOKEN = Regex("""\p{L}(?:\p{L}|['’-](?=\p{L}))*""")

    private fun fold(x: String) = x.lowercase().replace('’', '\'')

    /** The request as the server stores it (trimmed, NFC), or null when the server would refuse it. */
    fun validated(request: SaveWordRequest): SaveWordRequest? {
        if (request.course !in COURSES) return null
        val w = Normalizer.normalize(request.word.trim(), Normalizer.Form.NFC)
        if (w.length < 1 || w.length > WORD_MAX || !WORD_PATTERN.matches(w)) return null
        val s = Normalizer.normalize(request.sentence.trim(), Normalizer.Form.NFC)
        if (s.length < 1 || s.length > SENTENCE_MAX) return null
        if (TOKEN.findAll(s).none { fold(it.value) == fold(w) }) return null
        return SaveWordRequest(w, s, request.course)
    }
}
