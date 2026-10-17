package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterNotice

/**
 * Which dead letters the learner dismissed (DeadLetterDismissals in DeadLetterNotice.swift). Dismissing hides the
 * notice; the records stay for support.
 */
class DeadLetterDismissals(private val prefs: SharedPreferences) {
    val dismissed: Set<String> get() = prefs.getStringSet(KEY, emptySet()).orEmpty().toSet()

    fun dismiss(identities: List<String>) {
        prefs.edit().putStringSet(KEY, dismissed + identities).apply()
    }

    /** Forgets dismissals whose record no longer exists, so the key cannot grow forever. */
    fun prune(keeping: List<String>) {
        val kept = DeadLetterNotice.reconcile(dismissed, keeping)
        if (kept != dismissed) prefs.edit().putStringSet(KEY, kept).apply()
    }

    private companion object {
        const val KEY = "deadLetterNotice.dismissed.v1"
    }
}
