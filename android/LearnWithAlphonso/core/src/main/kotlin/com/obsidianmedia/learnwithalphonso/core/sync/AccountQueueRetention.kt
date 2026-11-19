package com.obsidianmedia.learnwithalphonso.core.sync

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * What happens to the offline queue when the signed-in account leaves this device (AccountQueueRetention.swift).
 *
 * Sign-out (from Settings, or forced: a refresh token the server rejected) used to delete every queued lesson and review
 * answer of that account, so a learner who finished lessons offline and then signed out lost them without a word. Now:
 * - **Sign-out keeps the queue.** Every row stays, tagged with the account that played it, and syncs when that account
 *   signs back in on this device. A pass only ever sends the signed-in account's rows, and the Learn tab only counts
 *   them, so the next account neither sees nor sends another account's work.
 * - **Account deletion still removes** the deleted account's rows.
 * - **Kept rows expire** [FOREIGN_ROW_LIFETIME_MILLIS] after their account left (timed from the departure recorded in
 *   [ForeignOwnerClock], never from queuedAt), deleted at the next pass of whoever is signed in.
 */
object AccountQueueRetention {
    /** How long another account's rows wait on this device for that account to sign back in. */
    const val FOREIGN_ROW_LIFETIME_MILLIS = 30L * 24 * 60 * 60 * 1000

    data class Rows(val lessons: List<PendingLessonCompletion>, val grades: List<PendingReviewGrade>) {
        val isEmpty: Boolean get() = lessons.isEmpty() && grades.isEmpty()
    }

    /**
     * Rows of accounts other than [currentUserId] that left this device more than [lifetimeMillis] ago. An owner with no
     * recorded departure is kept here: [ownersWithoutDeparture] starts its clock instead.
     */
    fun expiredForeignRows(
        currentUserId: String,
        lessons: List<PendingLessonCompletion>,
        grades: List<PendingReviewGrade>,
        nowMillis: Long,
        lifetimeMillis: Long = FOREIGN_ROW_LIFETIME_MILLIS,
        retiredAt: (String) -> Long?,
    ): Rows {
        fun expired(owner: String?): Boolean {
            if (owner == null || owner == currentUserId) return false
            val left = retiredAt(owner) ?: return false
            return nowMillis - left > lifetimeMillis
        }
        return Rows(lessons.filter { expired(it.ownerUserId) }, grades.filter { expired(it.ownerUserId) })
    }

    /**
     * Owners of queued rows, other than [currentUserId], with no recorded departure: a sign-out cut short by a process
     * kill, or rows from before departures were recorded. Their 30 days start now, so they never wait for ever.
     */
    fun ownersWithoutDeparture(
        currentUserId: String?,
        lessons: List<PendingLessonCompletion>,
        grades: List<PendingReviewGrade>,
        retiredAt: (String) -> Long?,
    ): Set<String> =
        (lessons.mapNotNull { it.ownerUserId } + grades.mapNotNull { it.ownerUserId })
            .filter { it != currentUserId && retiredAt(it) == null }
            .toSet()
}

/**
 * When each account last left this device, so its kept rows expire 30 days after it left. Kept in plain app preferences
 * through [read] and [write] (a JSON map of account id to epoch millis), and never cleared at sign-out: that is when it
 * is written. Holds account ids only.
 */
class ForeignOwnerClock(private val read: () -> String?, private val write: (String?) -> Unit) {
    private val lock = Any()
    private val serializer = MapSerializer(String.serializer(), Long.serializer())

    private fun all(): Map<String, Long> =
        read()?.let { raw -> runCatching { Json.decodeFromString(serializer, raw) }.getOrNull() } ?: emptyMap()

    private fun save(map: Map<String, Long>) = write(if (map.isEmpty()) null else Json.encodeToString(serializer, map))

    fun retiredAt(owner: String): Long? = synchronized(lock) { all()[owner] }

    /** At sign-out: the account's rows become another account's from now (a later departure restarts the 30 days). */
    fun markRetired(owner: String, atMillis: Long) = synchronized(lock) { save(all() + (owner to atMillis)) }

    fun markRetiredIfUnknown(owner: String, atMillis: Long) = synchronized(lock) {
        val map = all()
        if (owner !in map) save(map + (owner to atMillis))
    }

    /** The account is back (or deleted): its rows are not another account's. */
    fun forget(owner: String) = synchronized(lock) {
        val map = all()
        if (owner in map) save(map - owner)
    }

    companion object {
        const val KEY = "queue.foreignOwnerRetiredAt.v1"
    }
}

/**
 * What Settings' "Sign out" does when this account still has work in the offline queue (SignOutGuard.swift). Signing out
 * keeps it for this account, but a learner who never signs back in on this phone would never see it reach the server,
 * so the button first tries to send it and only asks when some is still waiting.
 */
object SignOutGuard {
    sealed interface Decision {
        data object SignOut : Decision
        data class Confirm(val title: String, val message: String) : Decision
    }

    fun decide(pendingLessons: Int, pendingReviewAnswers: Int): Decision {
        val lessons = maxOf(0, pendingLessons)
        val reviews = maxOf(0, pendingReviewAnswers)
        if (lessons + reviews == 0) return Decision.SignOut
        return Decision.Confirm(title(lessons, reviews), MESSAGE)
    }

    /** "2 lessons haven't synced yet. Sign out anyway?" Lessons lead because they carry XP and the streak. */
    internal fun title(lessons: Int, reviewAnswers: Int): String {
        val lessonPart = if (lessons == 1) "1 lesson" else "$lessons lessons"
        val reviewPart = if (reviewAnswers == 1) "1 review answer" else "$reviewAnswers review answers"
        val what = when {
            lessons == 0 -> "$reviewPart ${if (reviewAnswers == 1) "hasn't" else "haven't"}"
            reviewAnswers == 0 -> "$lessonPart ${if (lessons == 1) "hasn't" else "haven't"}"
            else -> "$lessonPart and $reviewPart haven't"
        }
        return "$what synced yet. Sign out anyway?"
    }

    const val MESSAGE =
        "They stay on this phone and sync the next time you sign in here with this account. If this account doesn't sign back in here within 30 days, they're removed. Signing in with a different account won't send them."
    const val CONFIRM = "Sign out anyway"
    const val CANCEL = "Stay signed in"
}
