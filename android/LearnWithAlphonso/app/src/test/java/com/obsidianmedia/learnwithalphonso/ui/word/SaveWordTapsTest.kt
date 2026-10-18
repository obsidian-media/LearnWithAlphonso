package com.obsidianmedia.learnwithalphonso.ui.word

import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SaveWordTapsTest {
    private val request = SaveWordRequest("tea", "I like tea.", "en")

    @Test
    fun `a screen opened later never reuses the id of an earlier one`() {
        // The transcript sheet leaves the composition when it closes, and the next one starts a new SaveWordTaps. A counter
        // that restarts there gave the first tap of every transcript the same id, and the sheet keyed by it showed the
        // PREVIOUS word with its "Saved" result and never sent the new one.
        val first = SaveWordTaps().open(request)
        val afterReopening = SaveWordTaps().open(SaveWordRequest("coffee", "I like coffee.", "en"))
        assertNotEquals(first.id, afterReopening.id)
    }

    @Test
    fun `every tap gets its own id, even for the same word`() {
        val taps = SaveWordTaps()
        val ids = List(20) { taps.open(request).id }
        assertEquals(20, ids.toSet().size)
    }

    @Test
    fun `the open request carries what was tapped`() {
        assertEquals(request, SaveWordTaps { "fixed" }.open(request).request)
        assertEquals("fixed", SaveWordTaps { "fixed" }.open(request).id)
    }
}
