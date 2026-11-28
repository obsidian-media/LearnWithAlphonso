package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.logic.PhraseCheck
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

class PhraseSayItTest {
    private fun text(r: PhraseCheck.Result, again: List<String> = emptyList()) = PhraseSayIt.resultText(PhraseCheck.Outcome(r, again))

    @Test fun `the three results read as the web reads them`() {
        assertEquals("Understood clearly", text(PhraseCheck.Result.CLEAR))
        assertEquals("Mostly understood: listen to “learn” again", text(PhraseCheck.Result.MOSTLY, listOf("learn")))
        assertEquals("Mostly understood: listen to “to” and “learn” again", text(PhraseCheck.Result.MOSTLY, listOf("to", "learn")))
        assertEquals("Not understood yet: try again", text(PhraseCheck.Result.NOT_YET))
    }

    @Test fun `silence is a result not an error and no line is a score`() {
        val silent = PhraseCheck.check("Good morning", "", null)
        assertEquals("Not understood yet: try again", PhraseSayIt.resultText(silent))
        val all = listOf(PhraseSayIt.CHECKING, PhraseSayIt.LISTENING, PhraseSayIt.FRAMING, PhraseSayIt.NOT_YET, PhraseSayIt.CHECK_FAILED)
        all.forEach { assertFalse(it.contains("score", ignoreCase = true) || it.contains("wrong", ignoreCase = true)) }
    }

    @Test fun `the mic is named for the phrase it says`() {
        assertEquals("Say: Nice to meet you", PhraseSayIt.micLabel("Nice to meet you"))
        assertEquals("Listening…", PhraseSayIt.LISTENING)
    }
}
