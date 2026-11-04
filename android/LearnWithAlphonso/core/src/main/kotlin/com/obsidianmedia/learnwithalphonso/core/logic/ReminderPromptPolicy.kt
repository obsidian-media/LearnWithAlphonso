package com.obsidianmedia.learnwithalphonso.core.logic

enum class ReminderPermission { UNDETERMINED, GRANTED, DENIED }

/** How often the learner said "Not now" to the reminder card, and when (epoch milliseconds). */
data class ReminderPromptState(val dismissals: Int = 0, val lastDismissedAtMs: Long? = null)

object ReminderPromptCopy {
    const val TITLE = "Keep your streak going"
    const val BODY = "Want a reminder when your streak is about to end?"
    const val ACCEPT = "Remind me"
    const val DECLINE = "Not now"
}

/**
 * When to offer the reminder card on the lesson-complete screen. The system permission dialog is only shown
 * from the card's "Remind me" (mirrors iOS ReminderPromptPolicy).
 */
object ReminderPromptPolicy {
    const val MIN_COMPLETED_LESSONS = 2
    const val MIN_DAYS_BETWEEN_OFFERS = 3
    const val MAX_DISMISSALS = 2
    private const val DAY_MS = 86_400_000L

    fun shouldShowCard(completedLessons: Int, permission: ReminderPermission, state: ReminderPromptState, nowMs: Long): Boolean {
        if (permission != ReminderPermission.UNDETERMINED || completedLessons < MIN_COMPLETED_LESSONS) return false
        if (state.dismissals >= MAX_DISMISSALS) return false
        val last = state.lastDismissedAtMs ?: return true
        return nowMs - last >= MIN_DAYS_BETWEEN_OFFERS * DAY_MS
    }

    fun afterNotNow(state: ReminderPromptState, nowMs: Long) = ReminderPromptState(state.dismissals + 1, nowMs)
}

/** Persistence over two long values, so it needs no Android types; the app backs it with SharedPreferences. */
class ReminderPromptStore(private val get: (String) -> Long?, private val put: (String, Long) -> Unit) {
    fun load() = ReminderPromptState((get(COUNT_KEY) ?: 0L).toInt(), get(DATE_KEY))

    fun recordNotNow(nowMs: Long) {
        val next = ReminderPromptPolicy.afterNotNow(load(), nowMs)
        put(COUNT_KEY, next.dismissals.toLong())
        put(DATE_KEY, nowMs)
    }

    companion object {
        const val COUNT_KEY = "reminderPromptDismissals"
        const val DATE_KEY = "reminderPromptLastDismissedAt"
    }
}
