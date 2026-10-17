package com.obsidianmedia.learnwithalphonso.sync

/**
 * Tells a sign-out (an account was signed in a moment ago, now none is) from a cold launch (nobody was signed in yet,
 * because the session has not been restored). Clearing the offline queue on the second would wipe a learner's queued
 * lessons every time the app opens.
 */
class SignOutWatcher {
    private var last: String? = null

    /** Feed it the signed-in user id each time it changes; true exactly when that change was a sign-out. */
    fun signedOut(now: String?): Boolean {
        val out = last != null && now == null
        last = now
        return out
    }
}
