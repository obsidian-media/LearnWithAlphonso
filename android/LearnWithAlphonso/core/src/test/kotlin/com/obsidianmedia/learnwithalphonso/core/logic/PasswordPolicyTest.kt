package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PasswordPolicyTest {
    @Test
    fun `a new account needs at least 10 characters`() {
        assertFalse(PasswordPolicy.longEnoughToCreate("short1234"))
        assertTrue(PasswordPolicy.longEnoughToCreate("long-enough"))
    }

    @Test
    fun `an existing account with a 6-character password can still sign in`() {
        assertTrue(PasswordPolicy.longEnoughToSignIn("abc123"))
        assertFalse(PasswordPolicy.longEnoughToSignIn("abc12"))
    }
}
