package com.obsidianmedia.learnwithalphonso.core.rehearsal

/**
 * How long the learner took to start answering, one value per reply, for a rehearsal call. The clock starts when the
 * partner's voice finishes playing (the opener or a reply) and stops at the first sign the learner is speaking: the
 * press that starts the recorder, or in hands-free the first voice activity. A reply with no partner voice before it
 * (typed, or the partner's audio failed) records nothing, so the list can be shorter than the number of replies.
 */
class ReplyLatencyTracker {
    private var partnerDoneAt: Long? = null
    private val latencies = mutableListOf<Long>()

    /** The partner's voice just finished at [atMs]. */
    fun partnerFinished(atMs: Long) { partnerDoneAt = atMs }

    /** The learner started speaking at [atMs]. Counts once per partner turn: a second call with no new partner turn is ignored. */
    fun learnerStarted(atMs: Long) {
        val from = partnerDoneAt ?: return
        partnerDoneAt = null
        latencies += atMs - from
    }

    /** True once the learner has started at least one reply. */
    val hasValues: Boolean get() = latencies.isNotEmpty()

    /** In the order they happened, each clamped to 0..[MAX_MS], at most [MAX_ENTRIES]. */
    fun values(): List<Int> = sanitize(latencies)

    fun reset() { partnerDoneAt = null; latencies.clear() }

    companion object {
        const val MAX_MS = 60_000L
        const val MAX_ENTRIES = 60

        fun sanitize(raw: List<Long>): List<Int> = raw.take(MAX_ENTRIES).map { it.coerceIn(0L, MAX_MS).toInt() }
    }
}
