package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.sin

class WaveformTest {
    /**
     * The fixtures shared with src/lib/waveform.ts (WAVEFORM_FIXTURES) and LearnWithAlphonsoKit's WaveformTests.
     * Dyadic values, so the result is exact on every platform.
     */
    @Test fun sharedFixturesGiveTheSameBarsAsTheWebAndIos() {
        assertArrayEquals(doubleArrayOf(0.25, 1.0, 0.0625, 0.5), Waveform.peaks(floatArrayOf(0.125f, -0.25f, 0.5f, -1f, 0f, 0.0625f, -0.5f, 0.25f), 4), 0.0)
        assertArrayEquals(doubleArrayOf(0.0, 1.0, 0.0, 0.5, 0.0, 0.25), Waveform.peaks(floatArrayOf(0.5f, -0.25f, 0.125f), 6), 0.0)
        assertArrayEquals(doubleArrayOf(0.0, 0.0), Waveform.peaks(floatArrayOf(0f, 0f, 0f, 0f), 2), 0.0)
        assertArrayEquals(doubleArrayOf(0.0, 0.0, 0.0), Waveform.peaks(floatArrayOf(), 3), 0.0)
    }

    @Test fun defaultsToTheStandardBarCountWithTheTallestAtOne() {
        val samples = FloatArray(4800) { (sin(it / 7.0) * (1 + (it % 50) / 50.0)).toFloat() }
        val bars = Waveform.peaks(samples)
        assertEquals(Waveform.BARS, bars.size)
        assertEquals(1.0, bars.max(), 0.0)
        assertTrue(bars.all { it in 0.0..1.0 })
    }

    @Test fun signAndScaleAreIgnored() {
        assertArrayEquals(Waveform.peaks(floatArrayOf(0.25f, -0.5f, 1f, -0.125f), 2), Waveform.peaks(floatArrayOf(-2f, 4f, -8f, 1f), 2), 0.0)
    }

    @Test fun aLouderPartIsATallerBar() {
        val samples = FloatArray(10) { 0.1f } + FloatArray(10) { 0.9f }
        val bars = Waveform.peaks(samples, 2)
        assertTrue(bars[0] < bars[1])
    }

    @Test fun slowIsThreeQuartersSpeed() {
        assertEquals(0.75f, Waveform.SLOW_RATE)
    }
}
