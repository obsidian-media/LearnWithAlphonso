package com.obsidianmedia.learnwithalphonso.core.avatar

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

enum class EarSide { LEFT, RIGHT }

/** A source of numbers in [0, 1), injectable so the idle life is deterministic in tests. */
fun interface RandomSource { fun nextUnit(): Double }

/** SplitMix64: the same seed always gives the same stream, and the same one as the Swift and TypeScript ports. */
class SeededRandom(seed: ULong) : RandomSource {
    private var state = seed
    override fun nextUnit(): Double {
        state += 0x9E3779B97F4A7C15uL
        var z = state
        z = (z xor (z shr 30)) * 0xBF58476D1CE4E5B9uL
        z = (z xor (z shr 27)) * 0x94D049BB133111EBuL
        z = z xor (z shr 31)
        return (z shr 11).toDouble() * (1.0 / 9_007_199_254_740_992.0)
    }
}

/**
 * When the ears twitch and the glint sweeps while he idles. Ears: every 4 to 9 seconds, one random side for about
 * 160 ms. Glint: every 6 to 12 seconds, a sweep of about 700 ms. Drive it with a monotonic clock; [advance] can jump
 * any distance and catches up.
 */
class AvatarIdleScheduler(private val random: RandomSource) {
    private var nextEar: Double
    private var earStart = Double.NEGATIVE_INFINITY
    private var earSide = EarSide.LEFT
    private var nextGlint: Double
    private var glintStart = Double.NEGATIVE_INFINITY

    var twitchingEar: EarSide? = null
        private set

    /** 0 at the start of a sweep, up to just under 1; null when no sweep is running. */
    var glintProgress: Double? = null
        private set

    init {
        nextEar = interval(4.0, 9.0)
        nextGlint = interval(6.0, 12.0)
    }

    private fun interval(low: Double, high: Double): Double = low + random.nextUnit() * (high - low)

    fun advance(now: Double) {
        while (now >= nextEar) {
            earStart = nextEar
            earSide = if (random.nextUnit() < 0.5) EarSide.LEFT else EarSide.RIGHT
            nextEar = earStart + interval(4.0, 9.0)
        }
        twitchingEar = if (now >= earStart && now < earStart + EAR_TWITCH_DURATION) earSide else null

        while (now >= nextGlint) {
            glintStart = nextGlint
            nextGlint = glintStart + interval(6.0, 12.0)
        }
        val progress = (now - glintStart) / GLINT_DURATION
        glintProgress = if (progress >= 0 && progress < 1) progress else null
    }

    companion object {
        const val EAR_TWITCH_DURATION = 0.16
        const val GLINT_DURATION = 0.7
    }
}

/** The slow, continuous body motion: a small breath and a slow sway about the bottom centre. */
object AvatarIdleMotion {
    const val BREATH_PERIOD = 4.2
    const val SWAY_PERIOD = 7.0

    /** Degrees, within plus or minus 0.45. */
    fun swayDegrees(time: Double): Double = 0.45 * sin(2 * PI * time / SWAY_PERIOD)

    /** Scale factors from 1 up to 1.007 across and 1.011 tall. */
    fun breathScale(time: Double): Pair<Double, Double> {
        val phase = (1 - cos(2 * PI * time / BREATH_PERIOD)) / 2
        return (1 + 0.007 * phase) to (1 + 0.011 * phase)
    }
}
