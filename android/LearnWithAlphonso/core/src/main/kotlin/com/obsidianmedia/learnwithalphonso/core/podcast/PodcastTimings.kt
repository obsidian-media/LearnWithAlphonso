package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One sentence of an episode's transcript with the second it starts. Mirrors src/lib/podcast-timings.ts (web) and
 * PodcastTimings.swift (iOS). Produced offline by aligning the stored transcript to the audio; the text is the
 * transcript's own words, never re-transcribed.
 */
@Serializable
data class TimedLine(
    /** Start, in seconds from the beginning of the audio. */
    val s: Double,
    val t: String,
    /** True when this sentence opens a paragraph. */
    val p: Boolean = false,
)

@Serializable
private data class TimingEntry(val lines: List<TimedLine>)

object PodcastTimings {
    private val json = Json { ignoreUnknownKeys = true }

    /** The bundled timing file: episode id to its lines. A malformed file is no timings, not a crash. */
    fun decode(text: String): Map<String, List<TimedLine>> =
        runCatching { json.decodeFromString<Map<String, TimingEntry>>(text).mapValues { it.value.lines } }.getOrDefault(emptyMap())

    /**
     * The line being spoken at [seconds]: the last line whose start is at or before it. Before the first start (or for a
     * non-finite time) it is the first line; with no lines it is -1. Binary search: it runs on every time update.
     */
    fun activeIndex(lines: List<TimedLine>, seconds: Double): Int {
        if (lines.isEmpty()) return -1
        val t = if (seconds.isFinite()) seconds else 0.0
        var lo = 0
        var hi = lines.size - 1
        while (lo < hi) {
            val mid = (lo + hi + 1) / 2
            if (lines[mid].s <= t) lo = mid else hi = mid - 1
        }
        return lo
    }

    private fun squash(s: String) = s.filterNot { it.isWhitespace() }

    /**
     * The lines, only if they still spell the transcript word for word (whitespace aside) and the starts never go
     * backwards. Anything else is null and the player shows the plain transcript, so an episode whose text was edited
     * after alignment can never highlight the wrong words.
     */
    fun linesMatching(lines: List<TimedLine>?, transcript: String?): List<TimedLine>? {
        if (lines.isNullOrEmpty() || transcript == null) return null
        for (i in 1 until lines.size) if (lines[i].s < lines[i - 1].s) return null
        return if (lines.joinToString("") { squash(it.t) } == squash(transcript)) lines else null
    }
}

/** The full player's sleep timer choices. */
enum class SleepChoice(val label: String, val minutes: Int?) {
    Off("Off", null),
    Min15("15 min", 15),
    Min30("30 min", 30),
    Min45("45 min", 45),
    EndOfEpisode("End of episode", null),
}

/** The sleep timer as pure logic: the clock and the "episode ended" signal come in as arguments. */
data class SleepTimerState(val choice: SleepChoice, val endsAtMillis: Long?) {
    /** Milliseconds left on a timed choice (never negative); null for off and end of episode. */
    fun remainingMillis(nowMillis: Long): Long? = endsAtMillis?.let { (it - nowMillis).coerceAtLeast(0) }

    /** True when playback should pause now: a timed choice reached its deadline, or end-of-episode and it ended. */
    fun shouldPause(nowMillis: Long, episodeEnded: Boolean): Boolean =
        if (choice == SleepChoice.EndOfEpisode) episodeEnded else endsAtMillis != null && nowMillis >= endsAtMillis

    companion object {
        val OFF = SleepTimerState(SleepChoice.Off, null)

        fun start(choice: SleepChoice, nowMillis: Long): SleepTimerState =
            SleepTimerState(choice, choice.minutes?.let { nowMillis + it * 60_000L })
    }
}
