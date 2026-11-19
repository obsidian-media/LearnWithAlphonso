package com.obsidianmedia.learnwithalphonso.core.logic

/** The one thing the preference needs from storage (SharedPreferences in the app, a map in tests). */
interface HandsFreeStore {
    fun getBoolean(key: String, default: Boolean): Boolean
    fun putBoolean(key: String, value: Boolean)
}

/**
 * The learner's last hands-free choice, remembered per device so every new call (Practice, campaigns, Hector) starts
 * the way they left it (iOS `HandsFreePreference`). It starts a call on only when the once-per-device safety note was
 * already confirmed, so the note can never be skipped by it.
 */
class HandsFreePreference(private val store: HandsFreeStore) {
    val isPreferred: Boolean get() = store.getBoolean(PREFERRED_KEY, false)

    fun remember(on: Boolean) = store.putBoolean(PREFERRED_KEY, on)

    /** Whether a new call should start with hands-free on: preferred, and the safety note was already confirmed. */
    val shouldStartOn: Boolean get() = isPreferred && store.getBoolean(HandsFreeCopy.NOTE_SEEN_KEY, false)

    companion object {
        const val PREFERRED_KEY = "handsFree.preferred.v1"
    }
}
