package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * What a piece of displayed text is made of for tap-to-save: plain text, and words that save when tapped, each with the
 * exact request a tap sends. Kept out of the Compose view so the rules are unit-tested on the JVM (TappableText.swift
 * holds the same logic inside the view).
 */
sealed interface SaveWordPart {
    val text: String

    data class Plain(override val text: String) : SaveWordPart

    data class Word(override val text: String, val request: SaveWordRequest) : SaveWordPart
}

/**
 * Which words of a text may be tapped to save. Every caller of TappableText passes one explicitly (there is no default),
 * so none can fall into a wrong behaviour by leaving it out.
 */
sealed interface SaveWordMode {
    /** Every word: text wholly in the course's language (Hector, Practice and Campaign replies, transcripts, English lessons). */
    data object AllWords : SaveWordMode

    /** Only words inside these course-language strings (French and Spanish lesson explanations); the saved sentence is the string. */
    data class Spans(val spans: List<String>) : SaveWordMode

    /** Nothing is tappable. */
    data object Plain : SaveWordMode
}

object SaveWordParts {
    /**
     * The text cut into parts. [SaveWordMode.AllWords] makes every word tappable; [SaveWordMode.Spans] only words inside
     * those course-language strings, saving that string (the sentence of it the word is in) as the sentence, never the English
     * text around it; [SaveWordMode.Plain] none. Lesson explanations choose with [SavedWordPolicy.scope].
     */
    fun of(text: String, course: String, mode: SaveWordMode): List<SaveWordPart> {
        val pieces = when (mode) {
            SaveWordMode.AllWords -> listOf(CourseLanguageSpans.Piece(text, true))
            SaveWordMode.Plain -> listOf(CourseLanguageSpans.Piece(text, false))
            is SaveWordMode.Spans -> CourseLanguageSpans.split(text, mode.spans)
        }
        val parts = ArrayList<SaveWordPart>()
        for (piece in pieces) {
            for (segment in WordSegmenter.segments(piece.text)) {
                parts += if (piece.isCourseLanguage && segment.isWord && WordSegmenter.isSavable(segment.text)) {
                    SaveWordPart.Word(segment.text, WordSegmenter.requestFor(piece.text, segment, course))
                } else {
                    SaveWordPart.Plain(segment.text)
                }
            }
        }
        return parts
    }
}
