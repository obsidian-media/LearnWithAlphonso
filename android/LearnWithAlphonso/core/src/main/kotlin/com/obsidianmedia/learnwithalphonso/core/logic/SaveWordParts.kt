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

object SaveWordParts {
    /**
     * The text cut into parts. With [courseSpans] null the whole text is in the course's language (Hector, Practice and
     * podcast transcripts are, and so is an English lesson), so every word is tappable. With spans, only words inside
     * those course-language strings are tappable, and the saved sentence is that string (the sentence of it that the word
     * is in), never the English text around it. Lesson explanations decide which of the two applies with
     * [SavedWordPolicy.scope], so a French or Spanish explanation never reaches here with null spans.
     */
    fun of(text: String, course: String, courseSpans: List<String>?): List<SaveWordPart> {
        val pieces = if (courseSpans == null) {
            listOf(CourseLanguageSpans.Piece(text, true))
        } else {
            CourseLanguageSpans.split(text, courseSpans)
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
