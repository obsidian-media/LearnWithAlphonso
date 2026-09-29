package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswerEs.matches
import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswerEs.normalise
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors copied one-to-one from src/lib/spoken-answer-es.test.ts. */
class SpokenAnswerEsTest {
    @Test
    fun `strips punctuation and case`() {
        assertEquals(normalise("hola como estas"), normalise("¡Hola! ¿Cómo estás?"))
    }

    @Test
    fun `folds accents rather than deleting them`() {
        assertEquals(normalise("esta"), normalise("está"))
        assertEquals(normalise("anos"), normalise("años"))
        assertNotEquals(normalise("no"), normalise("sí"))
        assertEquals(normalise("si"), normalise("sí"))
    }

    @Test
    fun `collapses whitespace`() {
        assertEquals(normalise("hola senora"), normalise("  hola   señora "))
    }

    @Test
    fun `drops a silent h`() {
        assertEquals(normalise("ola"), normalise("hola"))
        assertEquals(normalise("aora"), normalise("ahora"))
        assertEquals(normalise("zanaoria"), normalise("zanahoria"))
        assertEquals(normalise("tengo dos ermanas"), normalise("tengo dos hermanas"))
    }

    @Test
    fun `keeps the h in the ch digraph, which is not silent`() {
        assertNotEquals(normalise("cico"), normalise("chico"))
        assertNotEquals(normalise("coce"), normalise("coche"))
        assertEquals(normalise("chico"), normalise("chico"))
    }

    @Test
    fun `accepts the expected phrase however the silent h was transcribed`() {
        assertTrue(matches("Hola, ¿qué tal?", "hola que tal"))
        assertTrue(matches("ola que tal", "Hola, ¿qué tal?"))
    }

    @Test
    fun `forgives a leading filler word`() {
        assertTrue(matches("eh, hola", "Hola."))
    }

    @Test
    fun `rejects a different sentence`() {
        assertFalse(matches("el esta cansado", "Ella está cansada."))
    }

    @Test
    fun `rejects a partial attempt`() {
        assertFalse(matches("hola", "Hola, ¿cómo estás?"))
    }

    @Test
    fun `treats an empty transcript as no answer, not a wrong one`() {
        assertFalse(matches("", "Hola."))
        assertFalse(matches("   ", "Hola."))
    }

    @Test
    fun `matches a number said as a word against the numeral Deepgram returns`() {
        assertTrue(matches("tengo dos hermanos", "Tengo 2 hermanos."))
        assertTrue(matches("son las cinco", "Son las 5."))
        assertTrue(matches("tengo veinte anos", "Tengo veinte años."))
        assertTrue(matches("tengo dieciseis anos", "Tengo dieciséis años."))
        assertTrue(matches("hay veintidos personas", "Hay veintidós personas."))
    }

    @Test
    fun `still tells two different numbers apart`() {
        assertFalse(matches("tengo tres hermanos", "Tengo dos hermanos."))
    }

    @Test
    fun `does NOT map un or una to 1 because it is the article far more often than the number`() {
        assertNotEquals(normalise("1 gato"), normalise("un gato"))
        assertNotEquals(normalise("1 casa"), normalise("una casa"))
        assertEquals(normalise("un gato"), normalise("un gato"))
    }

    @Test
    fun `matches round hundred and thousand`() {
        assertTrue(matches("hay cien personas", "Hay 100 personas."))
        assertTrue(matches("hay mil personas", "Hay 1000 personas."))
    }

    @Test
    fun `no real word can hide an eh substring once the silent h is gone`() {
        assertEquals(normalise("deesa"), normalise("dehesa"))
    }
}
