package com.obsidianmedia.learnwithalphonso.ui.hector

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Final QA follow-up: the composer cleared the draft BEFORE `vm.sendTyped`, so a send refused because a turn was still
 * under way (canSend false) lost what the learner typed. The draft now clears only when the send is taken, as on iPhone.
 */
class HectorSubmitDraftTest {
    @Test
    fun `a refused send keeps the typed text in the field`() {
        val sent = ArrayList<String>()
        assertEquals("Ayer fui al mercado", submitDraft("Ayer fui al mercado") { sent += it; false })
        assertEquals(listOf("Ayer fui al mercado"), sent)
    }

    @Test
    fun `a taken send clears the field`() {
        assertEquals("", submitDraft("Ayer fui al mercado") { true })
    }
}
