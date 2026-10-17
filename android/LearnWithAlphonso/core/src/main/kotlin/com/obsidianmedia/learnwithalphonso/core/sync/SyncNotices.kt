package com.obsidianmedia.learnwithalphonso.core.sync

import java.net.URLEncoder

/**
 * The Learn-tab line shown while finished lessons or review answers are still waiting to reach the server
 * (PendingSyncNotice.swift). Queued work is safe, but without this the learner cannot tell "saved on this phone" from
 * "saved", and has no way to ask for a retry.
 */
object PendingSyncNotice {
    const val SYNC_NOW_TITLE = "Sync now"
    const val SYNCING_TITLE = "Syncing…"

    /** Null when nothing is waiting, so the line is hidden. */
    fun message(lessons: Int, reviewAnswers: Int, isConnected: Boolean): String? {
        val parts = ArrayList<String>()
        if (lessons > 0) parts.add(if (lessons == 1) "1 lesson" else "$lessons lessons")
        if (reviewAnswers > 0) parts.add(if (reviewAnswers == 1) "1 review answer" else "$reviewAnswers review answers")
        if (parts.isEmpty()) return null
        val one = lessons + reviewAnswers == 1
        val waiting = "${parts.joinToString(" and ")} ${if (one) "is" else "are"} saved on this phone and waiting to sync."
        return if (isConnected) waiting else "$waiting ${if (one) "It" else "They"} will sync when you're back online."
    }
}

/**
 * The Learn-tab notice for lesson completions the server permanently rejected (DeadLetterNotice.swift). The sync engine
 * moves such an item to a dead-letter store so it stops blocking the queue; without this notice the learner would never
 * know a finished lesson was not saved.
 */
object DeadLetterNotice {
    const val SUPPORT_ADDRESS = "support@alphonsoecosystem.app"
    const val CONTACT_TITLE = "Contact support"
    const val DISMISS_TITLE = "Dismiss"

    /**
     * The dismissals worth keeping given the dead letters that exist now. An empty list says nothing: the Learn tab's
     * flow starts empty before its first read, and pruning against it would forget every dismissal.
     */
    fun reconcile(dismissed: Set<String>, present: List<String>): Set<String> =
        if (present.isEmpty()) dismissed else dismissed.intersect(present.toSet())

    fun visible(lessonIdentities: List<String>, dismissed: Set<String>): List<String> = lessonIdentities.filter { it !in dismissed }

    fun message(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "1 lesson couldn't be saved. Contact support."
        else -> "$count lessons couldn't be saved. Contact support."
    }

    /**
     * A mailto with the queue identities (lesson id, course, queued time) and the stable reason codes, so support can
     * find and fix the record. Nothing else about the learner is added.
     */
    fun supportMailUri(identities: List<String>, reasons: List<String>, appVersion: String): String {
        val lines = ArrayList<String>()
        lines.add("Please keep the lines below so we can find your lesson.")
        lines.add("")
        identities.forEachIndexed { i, identity -> lines.add(if (i < reasons.size) "$identity (${reasons[i]})" else identity) }
        lines.add("App: $appVersion")
        fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
        return "mailto:$SUPPORT_ADDRESS?subject=${enc("A lesson couldn't be saved")}&body=${enc(lines.joinToString("\n"))}"
    }
}
