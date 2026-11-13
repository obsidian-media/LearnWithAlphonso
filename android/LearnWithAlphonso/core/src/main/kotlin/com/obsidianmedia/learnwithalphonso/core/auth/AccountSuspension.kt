package com.obsidianmedia.learnwithalphonso.core.auth

import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthError

/**
 * A suspended (banned) account: the words, and how to recognise it (staff console, 20261113100000). The same copy as
 * the iOS Kit's AccountSuspension and the web's account-suspended.ts. A ban revokes the sessions, so a signed-in app
 * learns of it when its refresh is refused, and a sign-in gets Supabase's banned error (`user_banned`, "User is
 * banned"); the API also answers a still-valid token with `account_suspended`.
 */
object AccountSuspension {
    const val TITLE = "This account is suspended."
    const val API_ERROR = "account_suspended"
    private const val SUPPORT_ADDRESS = "support@alphonsoecosystem.app"
    const val BODY = "If you think this is a mistake, contact support at $SUPPORT_ADDRESS."
    const val MESSAGE = "$TITLE $BODY"

    /** True for the banned sign-in / refresh error and the API's `account_suspended`; never for a wrong code or an outage. */
    fun isSuspended(e: Exception): Boolean {
        val message = (e as? SupabaseAuthError.Server)?.serverMessage ?: return false
        return message.contains("banned", ignoreCase = true) || message.contains(API_ERROR)
    }
}
