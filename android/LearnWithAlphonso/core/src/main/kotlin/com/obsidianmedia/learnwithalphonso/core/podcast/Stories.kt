package com.obsidianmedia.learnwithalphonso.core.podcast

/**
 * Graded stories: leveled texts read along with narration (docs/archive/2026-11/2026-11-17-graded-stories-design.md).
 * Port of Stories.swift; mirrors src/lib/stories.ts and the podcast model.
 *
 * The database decides what a learner may see (RLS: published stories only) and the filter here is a second line, so a
 * draft that ever reached the client still never shows. The check is graded on the SERVER from the stored key: the app
 * sends the chosen answers to the complete-story-check Edge Function, which calls the service-role-only
 * public.submit_story_check with the verified user id. The score shown is the server's.
 */
data class StorySummary(
    val id: String,
    val course: String,
    val level: String,
    val slug: String,
    val title: String,
    val sortOrder: Int,
    val published: Boolean,
    /** Where the learner has read up to; 0 when never opened. */
    val segmentIndex: Int,
    val segmentCount: Int,
    /** The best check score, or null until the check is first taken. */
    val bestCorrect: Int?,
    val checkTotal: Int?,
    val completed: Boolean,
    /** A "choose your path" story: its text lives in the node graph, so it has no top-level sentences. */
    val branching: Boolean = false,
    /** The first scene's art (public `story-art` URL), or null: a linear story, or a branching one without art (a designed fallback is drawn). */
    val coverUrl: String? = null,
    /** Endings in a branching story's node graph; 0 for a linear story. */
    val endingsTotal: Int = 0,
    /** Distinct endings this learner has reached (`story_progress.endings_found`), never more than [endingsTotal]. */
    val endingsFound: Int = 0,
)

data class Story(
    val id: String,
    val course: String,
    val level: String,
    val title: String,
    val segments: List<String>,
    /** The check's questions, in the podcast quiz's shape so the same run is reused. */
    val questions: List<PodcastQuizQuestion>,
    /** Where the learner left off, already clamped into the text. */
    val segmentIndex: Int,
)

data class StoryLevelGroup(val level: String, val stories: List<StorySummary>)

/** The library's three parts: the featured story, the continue line and the cover grid. */
data class StoriesLibraryLayout(val featured: StorySummary?, val resume: StorySummary?, val grid: List<StorySummary>)

object Stories {
    val COURSES = setOf("en", "fr", "es")

    /**
     * Only published stories in the learner's course, in a stable order. A branching story has no top-level sentences (its
     * text lives in `nodes`, read by the branching reader), so it is listed by its flag; a linear story with no sentences is
     * left out rather than opened empty.
     */
    fun visible(stories: List<StorySummary>, course: String): List<StorySummary> =
        stories.filter { it.published && it.course == course && (it.branching || it.segmentCount > 0) }
            .sortedWith(compareBy<StorySummary> { it.level }.thenBy { it.sortOrder }.thenBy { it.title })

    /** Stories grouped by level (A1 before A2), each group in reading order. */
    fun groupByLevel(stories: List<StorySummary>): List<StoryLevelGroup> =
        stories.groupBy { it.level }.toSortedMap().map { (level, list) -> StoryLevelGroup(level, list) }

    fun levelLabel(level: String): String = when (level) {
        "A1" -> "A1 · Beginner"
        "A2" -> "A2 · Elementary"
        "B1" -> "B1 · Intermediate"
        "B2" -> "B2 · Upper intermediate"
        "C1" -> "C1 · Advanced"
        else -> level
    }

    /**
     * Splits the visible stories for the library. Featured is the newest branching story (the highest sort order: stories are
     * added at the end). Resume is a linear story the learner started and has not finished: its saved position is stored, a
     * branching path's position is not, so a branching story is never offered there. The grid is everything except the
     * featured story, in level then reading order.
     */
    fun library(stories: List<StorySummary>, course: String): StoriesLibraryLayout {
        val shown = visible(stories, course)
        val featured = shown.filter { it.branching }.fold<StorySummary, StorySummary?>(null) { best, s -> if (best == null || s.sortOrder >= best.sortOrder) s else best }
        val resume = shown.firstOrNull { !it.branching && it.segmentIndex > 0 && !it.completed }
        return StoriesLibraryLayout(featured, resume, shown.filter { it.id != featured?.id && it.id != resume?.id })
    }

