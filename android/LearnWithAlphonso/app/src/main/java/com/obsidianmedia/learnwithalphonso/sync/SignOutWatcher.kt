package com.obsidianmedia.learnwithalphonso.sync

/**
 * Tells an account ending (signed out, or switched away from) from a cold launch (nobody was signed in yet, because the
 * session has not been restored). Clearing the offline queue on the second would wipe a learner's queued lessons every
 * time the app opens.
 */
class SignOutWatcher {
    private var last: String? = null

    /**
     * Feed it the signed-in user id each time it changes. Returns the id of the account that just ended: any change away
     * from a signed-in account, to nobody or straight to another account. Null for a launch and for no real change.
     */
    fun endedAccount(now: String?): String? {
        val ended = last?.takeIf { it != now }
        last = now
        return ended
    }
}
