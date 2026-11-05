package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Mirrors src/lib/password-policy.ts: a new account needs at least [MIN_NEW_LENGTH] characters. The auth server's own
 * minimum is the control; this only stops the form before the request. Signing in to an existing account keeps the
 * old minimum, so older, shorter passwords still work.
 */
object PasswordPolicy {
    const val MIN_NEW_LENGTH = 10
    private const val MIN_SIGN_IN_LENGTH = 6

    fun longEnoughToCreate(password: String): Boolean = password.length >= MIN_NEW_LENGTH

    fun longEnoughToSignIn(password: String): Boolean = password.length >= MIN_SIGN_IN_LENGTH
}