    /** "3 of 5 endings". */
    fun endingsLine(story: StorySummary): String = "${minOf(story.endingsFound, story.endingsTotal)} of ${story.endingsTotal} endings"

    /** The hero's line: "A2 · 4 endings · 1 found". */
    fun heroLine(story: StorySummary): String =
        "${story.level} · ${story.endingsTotal} ${if (story.endingsTotal == 1) "ending" else "endings"} · ${minOf(story.endingsFound, story.endingsTotal)} found"

    /** What a card says under its title: the endings progress (branching) or the read state (linear). */
    fun caption(story: StorySummary): String = if (story.branching && story.endingsTotal > 0) endingsLine(story) else status(story)

    /** The one full accessible name of a card or the hero. */
    fun cardLabel(story: StorySummary): String =
        listOfNotNull(story.title, story.level, if (story.branching) BranchingCopy.BADGE else null, caption(story)).joinToString(", ")

    /** The continue line: the saved segment counted from 1. */
    fun resumeLine(story: StorySummary): String = "Continue · Scene ${story.segmentIndex + 1}"

    /** Fraction of endings found, 0..1, for the progress ring. */
    fun endingsFraction(story: StorySummary): Float =
        if (story.endingsTotal <= 0) 0f else minOf(1f, story.endingsFound.toFloat() / story.endingsTotal)

    /** A short status for a library row. */
    fun status(story: StorySummary): String {
        if (story.branching) return Branching.status(story.completed)
        val total = story.checkTotal
        val best = story.bestCorrect
        if (total != null && best != null) return "Best: $best of $total"
        if (story.segmentIndex > 0 && !story.completed) return "Continue reading"
        return "New"
    }

    /** The segment to narrate after [index] ends, or null at the end; out of range is the end, so a stale index never loops. */
    fun nextSegment(index: Int, count: Int): Int? = if (index < 0 || index + 1 >= count) null else index + 1

    /** A saved resume point, clamped into the text (a story can be re-edited shorter than a saved position). */
    fun clampSegment(index: Int, count: Int): Int = if (index <= 0 || count <= 0) 0 else minOf(index, count - 1)

    /** The server accepts 0..59 for a saved position (src/lib/stories.functions.ts). */
    fun wireSegment(index: Int): Int = index.coerceIn(0, 59)
}

/**
 * What the narration should do. Immutable with no audio, so each rule is testable without a device: it hands the highlight
 * from sentence to sentence and says when a failure stops it.
 */
data class StoryNarration(
    val count: Int,
    val current: Int? = null,
    val playing: Boolean = false,
    /** True after the narration voice could not be reached; the text stays readable. */
    val failed: Boolean = false,
) {
    /** Starts (or restarts) at [index]; an index outside the text changes nothing. */
    fun start(index: Int): StoryNarration =
        if (index < 0 || index >= count) this else copy(current = index, playing = true, failed = false)

    /** The current sentence finished: the next one is current, or the story has ended. */
    fun finishedCurrent(): StoryNarration {
        val now = current
        if (!playing || now == null) return this
        val next = Stories.nextSegment(now, count)
        return if (next != null) copy(current = next) else copy(current = null, playing = false)
    }

    fun stop(): StoryNarration = copy(current = null, playing = false)

    fun fail(): StoryNarration = copy(current = null, playing = false, failed = true)
}

object StoryCopy {
    const val EMPTY_TITLE = "No stories yet"
    const val EMPTY_MESSAGE = "New stories appear here as they are published."
    const val CHECK_TITLE = "Check your understanding"
    const val COUNTS_LINE = "This counts toward your reading practice."
    const val NARRATION_UNAVAILABLE = "Narration isn't available right now. You can still read and tap any word."
    const val NARRATION_NEEDS_AI = "Narration uses AI speech, which is turned off. You can still read and tap any word."
    const val TAP_HINT = "Tap a word to hear it and save it."

    fun message(error: PodcastQuizError): String =
        if (error == PodcastQuizError.NOT_FOUND) "This check isn't available right now." else PodcastQuizCopy.message(error)
}
