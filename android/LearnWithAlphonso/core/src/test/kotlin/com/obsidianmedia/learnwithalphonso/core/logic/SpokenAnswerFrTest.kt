package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswerFr.matches
import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswerFr.normalise
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors copied one-to-one from src/lib/spoken-answer-fr.test.ts. */
class SpokenAnswerFrTest {
    @Test
    fun `strips punctuation and case`() {
        assertEquals(normalise("bonjour comment allez vous"), normalise("Bonjour, Comment allez-vous ?!"))
    }

    @Test
    fun `folds accents rather than deleting them`() {
        assertEquals(normalise("l'eleve"), normalise("l'élève"))
        assertEquals(normalise("a bientot"), normalise("à bientôt"))
    }

    @Test
    fun `collapses whitespace`() {
        assertEquals(normalise("bonjour madame"), normalise("  bonjour   madame "))
    }

    @Test
    fun `treats an elided form and its space-separated spelling as the same`() {
        assertEquals(normalise("jai faim"), normalise("j'ai faim"))
        assertEquals(normalise("j ai faim"), normalise("j'ai faim"))
        assertEquals(normalise("l ecole"), normalise("l'école"))
        assertEquals(normalise("c est"), normalise("c'est"))
        assertEquals(normalise("qu est ce que c est"), normalise("qu'est-ce que c'est"))
    }

    @Test
    fun `elides si only before il or ils, not before other vowel-initial words`() {
        assertEquals(normalise("s il vous plait"), normalise("s'il vous plaît"))
        assertEquals(normalise("s ils viennent"), normalise("s'ils viennent"))
        assertNotEquals(normalise("s elle vient"), normalise("si elle vient"))
        assertEquals(normalise("si elle vient"), normalise("si elle vient"))
    }

    @Test
    fun `accepts the expected phrase however the elision was transcribed`() {
        assertTrue(matches("J'ai faim.", "j'ai faim"))
        assertTrue(matches("j ai faim", "J'ai faim."))
        assertTrue(matches("jai faim", "J'ai faim."))
    }

    @Test
    fun `forgives a leading filler word`() {
        assertTrue(matches("euh, bonjour", "Bonjour."))
        assertTrue(matches("hum bonjour", "Bonjour."))
    }

    @Test
    fun `rejects a different sentence`() {
        assertFalse(matches("il est fatigué", "Elle est fatiguée."))
    }

    @Test
    fun `rejects a partial attempt`() {
        assertFalse(matches("bonjour", "Bonjour, comment allez-vous ?"))
    }

    @Test
    fun `treats an empty transcript as no answer, not a wrong one`() {
        assertFalse(matches("", "Bonjour."))
        assertFalse(matches("   ", "Bonjour."))
    }

    @Test
    fun `matches a number said as a word against the numeral Deepgram returns`() {
        assertTrue(matches("j'ai deux frères", "J'ai 2 frères."))
        assertTrue(matches("il est cinq heures", "Il est 5 heures."))
    }

    @Test
    fun `still tells two different numbers apart`() {
        assertFalse(matches("j'ai trois frères", "J'ai deux frères."))
    }

    @Test
    fun `does NOT map un or une to 1 because it is the article far more often than the number`() {
        assertNotEquals(normalise("1 chat"), normalise("un chat"))
        assertEquals(normalise("un chat"), normalise("un chat"))
    }

    @Test
    fun `does not corrupt real words that contain a filler as a substring`() {
        assertTrue(matches("un être humain", "Un être humain."))
        assertTrue(matches("il est de bonne humeur", "Il est de bonne humeur."))
    }
}
