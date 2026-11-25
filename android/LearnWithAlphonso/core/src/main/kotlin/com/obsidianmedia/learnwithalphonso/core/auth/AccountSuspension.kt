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
    private const val SUPPORT_ADDRESS = "support@learnwithalphonso.com"
    const val BODY = "If you think this is a mistake, contact support at $SUPPORT_ADDRESS."
    const val MESSAGE = "$TITLE $BODY"

    /** True for the banned sign-in / refresh error and the API's `account_suspended`; never for a wrong code or an outage. */
    fun isSuspended(e: Exception): Boolean {
        val message = (e as? SupabaseAuthError.Server)?.serverMessage ?: return false
        return message.contains("banned", ignoreCase = true) || message.contains(API_ERROR)
    }

    // The full-screen view (backlog item 87). The iOS Kit's AccountSuspension carries the same labels.
    const val CONTACT_TITLE = "Contact support"
    const val SIGN_OUT_TITLE = "Sign out"
    const val CONTACT_URL = "mailto:$SUPPORT_ADDRESS"
    const val CONTACT_LABEL = "$CONTACT_TITLE. Opens an email to $SUPPORT_ADDRESS."
    const val SIGN_OUT_LABEL = "$SIGN_OUT_TITLE. Returns to the sign-in screen."

    /**
     * The optional reason line: the API sends none today (the web screen has none), so this is null unless a future
     * response carries one. Blank counts as none.
     */
    fun reasonLine(reason: String?): String? = reason?.trim()?.takeIf { it.isNotEmpty() }
}
