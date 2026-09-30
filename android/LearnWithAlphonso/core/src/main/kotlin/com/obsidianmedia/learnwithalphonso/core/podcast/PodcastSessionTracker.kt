package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The listening-time and save-cadence rules PodcastAudioPlayer.swift keeps
 * inside its tick(): real listening ignores jumps from seeking (a delta must
 * be in (0, 2) seconds to count), and a position save fires whenever the
 * distance from the last saved mark reaches 10 seconds in either direction
 * (abs, so a backward skip does not silence saves for minutes).
 */
class PodcastSessionTracker(private val saveEverySeconds: Double = 10.0) {
    private var lastTick: Double? = null
    private var lastSaved = 0.0
    private var listened = 0.0

    data class TickDecision(val savePosition: Boolean)

    fun tick(seconds: Double): TickDecision {
        if (!seconds.isFinite()) return TickDecision(false)
        lastTick?.let { previous ->
            val delta = seconds - previous
            if (delta > 0 && delta < 2) listened += delta
        }
        lastTick = seconds
        if (abs(seconds - lastSaved) >= saveEverySeconds) {
            lastSaved = seconds
            return TickDecision(true)
        }
        return TickDecision(false)
    }

    /** Rounded seconds actually listened since the last flush; resets the counter. */
    fun flushListened(): Int {
        val total = listened.roundToInt()
        listened = 0.0
        return total
    }

    /** A new episode: forget the previous marks; [startSeconds] is the resume point, so the first tick does not save. */
    fun reset(startSeconds: Double = 0.0) {
        lastTick = null
        lastSaved = startSeconds
        listened = 0.0
    }
}
