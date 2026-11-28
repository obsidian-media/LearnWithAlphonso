package com.obsidianmedia.learnwithalphonso.core.rehearsal

/**
 * How long the learner took to start answering, one value per reply, for a rehearsal call. [clock] must be monotonic
 * (the app passes SystemClock.elapsedRealtime), so a wall-clock change mid-call cannot make a bogus pause.
 *
 * The gap runs from the partner's voice finishing (the opener or a reply) to the first sign the learner is speaking:
 * the press that starts the recorder, or in hands-free the first voice activity. Starting is only remembered; the entry
 * is committed by [replySent], when that attempt really became a transcribed reply. A failed, empty or too-short
 * attempt therefore does not use the clock up, and the retry keeps the gap from the first start. A reply with no
 * partner voice before it (typed, or the partner's audio failed) records nothing, so the list can be shorter than the
 * number of replies.
 */
class ReplyLatencyTracker(private val clock: () -> Long) {
    private var partnerDoneAt: Long? = null
    private var startedAt: Long? = null
    private var bargedIn = false
    private val latencies = mutableListOf<Long>()

    /** The partner's voice just finished. */
    fun partnerFinished() { partnerDoneAt = clock() }

    /**
     * The learner started speaking. The first start of an attempt wins. [partnerStillSpeaking] is a barge-in: they
     * talked over the partner, so the gap is zero. With no partner voice before this start (and no barge-in) nothing is remembered.
     */
    fun learnerStarted(partnerStillSpeaking: Boolean = false) {
        if (startedAt != null) return
        if (partnerStillSpeaking) { startedAt = clock(); bargedIn = true }
        else if (partnerDoneAt != null) startedAt = clock()
    }

    /** A spoken attempt was transcribed and is being sent as the learner's reply: commit its gap, if a start was seen. */
    fun replySent() {
        val start = startedAt
        if (start != null) {
            val done = partnerDoneAt
            latencies += if (bargedIn || done == null) 0L else start - done
        }
        discardPending()
    }

    /** No partner voice is coming for what was just sent (typed, chat mode, a failed reply): forget any open clock. */
    fun discardPending() { partnerDoneAt = null; startedAt = null; bargedIn = false }

    /** True once at least one reply has a recorded gap. */
    val hasValues: Boolean get() = latencies.isNotEmpty()

    /** In the order they happened, each clamped to 0..[MAX_MS], at most [MAX_ENTRIES]. */
    fun values(): List<Int> = sanitize(latencies)

    fun reset() { discardPending(); latencies.clear() }

    companion object {
        const val MAX_MS = 60_000L
        const val MAX_ENTRIES = 60

        fun sanitize(raw: List<Long>): List<Int> = raw.take(MAX_ENTRIES).map { it.coerceIn(0L, MAX_MS).toInt() }
    }
}
