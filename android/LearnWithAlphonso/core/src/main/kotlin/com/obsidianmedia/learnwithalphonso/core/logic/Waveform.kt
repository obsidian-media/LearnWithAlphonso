package com.obsidianmedia.learnwithalphonso.core.logic

import kotlin.math.abs

/**
 * The bars of a "Hear you vs Alphonso" waveform in Say it right. Mirrors src/lib/waveform.ts (web) and
 * LearnWithAlphonsoKit/Waveform.swift (iOS); the three test suites assert the same fixtures.
 */
object Waveform {
    /** How many bars each waveform draws (the spec says about 40 to 60). */
    const val BARS = 48

    /** "Say it slower": the model replays at this fraction of normal speed, on the device (no second /api/tts call). */
    const val SLOW_RATE = 0.75f

    /**
     * Downsamples audio samples (any scale, sign ignored) to [bars] heights in 0..1: the samples are cut into [bars]
     * equal buckets (bucket i is `[i*n/bars, (i+1)*n/bars)` in whole-number arithmetic), each bucket's height is its
     * loudest absolute sample, and the row is divided by the loudest bucket so the tallest bar is 1. An empty bucket,
     * a silent clip and no samples at all give 0 (the screen draws those as a flat row).
     */
    fun peaks(samples: FloatArray, bars: Int = BARS): DoubleArray {
        val count = maxOf(0, bars)
        val out = DoubleArray(count)
        val n = samples.size
        if (n == 0 || count == 0) return out
        var loudest = 0.0
        for (i in 0 until count) {
            val from = ((i.toLong() * n) / count).toInt()
            val to = (((i + 1).toLong() * n) / count).toInt()
            var peak = 0.0
            for (j in from until to) {
                val a = abs(samples[j].toDouble())
                if (a > peak) peak = a
            }
            out[i] = peak
            if (peak > loudest) loudest = peak
        }
        if (loudest == 0.0) return out
        for (i in out.indices) out[i] = out[i] / loudest
        return out
    }
}
