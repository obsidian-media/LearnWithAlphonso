package com.obsidianmedia.learnwithalphonso.core.video

/** One caption: shown from [start] up to (not including) [end], in seconds. [text] is plain, lines joined by "\n". */
data class WebVttCue(val start: Double, val end: Double, val text: String)

/**
 * A WebVTT reader for the Watch shelf's captions, the same rules as the iOS Kit's WebVTT.swift. The player draws the current
 * cue itself over the picture (so captions look and behave the same on both apps, and the lookup is tested here without a
 * device). Reads what the owner's caption files use and what the format allows around it: an optional byte-order mark,
 * CRLF or LF line ends, an optional cue identifier line, cue settings after the end time, multi-line cue text,
 * `mm:ss.mmm` and `hh:mm:ss.mmm` timestamps, and inline tags (`<b>`, `<c.yellow>`, `<00:01.000>`) which are dropped. NOTE, STYLE
 * and REGION blocks are skipped. A file that does not start with `WEBVTT` is not WebVTT and gives no cues.
 */
object WebVtt {
    private val tag = Regex("<[^>]*>")

    fun parse(source: String): List<WebVttCue> {
        val text = source.removePrefix("﻿").replace("\r\n", "\n").replace('\r', '\n')
        val lines = text.split("\n")
        val first = lines.firstOrNull() ?: return emptyList()
        if (!first.startsWith("WEBVTT") || (first.length > 6 && first[6] != ' ' && first[6] != '\t')) return emptyList()

        // Blocks are separated by one or more blank lines.
        val blocks = ArrayList<List<String>>()
        var current = ArrayList<String>()
        for (line in lines.drop(1)) {
            if (line.isBlank()) {
                if (current.isNotEmpty()) { blocks.add(current); current = ArrayList() }
            } else {
                current.add(line)
            }
        }
        if (current.isNotEmpty()) blocks.add(current)

        val cues = ArrayList<WebVttCue>()
        for (block in blocks) {
            val head = block.first()
            if (head.startsWith("NOTE") || head.startsWith("STYLE") || head.startsWith("REGION")) continue
            val timingIndex = block.indexOfFirst { it.contains("-->") }
            if (timingIndex < 0) continue
            val (start, end) = timing(block[timingIndex]) ?: continue
            val body = block.drop(timingIndex + 1).map(::plain).filter { it.isNotEmpty() }.joinToString("\n")
            // A cue with no text, or that ends before it starts, shows nothing: drop it.
            if (body.isEmpty() || end <= start) continue
            cues.add(WebVttCue(start, end, body))
        }
        // sortedBy is stable: a file whose cues are out of order still looks up correctly.
        return cues.sortedBy { it.start }
    }

    /** The cue to show at [time]: the one whose interval holds it. Where cues overlap, the one that started last. */
    fun cueAt(time: Double, cues: List<WebVttCue>): WebVttCue? {
        if (!time.isFinite()) return null
        return cues.lastOrNull { it.start <= time && time < it.end }
    }

    /** `00:07.024`, `1:02:03.500` or `7.5` (seconds) as seconds; null if it is not a timestamp. */
    fun timestamp(raw: String): Double? {
        val parts = raw.trim().split(":")
        if (parts.size !in 1..3) return null
        var total = 0.0
        parts.forEachIndexed { index, part ->
            val isSeconds = index == parts.size - 1
            val cleaned = if (isSeconds) part.replace(',', '.') else part
            if (cleaned.isEmpty() || !cleaned.all { it in '0'..'9' || (isSeconds && it == '.') }) return null
            val value = cleaned.toDoubleOrNull() ?: return null
            total = total * 60 + value
        }
        return total
    }

    private fun timing(line: String): Pair<Double, Double>? {
        val sides = line.split("-->")
        if (sides.size != 2) return null
        // Cue settings ("align:start position:10%") follow the end time after a space.
        val endToken = sides[1].trim().substringBefore(' ')
        val start = timestamp(sides[0]) ?: return null
        val end = timestamp(endToken) ?: return null
        return start to end
    }

    private fun plain(line: String): String =
        line.replace(tag, "")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").replace("&amp;", "&")
            .trim()
}
