package com.obsidianmedia.learnwithalphonso.core.podcast

/** Port of transcriptParagraphs in src/lib/podcast-transcript.ts (render side only). */
object PodcastTranscript {
    fun paragraphs(text: String): List<String> =
        text.split("\n\n").map { it.replace("\n", " ").trim() }.filter { it.isNotEmpty() }
}
