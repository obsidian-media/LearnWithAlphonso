package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/** WCAG contrast ratio of two opaque colours (1 to 21). */
fun contrastRatio(a: Color, b: Color): Double {
    val la = a.luminance().toDouble()
    val lb = b.luminance().toDouble()
    return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
}

/**
 * The glyph colour on a [AlphonsoTokens.Colors.choice] face (a play button, a check in a filled circle). Choice is dark in
 * the light themes and light in the night themes, so a fixed white fails 4.5:1 at night (about 2.4:1 on Royal night): this
 * picks white or the hero navy, whichever reads better on this palette's choice. Android-only helper; the shared
 * tokens.json is untouched.
 */
val AlphonsoTokens.Colors.onChoice: Color
    get() = if (contrastRatio(onHero, choice) >= contrastRatio(heroB, choice)) onHero else heroB
