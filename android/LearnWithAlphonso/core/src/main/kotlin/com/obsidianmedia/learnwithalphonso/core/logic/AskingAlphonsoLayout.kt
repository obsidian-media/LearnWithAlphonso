package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * How big Alphonso is beside a question's prompt: a large figure, a small avatar, or absent (null). Mirrors
 * src/lib/asking-alphonso.ts (web) and `AskingAlphonsoLayout` in the iOS Kit; only the screen-height thresholds
 * differ by platform. Screen height picks the step; what is already on the screen can only shrink it.
 */
object AskingAlphonsoLayout {
    /** At or below this many dp (a compact phone) he is dropped. */
    const val NONE_AT_OR_BELOW_DP = 640

    /** From this many dp (about a 6.1 in phone and up) he is the large figure. */
    const val LARGE_FROM_DP = 720

    /** From this font scale ("Large" text) the bubble needs the whole width. */
    const val NONE_FROM_FONT_SCALE = 1.3f

    const val LARGE_SIZE_DP = 120
    const val SMALL_SIZE_DP = 56

    /** A prompt longer than this many characters wraps to three or more lines beside a large portrait. */
    const val LONG_PROMPT_CHARS = 60

    /** @param hasMedia the card also shows an image, plays audio, or has a listening or speak control. */
    fun portraitSizeDp(screenHeightDp: Int, fontScale: Float, promptLength: Int, hasMedia: Boolean): Int? {
        val crowd = (if (promptLength > LONG_PROMPT_CHARS) 1 else 0) + (if (hasMedia) 1 else 0)
        return when {
            fontScale >= NONE_FROM_FONT_SCALE -> null
            screenHeightDp <= NONE_AT_OR_BELOW_DP -> null
            crowd >= 2 -> null
            screenHeightDp >= LARGE_FROM_DP && crowd == 0 -> LARGE_SIZE_DP
            else -> SMALL_SIZE_DP
        }
    }
}
